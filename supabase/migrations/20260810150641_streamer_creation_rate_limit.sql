-- Per-streamer AGGREGATE rate limit for booking/flash creation routes.
--
-- Defeats the proven IP-rotation bypass of the existing per-(streamer, IP)
-- cooldown (docs/fable-spam-abuse-review-2026-08-10.md, Finding 3; also
-- AGENTS.md's own long-flagged "add per-profile_id rate limit alongside
-- per-IP" gap). That cooldown only limits how often the SAME identity can
-- act -- rotating through distinct IPs (or accounts, if we ever added
-- viewer accounts, which we deliberately aren't -- see memory
-- feedback-casi-viewer-no-signup) gives each caller a fresh bucket. This
-- table instead counts ALL creation attempts against a given streamer
-- (profile_id) regardless of who's calling, so no amount of identity
-- rotation raises the ceiling.
--
-- Separate table from delegate_rate_limits (added earlier today) rather
-- than reusing it: both are per-streamer-UUID atomic counters, but mixing
-- "protect the shared cranker's SOL" and "protect a streamer's queue from
-- creation spam" into one bucket would let one concern's traffic eat into
-- the other's budget. Same mechanism, kept separate on purpose.

create table if not exists streamer_creation_rate_limits (
  streamer_id  uuid primary key references profiles(id) on delete cascade,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

alter table streamer_creation_rate_limits enable row level security;

create or replace function streamer_creation_rate_limit_hit(
  p_streamer_id uuid,
  p_window_secs integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into streamer_creation_rate_limits (streamer_id, window_start, count)
  values (p_streamer_id, now(), 1)
  on conflict (streamer_id) do update
    set count = case
          when now() - streamer_creation_rate_limits.window_start > (p_window_secs || ' seconds')::interval
            then 1
          else streamer_creation_rate_limits.count + 1
        end,
        window_start = case
          when now() - streamer_creation_rate_limits.window_start > (p_window_secs || ' seconds')::interval
            then now()
          else streamer_creation_rate_limits.window_start
        end
  returning count into v_count;
  return v_count;
end;
$$;

-- Learned from this morning's delegate_rate_limit_hit migration: Supabase
-- auto-grants EXECUTE on new functions to anon/authenticated regardless of
-- a `revoke ... from public`. This route needs to be callable from
-- unauthenticated viewer-facing booking/flash creation, so anon access is
-- actually correct here (unlike the delegate function, which must never be
-- anon-callable) -- explicit grant below, not left to the default, so the
-- intent is on record rather than accidental.
revoke all on function streamer_creation_rate_limit_hit(uuid, integer) from public;
grant execute on function streamer_creation_rate_limit_hit(uuid, integer) to anon, authenticated, service_role;
