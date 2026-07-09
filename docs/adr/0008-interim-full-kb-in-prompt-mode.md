# Interim full-KB-in-prompt mode (no embeddings)

Temporarily, the agent can answer from a client's **entire Knowledge Base injected wholesale into the system prompt**, with retrieval (embeddings + similarity search) switched off. This is selected by `config.retrieval.mode = "full-kb"`; the designed path is `"embeddings"` (ADR-0003, ADR-0005).

**Why:** OpenAI credits are temporarily unavailable, but embeddings are needed for both ingestion and query-time retrieval. Chat generation runs on Anthropic, which is funded. Putting the whole KB in the prompt removes the OpenAI dependency entirely, so a working demo is possible immediately. For a small FAQ-sized KB this is also perfectly serviceable on its own merits — Sonnet 4.6's context is large, and there are no retrieval misses.

**How:** the full KB text lives in `clients.knowledge_base` (migration `0003`), populated by `npm run ingest-text` (PDF → text, no embeddings). In `full-kb` mode the chat route skips `embedQuery` + `matchKbChunks` and passes that text as the Knowledge base context block. Strict grounding + graceful refusal (ADR-0005) still hold: the prompt still instructs the agent to answer only from the provided context and decline otherwise — the difference is the context is the whole KB rather than retrieved chunks.

**Reversal:** flip `config.retrieval.mode` to `"embeddings"` once credits return. The embeddings path (ingest script, `kb_chunks`, `match_kb_chunks`, `embedQuery`) is already built and untouched. This mode does not fit large KBs (prompt size / cost) — it is a stopgap and small-KB convenience, not the destination. The `knowledge_base` column and `ingest-text` script are the only things to retire.
