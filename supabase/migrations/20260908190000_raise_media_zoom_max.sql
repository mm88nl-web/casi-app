-- Raises the media_zoom ceiling from 4 to 20 at the user's request ("any
-- size that works, as long as it looks like the preview"). The client-side
-- MEDIA_ZOOM_RANGE.max (src/lib/banner.ts) was already fixed the same day
-- to actually match whatever this constraint says — see that file's comment
-- for the "6 vs 4" bug this constraint mismatch caused in production. This
-- migration is the deliberate widening that follows that fix, not a
-- correction of it.
--
-- 20 is comfortably inside the column's own numeric(4,2) ceiling (99.99) —
-- kept as a defensive sanity bound rather than truly unbounded, since
-- nothing about the render path actually requires a cap this high in
-- practice.

alter table bookings
  drop constraint if exists bookings_media_zoom_check;

alter table bookings
  add constraint bookings_media_zoom_check
    check (media_zoom is null or (media_zoom between 1 and 20));
