-- Allow sub-minute durations by widening duration_minutes from INTEGER to NUMERIC.
-- Existing integer values (e.g. 30) are cast automatically with no data loss.
-- All existing timer/price logic continues to work: seconds = duration_minutes * 60.

ALTER TABLE bookings
  ALTER COLUMN duration_minutes TYPE NUMERIC USING duration_minutes::NUMERIC;
