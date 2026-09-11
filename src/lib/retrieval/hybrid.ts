import "server-only";
import { generateObject, jsonSchema } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { startObservation } from "@langfuse/tracing";
import type { ClientData, DenseCandidate, KbMatch, RetrievalConfig, SparseCandidate } from "@/lib/data";
import { embedQuery } from "@/lib/embedding";

/**
 * Hybrid retrieval: dense (pgvector) + sparse (Postgres FTS) candidate
 * generation, unioned and ordered by a model reranker, with Reciprocal Rank
 * Fusion as the fallback when the reranker is slow, erroring, or unavailable
 * (spec: kb/comm-fit/test_1/comm-fit-rerank-fallback-spec-2026-09-10.md).
 *
 * Per-client opt-in via `RetrievalConfig.mode` (data.ts) — clients not on
 * "hybrid_rerank" are untouched by any of this.
 *
 * The reranker is a model call (Claude Haiku 4.5 via the already-provisioned
 * ANTHROPIC_API_KEY), not a hosted cross-encoder API — see the 2026-09-12
 * addendum to the implementation doc for why, and the calibration plan for
 * how its cutoff/timeout were chosen independent of the smoke/blind sets.
 */

// Pinned (not the unpinned "claude-haiku-4-5" alias) so the reranker's
// calibrated cutoff doesn't silently drift under a model update. Live-verified
// 2026-09-11 against the real API before shipping.
const RERANK_MODEL = "claude-haiku-4-5-20251001";
const RERANK_PREVIEW_CHARS = 260; // enough to catch a chunk's problem-language opening
const RRF_K = 60;

export type UnionedCandidate = {
  id: string;
  content: string;
  sourceFilename: string | null;
  sourcePage: number | null;
  denseRank: number | null;
  denseScore: number | null;
  sparseRank: number | null;
  sparseScore: number | null;
};

export type RetrievalMethod = "rerank" | "rrf";
export type DegradeReason = "timeout" | "http_error" | "ratelimit" | "malformed" | "breaker_open";

/**
 * The `**[CF-XXXXXXXX] Title — STATUS — SECTION**` block id parsed from a
 * chunk's content, for debug/introspection only. The row `id` (a Supabase
 * UUID) is what the rest of the system keys on; it is not what a human
 * reading a capture cross-references against the corpus, so introspection
 * that only showed the UUID would be unusable for its actual purpose.
 */
function parseBlockId(content: string): string | null {
  return content.match(/^\*\*\[([^\]]+)\]/)?.[1] ?? null;
}

/**
 * Field names and shape match the capture spec exactly (Mark, 2026-09-11/12
 * pre-flight: kb/comm-fit/comm-fit-phase-b-run-plan-and-data-2026-09-11_1052.md
 * §2) — snake_case, `id` is the corpus block id (not the internal row UUID,
 * which is not exposed here at all), `rrf_score` and `rerank_score` are
 * separate fields computed independently (RRF is always computed, not only
 * on fallback, so the two can be compared on a normal run), `in_context` is
 * explicit rather than only inferable from `final_rank`, and `rerank_status`
 * is duplicated onto every row rather than carried once at the response's
 * top level — a whole retrieval call shares one method/reason by
 * construction, so "any row degraded" and "the whole probe degraded" agree.
 */
export type HybridDebugEntry = {
  id: string | null;
  source_filename: string | null;
  dense_rank: number | null;
  dense_score: number | null;
  sparse_rank: number | null;
  sparse_score: number | null;
  rrf_score: number | null;
  /** The reranker's inclusion-list position, synthetic — null if RRF ran instead, or the candidate wasn't judged relevant. */
  rerank_score: number | null;
  final_rank: number | null;
  in_context: boolean;
  rerank_status: "ok" | `degraded:${DegradeReason}`;
};

export type HybridResult = {
  chunks: KbMatch[];
  method: RetrievalMethod;
  reason: DegradeReason | null;
  debug: HybridDebugEntry[];
};

// ---------------------------------------------------------------------------
// Per-instance circuit breaker. NOT shared across Vercel/Fluid Compute
// instances — an outage may trip the breaker on some instances and not
// others. Acceptable at current traffic; move to a shared store (e.g. a
// breaker-state row) before this scales past a single low-volume client.
// ---------------------------------------------------------------------------
const breaker = { failures: [] as number[], openedAt: null as number | null };

function breakerIsOpen(cfg: RetrievalConfig["breaker"]): boolean {
  if (breaker.openedAt == null) return false;
  if (Date.now() - breaker.openedAt >= cfg.cooldownMs) {
    breaker.openedAt = null;
    breaker.failures = [];
    return false;
  }
  return true;
}

