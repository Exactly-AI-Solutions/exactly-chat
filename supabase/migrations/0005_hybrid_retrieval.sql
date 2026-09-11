-- Exactly Chat — hybrid retrieval candidate generation (dense + sparse).
-- Additive only: match_kb_chunks (0001) is untouched, so any client not moved
-- to hybrid mode keeps its exact current behavior. Apply in the Supabase SQL
-- editor. Run "with RLS".
--
-- Replaces the inside-the-function hard similarity floor (which made a
-- candidate pool for a reranker impossible to build, and rejected a rank-#1
-- candidate at 0.428 during the Comm-Fit smoke) with two low-floor candidate
-- generators: dense (pgvector cosine) and sparse (Postgres full-text search).
-- The application layer unions, dedupes, and orders the result — via a hosted/
-- model reranker when available, via Reciprocal Rank Fusion when it isn't.

-- Full-text search support for kb_chunks.
alter table kb_chunks add column if not exists content_tsv tsvector
  generated always as (to_tsvector('english', content)) stored;
create index if not exists kb_chunks_content_tsv_idx on kb_chunks using gin(content_tsv);

-- ---------------------------------------------------------------------------
-- Dense candidates: cosine similarity, ranked, gated only by a low sanity
-- floor (default 0.15) — NOT a precision floor. Precision now comes from the
-- reranker's calibrated cutoff, applied in the application layer.
-- ---------------------------------------------------------------------------
create or replace function match_kb_chunks_dense_candidates(
  p_client_id       uuid,
  p_query_embedding vector(1536),
  p_candidate_count int,
  p_min_similarity  float default 0.15
)
returns table (
  id              uuid,
  content         text,
  source_filename text,
  source_page     int,
  dense_score     float,
  dense_rank      int
)
language sql
stable
as $$
  select
    kb.id,
    kb.content,
    kb.source_filename,
    kb.source_page,
    1 - (kb.embedding <=> p_query_embedding) as dense_score,
    row_number() over (order by kb.embedding <=> p_query_embedding)::int as dense_rank
  from kb_chunks kb
  where kb.client_id = p_client_id
    and 1 - (kb.embedding <=> p_query_embedding) >= p_min_similarity
  order by kb.embedding <=> p_query_embedding
  limit p_candidate_count;
$$;

-- ---------------------------------------------------------------------------
-- Sparse candidates: Postgres full-text search over content_tsv. Catches the
-- exact-term matches dense retrieval dilutes on generic buyer phrasing (the
-- P4 class from the smoke diagnosis — "legal name", "installations").
-- ---------------------------------------------------------------------------
create or replace function match_kb_chunks_sparse_candidates(
  p_client_id       uuid,
  p_query_text      text,
  p_candidate_count int
)
returns table (
  id              uuid,
  content         text,
  source_filename text,
  source_page     int,
  sparse_score    float,
  sparse_rank     int
)
language sql
stable
as $$
  select
    kb.id,
    kb.content,
    kb.source_filename,
    kb.source_page,
    ts_rank(kb.content_tsv, websearch_to_tsquery('english', p_query_text)) as sparse_score,
    row_number() over (
      order by ts_rank(kb.content_tsv, websearch_to_tsquery('english', p_query_text)) desc
    )::int as sparse_rank
  from kb_chunks kb
  where kb.client_id = p_client_id
    and kb.content_tsv @@ websearch_to_tsquery('english', p_query_text)
  order by sparse_score desc
  limit p_candidate_count;
$$;
