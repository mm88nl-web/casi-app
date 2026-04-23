-- Enable FULL replica identity on the bookings table.
--
-- Same root cause as the flashes version (20260428010000). Every
-- filtered realtime subscription on bookings uses
-- `filter: profile_id=eq.${profileId}`, but default Postgres replica
-- identity ships only the PK in UPDATE pre-images, so the filter
-- expression can't evaluate and the event is silently dropped.
--
-- Confirmed on live DB: `select relreplident from pg_class` returns
-- 'd' (default) for both flashes and bookings; only overlay_elements
-- has 'f'. Any "I had to refresh to see the change" symptoms on the
-- admin Requests tab for booking status transitions (approve, queue,
-- deny) are this.
--
-- INSERTs already work with default replica identity — that's why
-- new bookings appear live. It's only UPDATEs that get dropped.

alter table public.bookings replica identity full;
