-- Exactly Chat — initial schema
-- Governs: ADR-0002 (API key = fast hash + prefix), ADR-0004 (shared schema,
-- client_id on every tenant-owned row, isolation via the data-access seam / RPC),
-- ADR-0005 (similarity RPC filters by client_id and applies the threshold).
--
-- Apply in the Supabase SQL editor (manual for now — see ROADMAP Phase 8).

-- pgvector for embeddings.
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- clients: the unit of tenancy. Holds the per-client wholesale prompt content
-- (Guidelines, QA Samples) and the Domain Whitelist.
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  allowed_origins text[] not null default '{}',  -- Domain Whitelist (ADR-0002 Layer A)
  guidelines     text not null default '',        -- injected wholesale (CONTEXT.md)
  qa_samples     text not null default '',        -- injected wholesale (CONTEXT.md)
  created_at     timestamptz not null default now(),
  -- Enables the composite FK from messages so a message's client_id must match
  -- its conversation's client_id (defense-in-depth for the data-access seam).
  unique (id)
);

-- ---------------------------------------------------------------------------
-- api_keys: publishable keys (ADR-0002). Stored as a fast SHA-256 hash plus an
-- indexed key-id prefix for O(1) lookup — never bcrypt, the key is public anyway.
-- ---------------------------------------------------------------------------
create table if not exists api_keys (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  key_prefix text not null unique,   -- public lookup id (leading chars of the key)
  key_hash   text not null,          -- SHA-256 hex of the full key
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists api_keys_client_id_idx on api_keys(client_id);

-- ---------------------------------------------------------------------------
-- conversations: one end-to-end thread. id is an unguessable UUID and doubles
-- as the resume capability token (ADR-0001). Always scoped by client_id.
-- ---------------------------------------------------------------------------
create table if not exists conversations (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- lets messages carry a composite FK on (conversation_id, client_id)
  unique (id, client_id)
);
create index if not exists conversations_client_id_created_idx
  on conversations(client_id, created_at);

-- ---------------------------------------------------------------------------
-- messages: one entry authored by the end user or the agent. client_id is
-- denormalized so every tenant-owned row carries it (ADR-0004); the composite
-- FK guarantees it matches the parent conversation's client_id.
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  client_id       uuid not null references clients(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now(),
  foreign key (conversation_id, client_id)
    references conversations(id, client_id) on delete cascade
);
create index if not exists messages_conversation_created_idx
  on messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- kb_chunks: chunked + embedded Knowledge Base. 1536-dim OpenAI embeddings
-- (ADR-0003). Full-replace-per-client ingestion (ROADMAP Phase 2).
-- ---------------------------------------------------------------------------
create table if not exists kb_chunks (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  content         text not null,
  embedding       vector(1536) not null,
  source_filename text,
  source_page     int,
  created_at      timestamptz not null default now()
);
create index if not exists kb_chunks_client_id_idx on kb_chunks(client_id);
-- HNSW over cosine distance: no training step, strong recall/latency at this scale.
create index if not exists kb_chunks_embedding_idx
  on kb_chunks using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- match_kb_chunks: tenant-scoped similarity search. Filters by client_id and
-- applies the similarity threshold INSIDE the function (ADR-0004, ADR-0005),
-- so retrieval can never cross tenants and below-threshold chunks never leak.
-- similarity = 1 - cosine_distance.
-- ---------------------------------------------------------------------------
create or replace function match_kb_chunks(
  p_client_id            uuid,
  p_query_embedding      vector(1536),
  p_match_count          int,
  p_similarity_threshold float
)
returns table (
  id              uuid,
  content         text,
  source_filename text,
  source_page     int,
  similarity      float
)
language sql
stable
as $$
  select
    kb.id,
    kb.content,
    kb.source_filename,
    kb.source_page,
    1 - (kb.embedding <=> p_query_embedding) as similarity
  from kb_chunks kb
  where kb.client_id = p_client_id
    and 1 - (kb.embedding <=> p_query_embedding) >= p_similarity_threshold
  order by kb.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- ---------------------------------------------------------------------------
-- Lock the public REST API. Supabase exposes every `public` table via PostgREST
-- to the anon/publishable role. Enabling RLS with NO policies denies that role
-- entirely, so the ONLY way into these tables is our server, which connects with
-- the service-role (secret) key and BYPASSES RLS.
--
-- This is NOT tenant isolation — client-vs-client separation remains the data-
-- access seam's job (ADR-0004). RLS here only closes the public API door, and is
-- therefore deliberately policy-free.
-- ---------------------------------------------------------------------------
alter table clients       enable row level security;
alter table api_keys      enable row level security;
alter table conversations enable row level security;
alter table messages      enable row level security;
alter table kb_chunks     enable row level security;
