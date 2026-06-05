-- Telemetry: record which wallet app a viewer used for a Solana booking
-- (phantom | solflare | <adapter name>). Nullable, write-only from the
-- service-role create-solana route, queried by the founder for demand data.
-- Intentionally NOT granted to anon (viewers don't read it back); adding a
-- column doesn't affect existing column-level SELECT grants.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wallet_app text;

COMMENT ON COLUMN bookings.wallet_app IS
  'Which wallet app the viewer used (phantom|solflare|backpack|…). Telemetry only; nullable; never gates logic.';
