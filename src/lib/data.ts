import "server-only";
import { db } from "./supabase";

/**
 * The tenant-scoped data-access seam (ADR-0004).
 *
 * This is the ONLY sanctioned path to read or write tenant-owned data. Every
 * method here injects the bound client's id, so nothing in this module can
 * touch another client's rows — the "you can't forget the filter" guarantee is
 * by construction, not by discipline. Obtain an instance via `dataForClient`;
 * never query `clients` / `conversations` / `messages` / `kb_chunks` directly
 * elsewhere.
 *
 * Resolving *which* client a request belongs to (API-key lookup) is a
 * deliberately cross-client operation and lives in the auth module (Phase 5),
 * not here — by the time you have a `ClientData`, the tenant is already known.
 */

/**
 * Whether this client can book meetings in-chat (the Calendly cue), parsed from
 * `widget_config.scheduler`. `enabled` gates the producer-side prompt
 * instruction; `provider` is informational for the widget. Absent = off.
 */
export type SchedulerConfig = {
  enabled: boolean;
  provider: string | null;
};

/**
 * Hybrid (dense + sparse + rerank) retrieval config, parsed from
 * `widget_config.retrieval`. Absent or `mode !== "hybrid_rerank"` keeps a
 * client on the legacy path (`config.retrieval` in `@/config`) untouched —
 * this is a per-client opt-in, not a global switch (ADR pending, 2026-09).
 */
export type RetrievalConfig = {
  mode: "hybrid_rerank" | "dense_legacy";
  candidatePoolSize: number;
  finalTopK: number;
  rerankCutoff: number;
  timeoutMs: number;
  breaker: { failureThreshold: number; windowMs: number; cooldownMs: number };
};

const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  mode: "dense_legacy",
  candidatePoolSize: 40,
  // Calibrated 2026-09-11/12 against 27 queries independent of the smoke/
  // blind sets (kb/comm-fit/test_1/comm-fit-reranker-calibration-plan-*.md):
  // p50=2268ms p95=2843ms max=4381ms for the full rerank pipeline (embed +
  // dense + sparse + rerank) at pool sizes of 49–75 candidates. timeoutMs
  // gives ~37% headroom over the observed max.
  finalTopK: 8,
  // Not applied by the current reranker (src/lib/retrieval/hybrid.ts,
  // 2026-09-12): the model lists only the candidates it judges relevant,
  // most-relevant-first, so inclusion in that list IS the cutoff — there is
  // no separate numeric score to threshold. Kept in the config shape for a
  // future mechanism (e.g. a cross-encoder reranker) that would use it.
  rerankCutoff: 0.35,
  timeoutMs: 6000,
  breaker: { failureThreshold: 3, windowMs: 30_000, cooldownMs: 60_000 },
};

/** Parse the `retrieval` block out of a client's widget_config jsonb. */
function parseRetrievalConfig(widgetConfig: unknown): RetrievalConfig {
  const raw = (widgetConfig as { retrieval?: unknown } | null)?.retrieval;
  if (!raw || typeof raw !== "object") return DEFAULT_RETRIEVAL_CONFIG;
  const r = raw as Partial<Record<keyof RetrievalConfig, unknown>>;
  const breakerRaw = (r.breaker ?? {}) as Partial<RetrievalConfig["breaker"]>;
  return {
    mode: r.mode === "hybrid_rerank" ? "hybrid_rerank" : "dense_legacy",
    candidatePoolSize:
      typeof r.candidatePoolSize === "number" ? r.candidatePoolSize : DEFAULT_RETRIEVAL_CONFIG.candidatePoolSize,
    finalTopK: typeof r.finalTopK === "number" ? r.finalTopK : DEFAULT_RETRIEVAL_CONFIG.finalTopK,
    rerankCutoff: typeof r.rerankCutoff === "number" ? r.rerankCutoff : DEFAULT_RETRIEVAL_CONFIG.rerankCutoff,
    timeoutMs: typeof r.timeoutMs === "number" ? r.timeoutMs : DEFAULT_RETRIEVAL_CONFIG.timeoutMs,
    breaker: {
      failureThreshold:
        typeof breakerRaw.failureThreshold === "number"
          ? breakerRaw.failureThreshold
          : DEFAULT_RETRIEVAL_CONFIG.breaker.failureThreshold,
      windowMs: typeof breakerRaw.windowMs === "number" ? breakerRaw.windowMs : DEFAULT_RETRIEVAL_CONFIG.breaker.windowMs,
      cooldownMs:
        typeof breakerRaw.cooldownMs === "number" ? breakerRaw.cooldownMs : DEFAULT_RETRIEVAL_CONFIG.breaker.cooldownMs,
    },
  };
}