function breakerRecordFailure(cfg: RetrievalConfig["breaker"]): void {
  const now = Date.now();
  breaker.failures = breaker.failures.filter((t) => now - t < cfg.windowMs);
  breaker.failures.push(now);
  if (breaker.failures.length >= cfg.failureThreshold) breaker.openedAt = now;
}

function breakerRecordSuccess(): void {
  breaker.failures = [];
}

function unionDedupe(dense: DenseCandidate[], sparse: SparseCandidate[]): UnionedCandidate[] {
  const map = new Map<string, UnionedCandidate>();
  for (const d of dense) {
    map.set(d.id, {
      id: d.id,
      content: d.content,
      sourceFilename: d.sourceFilename,
      sourcePage: d.sourcePage,
      denseRank: d.denseRank,
      denseScore: d.denseScore,
      sparseRank: null,
      sparseScore: null,
    });
  }
  for (const s of sparse) {
    const existing = map.get(s.id);
    if (existing) {
      existing.sparseRank = s.sparseRank;
      existing.sparseScore = s.sparseScore;
    } else {
      map.set(s.id, {
        id: s.id,
        content: s.content,
        sourceFilename: s.sourceFilename,
        sourcePage: s.sourcePage,
        denseRank: null,
        denseScore: null,
        sparseRank: s.sparseRank,
        sparseScore: s.sparseScore,
      });
    }
  }
  return [...map.values()];
}

/**
 * Reciprocal Rank Fusion — the degraded-mode ordering. Rank-based (no cosine/
 * ts_rank normalization needed), deterministic, <5ms. A candidate present in
 * both dense and sparse results gets both terms; the sparse signal is never
 * dropped, which is what keeps this fallback from regressing to the
 * dense-only + hard-floor mode the smoke diagnosis found broken.
 */
