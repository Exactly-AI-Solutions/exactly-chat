-- Exactly Chat — fix sparse candidate generation: OR, not AND, across query terms.
-- Apply in the Supabase SQL editor. Run "with RLS".
--
-- 0005's match_kb_chunks_sparse_candidates used websearch_to_tsquery, which
-- combines terms with implicit AND. On a real, multi-word buyer question
-- ("What is the exact legal name of the company for a purchase order?") that
-- requires every one of "exact/legal/name/company/purchase/order" to co-occur
-- in one chunk — none does, so it silently returned zero candidates. That is
-- not an edge case; it defeats sparse retrieval on the exact query shape it
-- exists to rescue (the P4 class from the smoke diagnosis). Found during
-- reranker calibration, 2026-09-11/12.
--
-- Fix: OR-combine the query's lexemes, so a chunk matching ANY term is a
-- candidate, ranked by ts_rank as before (more matching/frequent terms score
-- higher). Union with dense candidates and reranking narrow the wider pool
-- back down to what's actually relevant — that narrowing is the reranker's
-- job, not the candidate generator's.

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
language plpgsql
stable
as $$
declare
  q tsquery;
begin
  select to_tsquery('english', string_agg(lexeme, ' | '))
    into q
    from unnest(tsvector_to_array(to_tsvector('english', p_query_text))) as lexeme;

  if q is null then
    return; -- no content words in the query (e.g. all stopwords) — no sparse candidates
  end if;

  return query
    select
      kb.id,
      kb.content,
      kb.source_filename,
      kb.source_page,
      -- ts_rank returns real (float4); the declared column is double precision
      -- (float8) — plpgsql's RETURN QUERY checks this exactly, unlike a plain
      -- SQL function's more permissive implicit coercion. Cast explicitly.
      ts_rank(kb.content_tsv, q)::double precision as sparse_score,
      row_number() over (order by ts_rank(kb.content_tsv, q) desc)::int as sparse_rank
    from kb_chunks kb
    where kb.client_id = p_client_id
      and kb.content_tsv @@ q
    order by sparse_score desc
    limit p_candidate_count;
end;
$$;
