-- Supabase grants EXECUTE on new functions to anon/authenticated by default
-- (independent of the PUBLIC pseudo-role, so `revoke ... from public` in the
-- prior migration didn't catch it). delegate_rate_limit_hit is only meant to
-- be called by the four delegates/* server routes using the authenticated
-- user's session (or service-role) -- anon should never call it directly:
-- an anonymous caller could otherwise pass any streamer_id and inflate that
-- streamer's own counter, tripping their real rate limit and forcing their
-- delegated approve/settle flow into wallet-popup fallback -- a targeted DoS
-- this table exists specifically to prevent, not enable.
revoke execute on function delegate_rate_limit_hit(uuid, integer) from anon;
