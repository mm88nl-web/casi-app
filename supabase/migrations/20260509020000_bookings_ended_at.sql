-- Add bookings.ended_at so the studio dashboard's Today tile can prorate
-- early-ended beams instead of counting their full price_value × duration.
--
-- Today logic in `src/app/studio/page.tsx` previously summed
-- `bookingTotal(row)` (price_value × duration) for every row in
-- `todayBookings` regardless of whether the streamer kicked it early. A
-- streamer who ended a 1-hour beam after 5 minutes saw the full hour's
-- charge added to their daily total, not the 1/12th vested portion the
-- viewer was actually charged.
--
-- Without persisted `ended_at` we can't reconstruct vested time after the
-- fact (started_at + duration_minutes alone doesn't tell us when the
-- streamer pressed End Early). Add the column, write it from
-- `endBeamEarly`, and prorate `expired` rows in the dashboard:
--
--   actual = total × min(ended_at − started_at, duration_secs) / duration_secs
--
-- Naturally-expired rows (cron sweep / queue advance) leave `ended_at`
-- NULL and the dashboard treats that as "ran the full duration" — same
-- numeric result as the old code path, so no behavior change for those.
--
-- Not sensitive — just a timestamp — but extend column-level grants so
-- PostgREST returns it for the streamer's authenticated dashboard query.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

GRANT SELECT (ended_at) ON TABLE bookings TO anon;
GRANT SELECT (ended_at) ON TABLE bookings TO authenticated;
