/**
 * Central configuration.
 *
 * `env` reads process.env by the exact variable names in `.env`. Access secrets
 * through `requireEnv` at point-of-use so a missing var fails loudly where it
 * matters, not silently at import time.
 *
 * `config` holds tunables (model, thinking, retrieval) so tuning needs no code
 * change beyond this file — see ROADMAP.md Phase 0 and ADR-0005/0006.
 */

export const env = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  // Server-side only. Bypasses RLS by design; the data-access seam enforces
  // client_id isolation instead (ADR-0004). Never expose to the browser.
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY,
  langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY,
  langfuseBaseUrl: process.env.LANGFUSE_BASE_URL,
} as const;

export function requireEnv(name: keyof typeof env): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Retrieval mode (ADR-0008):
 *  - "embeddings": designed path — embed the query, similarity-search kb_chunks.
 *  - "full-kb":    interim — inject the client's whole knowledge_base text into
 *                  the prompt, no OpenAI. Switch back to "embeddings" when
 *                  credits return; the embeddings path is already built.
 */
export type RetrievalMode = "full-kb" | "embeddings";

export const config = {
  chat: {
    // ADR: Sonnet 4.6, thinking disabled, low effort, streaming.
    model: "claude-sonnet-4-6",
    thinking: "disabled",
    effort: "low",
  },
  embedding: {
    // ADR-0003: OpenAI text-embedding-3-small, 1536 dims. Ingestion and query
    // embedding MUST use the same model or retrieval silently degrades.
    model: "text-embedding-3-small",
    dimensions: 1536,
  },
  retrieval: {
    mode: "full-kb" as RetrievalMode,
    // Used only in "embeddings" mode. Tunable against real KBs (ADR-0005).
    topK: 8,
    similarityThreshold: 0.5,
  },
};
