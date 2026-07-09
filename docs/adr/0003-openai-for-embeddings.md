# OpenAI for embeddings (chat stays on Anthropic)

Chat generation runs on Anthropic (Sonnet 4.6), but the knowledge-base embeddings are produced by **OpenAI `text-embedding-3-small`** (1536 dimensions). Anthropic does not offer an embeddings API at all, so the original spec's plan to embed via `@ai-sdk/anthropic` is not possible — an embedding provider outside Anthropic is unavoidable.

Among the options (Voyage AI — Anthropic's recommended partner — OpenAI, Cohere) we chose OpenAI because it has first-class Vercel AI SDK support (`embed`/`embedMany` work as the spec imagined), the lowest cost per token, the most pgvector precedent at 1536 dims, and the team already holds an OpenAI key. The trade-off is a second AI vendor in the stack for the embedding hop only.

Consequence: this is hard to reverse. The provider and model fix the vector dimensionality (the pgvector column width) and the embedding space, so changing either later requires re-embedding every client's entire knowledge base and rebuilding the index. Both ingestion (offline) and the per-request query embedding must use the **same** OpenAI model, or retrieval silently degrades.
