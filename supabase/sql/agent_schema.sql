-- agent_jobs — work queue for the StreamArc Clip Agent.
-- Run once in the Supabase SQL editor. Drained by worker/index.ts (Phase 2);
-- rows are created by POST /api/agent/enqueue and read by GET /api/agent/status.
--
-- gen_random_uuid() requires pgcrypto (bundled in Supabase Postgres; the extension
-- line below is a no-op safety net if it isn't already enabled).
create extension if not exists pgcrypto;

create table if not exists public.agent_jobs (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid,
  budget_usdc   numeric,
  goal          text,
  status        text default 'queued',
  decision_log  jsonb,
  receipt       jsonb,
  clips         jsonb,
  error         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz
);

-- If agent_jobs already exists from an earlier run, add the goal column:
alter table public.agent_jobs add column if not exists goal text;

-- The worker polls for the oldest queued job every 5s; this index keeps that cheap.
create index if not exists agent_jobs_status_created_idx
  on public.agent_jobs (status, created_at);
