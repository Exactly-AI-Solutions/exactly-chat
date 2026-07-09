-- Exactly Chat — per-client widget config (opening bubbles + chips).
-- Drives the widget's opening experience (spec-defined per client). ROADMAP Phase 7.
-- Apply in the Supabase SQL editor. Run "with RLS".

alter table clients add column if not exists widget_config jsonb not null default '{}'::jsonb;
