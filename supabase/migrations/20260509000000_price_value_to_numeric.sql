-- Widen bookings.price_value (and the matching column on flashes if it
-- exists) from INTEGER to NUMERIC. Slots already store fractional rates
-- (saveRates writes 16.5 USDC/hr fine), but copying the slot's
-- price_value into a booking row failed with:
--   ERROR: 22P02: invalid input syntax for type integer: "16.5"
--
-- The earlier 20260415480000 migration widened duration_minutes for the
-- same reason (sub-minute durations); price_value missed that pass and
-- broke the moment a streamer set a fractional rate. NUMERIC has no
-- explicit precision so it accepts any rate the streamer can type.
--
-- All existing rows have integer values, so the cast is lossless.
-- Booking-flow math (`price_value * duration_minutes`) keeps working
-- because Postgres NUMERIC arithmetic returns NUMERIC, and the JS
-- side already does Number(...) on PostgREST's string return.

ALTER TABLE bookings
  ALTER COLUMN price_value TYPE NUMERIC USING price_value::NUMERIC;

-- Also widen overlay_elements.price_value defensively — most envs
-- already have it as NUMERIC because the studio's saveRates writes
-- fractional values, but if it's still INTEGER on this DB the cast
-- is a no-op for existing data and aligns the schema with what the
-- app already writes.
ALTER TABLE overlay_elements
  ALTER COLUMN price_value TYPE NUMERIC USING price_value::NUMERIC;
