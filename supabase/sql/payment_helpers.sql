-- Increment video views (called from POST /api/sessions)
create or replace function increment_video_views(video_id uuid)
returns void as $$
  update public.videos
  set views = views + 1,
      updated_at = now()
  where id = video_id;
$$ language sql;

-- Run in Supabase SQL Editor after your main schema exists.
-- The payments API calls increment_video_earnings + increment_user_spent via .rpc().
-- Watch session totals are updated in the API with read-then-update (no rpc required).

-- Increment video earnings
create or replace function increment_video_earnings(video_id uuid, amount numeric)
returns void as $$
  update public.videos
  set total_earned = total_earned + amount,
      updated_at = now()
  where id = video_id;
$$ language sql;

-- Increment user spent
create or replace function increment_user_spent(user_id uuid, amount numeric)
returns void as $$
  update public.users
  set total_spent = total_spent + amount,
      updated_at = now()
  where id = user_id;
$$ language sql;

-- Optional: atomic watch_sessions bump (only if you add this rpc to the API later)
create or replace function increment_watch_session(
  p_session_id uuid,
  p_seconds numeric,
  p_amount numeric
)
returns void as $$
  update public.watch_sessions
  set
    seconds_paid = coalesce(seconds_paid, 0) + p_seconds,
    total_cost = coalesce(total_cost, 0) + p_amount
  where id = p_session_id;
$$ language sql;
