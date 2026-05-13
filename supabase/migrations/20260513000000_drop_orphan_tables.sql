-- ── Drop orphan tables: `bids` + `submissions` ───────────────────────────────
-- Both were created via the Supabase Dashboard's Table Editor outside the
-- migrations folder, never referenced by any code path, and flagged by the
-- Supabase linter (`rls_disabled_in_public`) because RLS was never enabled.
-- They predate the current `bookings` / `flashes` model and contain no rows
-- we need to retain.

DROP TABLE IF EXISTS public.bids CASCADE;
DROP TABLE IF EXISTS public.submissions CASCADE;
