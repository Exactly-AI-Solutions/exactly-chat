-- Exactly Chat — per-client usage metering + quota (ROADMAP Phase 5, ADR-0002 Layer C).
-- Apply in the Supabase SQL editor (manual for now). Run "with RLS".

-- Optional per-client monthly token ceiling. NULL = unlimited.
alter table clients add column if not exists monthly_token_quota bigint;

-- Per-client, per-period token tally. period is 'YYYY-MM' (UTC).
create table if not exists usage_counters (
  client_id    uuid not null references clients(id) on delete cascade,
  period       text not null,
  total_tokens bigint not null default 0,
  primary key (client_id, period)
);

-- Atomic increment (upsert-add) — called once per completed chat turn.
create or replace function increment_usage(
  p_client_id uuid,
  p_period    text,
  p_tokens    bigint
)
returns void
language sql
as $$
  insert into usage_counters (client_id, period, total_tokens)
  values (p_client_id, p_period, p_tokens)
  on conflict (client_id, period)
  do update set total_tokens = usage_counters.total_tokens + excluded.total_tokens;
$$;

-- Public-REST lockout (policy-free RLS — same rationale as 0001; ADR-0004).
alter table usage_counters enable row level security;
