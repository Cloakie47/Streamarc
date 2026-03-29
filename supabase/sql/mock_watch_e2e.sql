-- E2E mock data + helper for Watch page (run once in Supabase SQL Editor)
-- Requires your main schema (users, videos, watch_sessions, etc.) to exist.

-- 1) View counter RPC (idempotent)
create or replace function increment_video_views(video_id uuid)
returns void as $$
  update public.videos
  set views = views + 1,
      updated_at = now()
  where id = video_id;
$$ language sql;

-- 2) Mock viewer user
insert into public.users (id, email, role, gateway_balance)
values (
  '00000000-0000-0000-0000-000000000001',
  'viewer@streamarc.test',
  'viewer',
  4.82
) on conflict (id) do nothing;

-- 3) Mock creator user
insert into public.users (id, email, role, gateway_balance)
values (
  '00000000-0000-0000-0000-000000000002',
  'creator@streamarc.test',
  'creator',
  0
) on conflict (id) do nothing;

-- 4) Mock video
insert into public.videos (id, creator_id, title, duration_secs, status, rate_per_sec)
values (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  'DeFi lending protocol — complete product walkthrough',
  272,
  'live',
  0.00003
) on conflict (id) do nothing;