function rrfOrder(candidates: UnionedCandidate[]): (UnionedCandidate & { score: number })[] {
  return candidates
    .map((c) => {
      let score = 0;
      if (c.denseRank != null) score += 1 / (RRF_K + c.denseRank);
      if (c.sparseRank != null) score += 1 / (RRF_K + c.sparseRank);
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("rerank_timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function classifyRerankError(err: unknown): DegradeReason {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "rerank_timeout") return "timeout";
  if (/rate.?limit|429/i.test(msg)) return "ratelimit";
  if (/schema|parse|invalid|no object generated/i.test(msg)) return "malformed";
  return "http_error";
}

// Rank-only response: the model lists which candidates are relevant, most
// relevant first, and omits the rest — instead of generating a float score
// for every candidate. This is the 2026-09-12 latency fix: calibration found
// the original {id, relevance} schema costs ~40 output tokens/candidate and
// scales latency to 14–40s at a 40–65 candidate pool (measured), because
// most output-token budget goes to scoring candidates that turn out
// irrelevant. Listing only the relevant ones cut a 15-candidate rerank from
// ~3.7s to ~1.5–1.8s, made full-pool (no prefilter) reranking viable at the
// same latency, and needs no schema/candidate-count tuning to stay fast.
const rerankResponseSchema = jsonSchema<{ relevant: number[] }>({
  type: "object",
  properties: {
    relevant: {
      type: "array",
      items: { type: "integer" },
      description: "1-based indices of the relevant passages, most relevant first. Omit irrelevant passages.",
    },
  },
  required: ["relevant"],
});

/**
 * Model-based reranker. Returns candidate ids ordered most-relevant-first;
 * a candidate absent from the result was judged not relevant — the model's
 * inclusion list IS the cutoff (see retrieveHybrid), not a separate
 * post-hoc score threshold. Explicitly instructed to treat conflict/absence
 * representation as relevant — a CONFLICTED block that documents a
 * disagreement rather than stating one settled value is exactly what S1/S3
 * need to retrieve, and a naive "does this answer the question" framing
 * would drop it.
 *
 * Candidates are shown to the model by a local 1-based index, not their real
 * id — generating a short integer per relevant item is far cheaper than
 * generating a ~12-character id string per item, and is most of the latency
 * win (see the schema comment above).
 */
async function rerankWithLLM(queryText: string, candidates: UnionedCandidate[]): Promise<string[]> {
  const previews = candidates
    .map((c, i) => `[${i + 1}] ${c.content.slice(0, RERANK_PREVIEW_CHARS)}`)
    .join("\n\n");

  const { object } = await generateObject({
    model: anthropic(RERANK_MODEL),
    schema: rerankResponseSchema,
    system: [
      "Below are numbered passages. List the numbers of passages genuinely relevant to answering",
      "the visitor's question, ordered most relevant first. Omit passages that are not relevant —",
      "do not list every number.",
      "A passage that documents a conflict, disagreement, or absence directly relevant to the",
      "question is relevant even if it does not state one settled value — representing the",
      "conflict correctly is the goal, not picking a number.",
    ].join(" "),
    prompt: `Question: ${queryText}\n\nPassages:\n${previews}`,
  });

  const seen = new Set<number>();
  const ids: string[] = [];
  for (const i of object.relevant) {
    const candidate = candidates[i - 1];
    // Defensive: an out-of-range or duplicate index from the model is
    // dropped rather than thrown — a slightly wrong ranking is fine, a
    // crashed retrieval on a malformed-but-parseable response is not.
    if (!candidate || seen.has(i)) continue;
    seen.add(i);
    ids.push(candidate.id);
  }
  return ids;
}

/** Best-effort Langfuse retrieval span. Never throws — observability must not break retrieval. */
function emitRetrievalSpan(params: {
  queryText: string;
  method: RetrievalMethod;
  reason: DegradeReason | null;
  debug: HybridDebugEntry[];
}): void {
  try {
    const span = startObservation("retrieval", {}, { asType: "retriever" });
    span.update({
      input: { query: params.queryText },
      output: { method: params.method, reason: params.reason, results: params.debug },
      metadata: { degraded: params.method === "rrf" },
    });
    span.end();
  } catch {
    // Observability is best-effort; a tracing-layer failure must never surface as a retrieval failure.
  }
}

export async function retrieveHybrid(
  data: ClientData,
  queryText: string,
  cfg: RetrievalConfig,
): Promise<HybridResult> {
  const queryEmbedding = await embedQuery(queryText);
  const [dense, sparse] = await Promise.all([
    data.matchDenseCandidates(queryEmbedding, cfg.candidatePoolSize),
    data.matchSparseCandidates(queryText, cfg.candidatePoolSize),
  ]);
  const candidates = unionDedupe(dense, sparse);

  // Always computed — <5ms, and needed on every row (not only fallback rows)
  // so rrf_score and rerank_score are independently comparable on a normal,
  // non-degraded run, per the capture spec.
  const rrfById = new Map(rrfOrder(candidates).map((c) => [c.id, c.score]));

  let ordered: (UnionedCandidate & { score: number })[];
  let method: RetrievalMethod;
  let reason: DegradeReason | null = null;
  let rerankScoreById = new Map<string, number>();

  if (candidates.length === 0) {
    ordered = [];
    method = "rerank";
  } else if (breakerIsOpen(cfg.breaker)) {
    ordered = rrfOrder(candidates);
    method = "rrf";
    reason = "breaker_open";
  } else {
    try {
      const relevantIds = await withTimeout(rerankWithLLM(queryText, candidates), cfg.timeoutMs);
      const byId = new Map(candidates.map((c) => [c.id, c]));
      // Synthetic descending score from rank position, for debug/introspection
      // continuity only — the model's inclusion list is the actual cutoff
      // (rerankCutoff is not applied here; nothing past this point is
      // filtered by score, only by finalTopK). First-place ~1.0, decaying.
      const withScore = relevantIds
        .map((id) => byId.get(id))
        .filter((c): c is UnionedCandidate => c != null)
        .map((c, i, arr) => ({ ...c, score: 1 - i / arr.length }));
      rerankScoreById = new Map(withScore.map((c) => [c.id, c.score]));
      ordered = withScore;
      method = "rerank";
      breakerRecordSuccess();
    } catch (err) {
      reason = classifyRerankError(err);
      ordered = rrfOrder(candidates);
      method = "rrf";
      breakerRecordFailure(cfg.breaker);
      console.error("rerank_degraded", { reason, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // RRF's ordering is already the intended cutoff (nothing below it was a
  // candidate at all); the reranker's inclusion list is likewise already the
  // cutoff (see above) — either way `ordered` needs only a topK truncation.
  const final = ordered.slice(0, cfg.finalTopK);
  const finalIdxById = new Map(final.map((c, i) => [c.id, i]));
  const status: HybridDebugEntry["rerank_status"] = method === "rerank" && reason === null ? "ok" : `degraded:${reason ?? "http_error"}`;

  const debug: HybridDebugEntry[] = candidates.map((c) => {
    const finalIdx = finalIdxById.get(c.id) ?? -1;
    return {
      id: parseBlockId(c.content),
      source_filename: c.sourceFilename,
      dense_rank: c.denseRank,
      dense_score: c.denseScore,
      sparse_rank: c.sparseRank,
      sparse_score: c.sparseScore,
      rrf_score: rrfById.get(c.id) ?? null,
      rerank_score: rerankScoreById.get(c.id) ?? null,
      final_rank: finalIdx === -1 ? null : finalIdx + 1,
      in_context: finalIdx !== -1,
      rerank_status: status,
    };
  });

  emitRetrievalSpan({ queryText, method, reason, debug });

  const chunks: KbMatch[] = final.map((c) => ({
    id: c.id,
    content: c.content,
    sourceFilename: c.sourceFilename,
    sourcePage: c.sourcePage,
    similarity: c.score,
  }));

  return { chunks, method, reason, debug };
}