export type ClientConfig = {
  id: string;
  name: string;
  allowedOrigins: string[];
  guidelines: string;
  qaSamples: string;
  knowledgeBase: string;
  scheduler: SchedulerConfig;
  retrieval: RetrievalConfig;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type KbMatch = {
  id: string;
  content: string;
  sourceFilename: string | null;
  sourcePage: number | null;
  similarity: number;
};

export type DenseCandidate = {
  id: string;
  content: string;
  sourceFilename: string | null;
  sourcePage: number | null;
  denseScore: number;
  denseRank: number;
};

export type SparseCandidate = {
  id: string;
  content: string;
  sourceFilename: string | null;
  sourcePage: number | null;
  sparseScore: number;
  sparseRank: number;
};

export type WidgetConfig = {
  openingBubbles: string[];
  chips: string[];
  scheduler: SchedulerConfig;
};

/** Parse the `scheduler` block out of a client's widget_config jsonb. */
function parseScheduler(widgetConfig: unknown): SchedulerConfig {
  const raw = (widgetConfig as { scheduler?: unknown } | null)?.scheduler;
  if (!raw || typeof raw !== "object") return { enabled: false, provider: null };
  const s = raw as { enabled?: unknown; provider?: unknown };
  return {
    enabled: s.enabled === true,
    provider: typeof s.provider === "string" ? s.provider : null,
  };
}

export class ClientData {
  constructor(private readonly clientId: string) {}

  /**
   * The client's config: Domain Whitelist + wholesale prompt content, plus the
   * scheduler capability (from widget_config) since it gates a prompt section.
   */
  async getClient(): Promise<ClientConfig | null> {
    const { data, error } = await db()
      .from("clients")
      .select(
        "id, name, allowed_origins, guidelines, qa_samples, knowledge_base, widget_config",
      )
      .eq("id", this.clientId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      allowedOrigins: data.allowed_origins ?? [],
      guidelines: data.guidelines ?? "",
      qaSamples: data.qa_samples ?? "",
      knowledgeBase: data.knowledge_base ?? "",
      scheduler: parseScheduler(data.widget_config),
      retrieval: parseRetrievalConfig(data.widget_config),
    };
  }

  /**
   * The client's widget opening config (bubbles + chips). Degrades to empty if
   * the widget_config column isn't present yet (pre-migration 0004), so the
   * demo still works without an opening.
   */
  async getWidgetConfig(): Promise<WidgetConfig> {
    const { data, error } = await db()
      .from("clients")
      .select("widget_config")
      .eq("id", this.clientId)
      .maybeSingle();
    if (error) return { openingBubbles: [], chips: [], scheduler: { enabled: false, provider: null } };
    const cfg = (data?.widget_config ?? {}) as Partial<WidgetConfig>;
    return {
      openingBubbles: Array.isArray(cfg.openingBubbles) ? cfg.openingBubbles : [],
      chips: Array.isArray(cfg.chips) ? cfg.chips : [],
      scheduler: parseScheduler(data?.widget_config),
    };
  }

  /** Mint a new conversation for this client; returns its unguessable id. */
  async createConversation(): Promise<string> {
    const { data, error } = await db()
      .from("conversations")
      .insert({ client_id: this.clientId })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  /** True only if the conversation exists AND belongs to this client. */
  async conversationExists(conversationId: string): Promise<boolean> {
    const { data, error } = await db()
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("client_id", this.clientId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  /** Full message history for a conversation, oldest first. */
  async listMessages(conversationId: string): Promise<ConversationMessage[]> {
    const { data, error } = await db()
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .eq("client_id", this.clientId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ConversationMessage[];
  }

  /** Append one message and bump the conversation's freshness. */
  async appendMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
  ): Promise<void> {
    const insert = await db().from("messages").insert({
      conversation_id: conversationId,
      client_id: this.clientId,
      role,
      content,
    });
    if (insert.error) throw insert.error;

    const touch = await db()
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("client_id", this.clientId);
    if (touch.error) throw touch.error;
  }

  /** Tenant-scoped similarity search over this client's Knowledge Base. */
  async matchKbChunks(
    queryEmbedding: number[],
    matchCount: number,
    similarityThreshold: number,
  ): Promise<KbMatch[]> {
    const { data, error } = await db().rpc("match_kb_chunks", {
      p_client_id: this.clientId,
      p_query_embedding: queryEmbedding,
      p_match_count: matchCount,
      p_similarity_threshold: similarityThreshold,
    });
    if (error) throw error;
    type Row = {
      id: string;
      content: string;
      source_filename: string | null;
      source_page: number | null;
      similarity: number;
    };
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      content: r.content,
      sourceFilename: r.source_filename,
      sourcePage: r.source_page,
      similarity: r.similarity,
    }));
  }

  /**
   * Dense candidate generation for hybrid retrieval (0005): cosine similarity,
   * gated only by a low sanity floor (not a precision floor — see 0005's
   * header). Precision comes from the reranker/RRF ordering applied by the
   * caller, not this query.
   */
  async matchDenseCandidates(
    queryEmbedding: number[],
    candidateCount: number,
    minSimilarity = 0.15,
  ): Promise<DenseCandidate[]> {
    const { data, error } = await db().rpc("match_kb_chunks_dense_candidates", {
      p_client_id: this.clientId,
      p_query_embedding: queryEmbedding,
      p_candidate_count: candidateCount,
      p_min_similarity: minSimilarity,
    });
    if (error) throw error;
    type Row = {
      id: string;
      content: string;
      source_filename: string | null;
      source_page: number | null;
      dense_score: number;
      dense_rank: number;
    };
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      content: r.content,
      sourceFilename: r.source_filename,
      sourcePage: r.source_page,
      denseScore: r.dense_score,
      denseRank: r.dense_rank,
    }));
  }

  /** Sparse candidate generation for hybrid retrieval (0005): Postgres full-text search. */
  async matchSparseCandidates(queryText: string, candidateCount: number): Promise<SparseCandidate[]> {
    const { data, error } = await db().rpc("match_kb_chunks_sparse_candidates", {
      p_client_id: this.clientId,
      p_query_text: queryText,
      p_candidate_count: candidateCount,
    });
    if (error) throw error;
    type Row = {
      id: string;
      content: string;
      source_filename: string | null;
      source_page: number | null;
      sparse_score: number;
      sparse_rank: number;
    };
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      content: r.content,
      sourceFilename: r.source_filename,
      sourcePage: r.source_page,
      sparseScore: r.sparse_score,
      sparseRank: r.sparse_rank,
    }));
  }
}

export function dataForClient(clientId: string): ClientData {
  return new ClientData(clientId);
}
