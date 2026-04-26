-- Per-booking customization knobs — viewers tune their banner / image
-- presentation when they book. Five optional columns; null = defaults.
--
--   banner_font_px       Banner marquee font size, 16-96. Only meaningful
--                        when the slot's shape is 'banner'.
--   banner_speed_secs    Banner marquee animation duration, 5-60. Lower =
--                        faster scroll. Only meaningful for banners.
--   media_offset_x/y     Image/video object-position, 0-100 (percent).
--                        Defaults to centre (50/50) when null. Lets viewers
--                        pan a wide image inside a circle/hex/rect mask
--                        without re-cropping the upload.
--   media_zoom           Image/video scale, 1.0-4.0. Default 1. Pairs with
--                        objectFit:'cover' so a zoomed image fills the slot
--                        and overflow stays clipped by the shape mask.
--
-- All clamped server-side in the create-* routes (defence in depth — the
-- check constraints below are the database-level floor).

alter table bookings
  add column if not exists banner_font_px      smallint
    check (banner_font_px is null or (banner_font_px between 16 and 96)),
  add column if not exists banner_speed_secs   smallint
    check (banner_speed_secs is null or (banner_speed_secs between 5 and 60)),
  add column if not exists media_offset_x      numeric(5,2)
    check (media_offset_x is null or (media_offset_x between 0 and 100)),
  add column if not exists media_offset_y      numeric(5,2)
    check (media_offset_y is null or (media_offset_y between 0 and 100)),
  add column if not exists media_zoom          numeric(4,2)
    check (media_zoom is null or (media_zoom between 1 and 4));

-- Column-level SELECT grants — anon reads bookings via PostgREST in
-- /overlay and /obs to render live beams. Without these grants the new
-- fields are invisible and the customization silently no-ops on stream.
-- (See 20260423000000_hide_cancel_token_from_select.sql for the full
-- pattern; cancel_token stays excluded here too.)
GRANT SELECT (
  banner_font_px,
  banner_speed_secs,
  media_offset_x,
  media_offset_y,
  media_zoom
) ON TABLE bookings TO anon;

GRANT SELECT (
  banner_font_px,
  banner_speed_secs,
  media_offset_x,
  media_offset_y,
  media_zoom
) ON TABLE bookings TO authenticated;
