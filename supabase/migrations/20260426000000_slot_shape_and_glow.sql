-- Slot shape variants + glow-on-start animation.
--
-- `shape` controls how a slot is visually masked on the viewer overlay
-- (and what content it renders):
--
--   rect    : default, axis-aligned rectangle with no mask
--   rounded : border-radius 12px
--   circle  : clip-path circle; admin UI auto-snaps slot to square
--   hex     : clip-path hexagon; admin UI auto-snaps slot to square
--   banner  : wide thin strip that renders the viewer's *message* as a
--             scrolling marquee instead of their image — the content
--             switch is load-bearing, not just cosmetic.
--
-- `glow_on_start` toggles a one-shot pulse in the streamer's accent
-- colour when a booking transitions pending -> active on this slot.
-- Defaults to true so existing slots light up after the migration runs;
-- streamers can turn it off per slot from the info panel.

alter table overlay_elements
  add column if not exists shape text not null default 'rect'
    check (shape in ('rect','rounded','circle','hex','banner')),
  add column if not exists glow_on_start boolean not null default true;

-- Banner bookings use bookings.message as the primary content. Rather
-- than adding a whole new content-type column on bookings, we piggyback
-- on the existing nullable `message` column; the overlay render reads
-- it when the slot's shape is 'banner'. Enforce a length cap server-
-- side (see /api/bookings/*-create routes) to keep the marquee
-- readable; this migration only widens the shape of the data, not the
-- app-level validation.
