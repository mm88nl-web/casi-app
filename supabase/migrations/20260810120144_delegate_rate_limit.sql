-- Distributed rate limit for the cranker-fee-paying delegate routes.
--
-- Replaces src/lib/rate-limit.ts's inMemoryRateLimit for these four routes.
-- That limiter's buckets live in the lambda process's memory, so on Vercel
-- concurrent requests can land on different execution environments, each
-- with its own empty bucket — a streamer (or anyone holding their session)
-- firing requests in parallel rather than serially has a real chance of
-- exceeding the intended 60-ops/60s cap before any single bucket saturates.
-- That cap is the only thing standing between a self-dealing streamer
-- (fund + approve + settle their own beams in a loop) and draining the
-- shared cranker's SOL, which degrades every streamer's no-popup
-- approve/kick flow to wallet-popup mode until someone refills it.
--
-- This table + function move the counter into Postgres, where a single
-- UPSERT statement is atomic under row-level locking regardless of how many
-- serverless instances call it concurrently.

create table if not exists delegate_rate_limits (
  streamer_id  uuid primary key references profiles(id) on delete cascade,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

-- No direct table grants for anon/authenticated — all access goes through
-- delegate_rate_limit_hit() below. RLS on with zero policies is a belt-and-
-- suspenders default-deny; the table holds no sensitive data, but nothing
-- needs to read or write it directly.
alter table delegate_rate_limits enable row level security;

-- Atomically increments the caller's counter, resetting it (and the window)
-- if p_window_secs has elapsed since window_start. Returns the post-
-- increment count so the caller compares against its own limit in one round
-- trip. SECURITY DEFINER so routes using the Supabase anon/authenticated
-- client (not just the service-role key) can call it without needing
-- separate table grants.
create or replace function delegate_rate_limit_hit(
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
  insert into delegate_rate_limits (streamer_id, window_start, count)
  values (p_streamer_id, now(), 1)
  on conflict (streamer_id) do update
    set count = case
          when now() - delegate_rate_limits.window_start > (p_window_secs || ' seconds')::interval
            then 1
          else delegate_rate_limits.count + 1
        end,
        window_start = case
          when now() - delegate_rate_limits.window_start > (p_window_secs || ' seconds')::interval
            then now()
          else delegate_rate_limits.window_start
        end
  returning count into v_count;
  return v_count;
end;
$$;

revoke all on function delegate_rate_limit_hit(uuid, integer) from public;
grant execute on function delegate_rate_limit_hit(uuid, integer) to authenticated, service_role;
