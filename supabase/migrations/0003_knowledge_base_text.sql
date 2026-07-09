-- Exactly Chat — interim full-KB-in-prompt mode (ADR-0008).
-- Holds a client's entire Knowledge Base as text, injected wholesale into the
-- system prompt when retrieval is disabled (no OpenAI embeddings needed).
-- Temporary: superseded by embeddings retrieval (kb_chunks) once credits return.
-- Apply in the Supabase SQL editor. Run "with RLS".

alter table clients add column if not exists knowledge_base text not null default '';
