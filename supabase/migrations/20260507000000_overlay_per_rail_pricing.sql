-- Per-rail pricing for overlay_elements — backs the v9 Studio Live editor's
-- Pricing tab (USD / EUR / USDC / SOL rates + min/max duration + cooldown).
--
-- Why JSONB instead of four NUMERIC columns:
--   - Adding a fifth or sixth rail (BTC / Lightning / a future stable) doesn't
--     require another migration.
--   - NULL keys are explicit "fall back to legacy price_value" — separate
--     columns would force every row to declare every rail or pollute the
--     query plan with COALESCE chains.
--   - Booking flow today still reads el.price_value; per-rail consumption is
--     a follow-up wired behind a flag once product confirms the model.
--
-- Shape:
--   {
--     "usd":   5,
--     "eur":   4.6,
--     "usdc":  5,
--     "sol":   0.033,
--     "min_min": 1,
--     "max_min": 15,
--     "cooldown_secs": 0
--   }
-- Any missing key means "fall back to price_value / price_unit / no limit".

ALTER TABLE overlay_elements
  ADD COLUMN IF NOT EXISTS prices JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN overlay_elements.prices IS
  'Per-rail rate overrides + min/max duration + cooldown. NULL keys fall back to price_value/price_unit. Shape documented in the migration that introduced this column.';

-- Min / max / cooldown were partially used by BookingForm via
-- max_duration_minutes; pin them as first-class columns so the slot config
-- query can read them directly (still mirrored into prices.min_min /
-- max_min / cooldown_secs by the studio editor for forward-compat).
ALTER TABLE overlay_elements
  ADD COLUMN IF NOT EXISTS min_duration_minutes NUMERIC;
ALTER TABLE overlay_elements
  ADD COLUMN IF NOT EXISTS max_duration_minutes NUMERIC;
ALTER TABLE overlay_elements
  ADD COLUMN IF NOT EXISTS cooldown_secs INTEGER NOT NULL DEFAULT 0;

-- No grants update needed: overlay_elements is server-write-only
-- (streamer-authenticated routes use service_role); anon readers already
-- pick up the new columns via the existing column-level GRANT list.
