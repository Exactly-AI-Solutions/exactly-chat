/**
 * Reranker calibration (Mitch's calibration-control gate, 2026-09-10/11).
 *
 *   npm run calibrate-rerank -- --client <client_id>
 *
 * Self-contained, like the other offline scripts in this directory (ingest.ts,
 * mint-key.ts) — the DB client, the candidate RPC calls, and the rerank call
 * are reimplemented locally rather than importing src/lib/data.ts or
 * src/lib/retrieval/hybrid.ts, because those are guarded by `import
 * "server-only"`, which hard-throws outside Next.js's own bundler by design.
 * The rerank call below (model, schema, prompt) is kept byte-identical to
 * `rerankWithLLM` in src/lib/retrieval/hybrid.ts — this measures the actual
 * mechanism that runs in production, not an approximation of it.
 *
 * Query set is independent of the Comm-Fit smoke probes (S1–S6) and both
 * 14-question sets (retired and blind) — see
 * kb/comm-fit/test_1/comm-fit-reranker-calibration-plan-2026-09-11.md for
 * provenance and exclusion rationale. Runs with no cutoff (score 0) so the
 * full distribution is visible; reports latency + score stats so pool size /
 * final top-k / cutoff / timeout are chosen from real data, not guessed.
 * This file IS part of the calibration record.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { embed, generateObject, jsonSchema } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function parseArgs(): Record<string, string | undefined> {
  const args = process.argv.slice(2);
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      out[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return out;
}

const EMBEDDING_MODEL = "text-embedding-3-small"; // must match config.embedding.model (ADR-0003)
const RERANK_MODEL = "claude-haiku-4-5-20251001"; // must match src/lib/retrieval/hybrid.ts
const RERANK_PREVIEW_CHARS = 260;
const CANDIDATE_POOL_SIZE = 40;

// --- Source (a): visitor lines from client-config/comm-fit/qa-samples.md ---
// Authored earlier as voice/shape reference, predating the smoke process.
// Two lines dropped as too close to a tested topic: "why don't you tell me
// what your capabilities are?" (S6-shaped) and the parks-department/public-
// agency line (BuyBoard/procurement-adjacent).
const QA_SAMPLES_QUERIES = [
  "want to disinfect my facility",
  "no. i want more info - do you have a spec sheet? what spray do you use and how long do i need to close my gym for?",
  "Our fitness room is always packed. We're thinking we need more equipment.",
  "We're redoing our fitness room and thinking about carpet — seems like it'd help with the noise.",
  "We're building a new gym from scratch — apartment project opening next spring.",
  "What brands do you carry?",
  "Do you do the flooring too?",
  "can i get added to your mailing list?",
  "Our gym floor isn't holding up.",
  "We've got three machines down. Is it worth having someone come out?",
  "Two treadmills are down and we've got an inspection Friday.",
  "we open in like 6 weeks and honestly this is kind of a mess. gym isnt really done. architect has something on the plan but we havent picked flooring or most of the equipment yet and ownership keeps changing stuff. can you even do anything that fast",
  "I want to buy a treadmill for my house.",
  "How much for a full gym build-out?",
  "Why Comm-Fit over anyone else?",
  "what flooring do you have",
  "where can i read more about FitDek Resilience",
  "can i download the spec sheet",
  "does the FitDek Resilience meet ASTM F2772 impact attenuation",
  "what thickness does it come in, in mm",
  "how much does the Hoist HD-3000 weigh",
];

// --- Source (b): synthetic queries on corpus areas none of the tested sets touch ---
const SYNTHETIC_QUERIES = [
  "who manufactures the cardio equipment you sell",
  "what are your ADA compliance requirements for a fitness room",
  "what equipment do you recommend for a senior living fitness center",
  "what's the warranty on your flooring products",
  "how long does it take to get a replacement part for a broken treadmill",
  "what are your payment and deposit terms",
];

const QUERIES = [...QA_SAMPLES_QUERIES, ...SYNTHETIC_QUERIES];

// Rank-only response — kept byte-identical in shape to rerankResponseSchema
// in src/lib/retrieval/hybrid.ts (the 2026-09-12 latency fix: listing only
// the relevant candidates, most-relevant-first, instead of scoring every
// candidate, cut output tokens ~40x and latency from 14–40s to ~1.5–1.8s at
// a 40–65 candidate pool).
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

async function main(): Promise<void> {
  const { client: clientId = "e18a30df-d55d-4514-905c-50725f7dc9d0" } = parseArgs();
  const db = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const latencies: number[] = [];
  const allScores: number[] = [];
  const rows: { query: string; ms: number; n: number; top3: { id: string; score: number }[] }[] = [];

  for (const query of QUERIES) {
    const start = Date.now();

    const { embedding } = await embed({ model: openai.textEmbeddingModel(EMBEDDING_MODEL), value: query });
    const [dense, sparse] = await Promise.all([
      db.rpc("match_kb_chunks_dense_candidates", {
        p_client_id: clientId,
        p_query_embedding: embedding,
        p_candidate_count: CANDIDATE_POOL_SIZE,
      }),
      db.rpc("match_kb_chunks_sparse_candidates", {
        p_client_id: clientId,
        p_query_text: query,
        p_candidate_count: CANDIDATE_POOL_SIZE,
      }),
    ]);
    if (dense.error) throw dense.error;
    if (sparse.error) throw sparse.error;

    type Row = { id: string; content: string };
    const seen = new Map<string, string>();
    for (const r of (dense.data ?? []) as Row[]) seen.set(r.id, r.content);
    for (const r of (sparse.data ?? []) as Row[]) seen.set(r.id, r.content);
    const candidates = [...seen.entries()].map(([id, content]) => ({ id, content }));

    let relevantIds: string[] = [];
    if (candidates.length > 0) {
      const previews = candidates.map((c, i) => `[${i + 1}] ${c.content.slice(0, RERANK_PREVIEW_CHARS)}`).join("\n\n");
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
        prompt: `Question: ${query}\n\nPassages:\n${previews}`,
      });
      const seenIdx = new Set<number>();
      for (const i of object.relevant) {
        const c = candidates[i - 1];
        if (!c || seenIdx.has(i)) continue;
        seenIdx.add(i);
        relevantIds.push(c.id);
      }
    }

    const ms = Date.now() - start;
    latencies.push(ms);
    // Synthetic descending score by rank position, purely so the existing
    // distribution/histogram reporting below stays meaningful.
    const scored = relevantIds.map((_, i) => 1 - i / relevantIds.length);
    allScores.push(...scored);
    const top3 = relevantIds.slice(0, 3).map((id, i) => ({ id, score: scored[i] }));
    rows.push({ query, ms, n: candidates.length, top3 });
    console.log(
      `${String(ms).padStart(5)}ms  n=${String(candidates.length).padStart(2)}  relevant=${relevantIds.length}  ${query.slice(0, 55)}`,
    );
  }

  const sortedLat = [...latencies].sort((a, b) => a - b);
  const pct = (p: number) => sortedLat[Math.floor((sortedLat.length - 1) * p)];
  console.log("\n=== latency (embed + dense + sparse + rerank), ms ===");
  console.log(`min=${sortedLat[0]} p50=${pct(0.5)} p95=${pct(0.95)} max=${sortedLat[sortedLat.length - 1]}`);

  const sortedScores = [...allScores].sort((a, b) => a - b);
  const spct = (p: number) => sortedScores[Math.floor((sortedScores.length - 1) * p)];
  console.log("\n=== rerank score distribution (every candidate, every query) ===");
  console.log(
    `n=${sortedScores.length} min=${sortedScores[0]?.toFixed(3)} p10=${spct(0.1)?.toFixed(3)} p50=${spct(0.5)?.toFixed(3)} p90=${spct(0.9)?.toFixed(3)} max=${sortedScores[sortedScores.length - 1]?.toFixed(3)}`,
  );
  const buckets = Array(10).fill(0) as number[];
  for (const s of allScores) buckets[Math.min(9, Math.floor(s * 10))]++;
  console.log("histogram 0.0–1.0 (10 buckets):", buckets.join(" "));

  console.log("\n=== top-3 per query (manual precision spot-check) ===");
  for (const r of rows) {
    console.log(`\n"${r.query.slice(0, 70)}"`);
    for (const t of r.top3) console.log(`  ${t.score.toFixed(3)} ${t.id}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
