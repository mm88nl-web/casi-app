-- Add 'backdrop' to the allowed `shape` values on overlay_elements.
--
-- Backdrops are now surfaced as a shape picker option rather than a
-- separate "+ Backdrop" top-nav button. Under the hood they still carry
-- `is_background = true` for backward compatibility with the OBS layer
-- filter at /obs?layer=backdrop (which reads `is_background`, not
-- `shape`, so existing streamers' OBS URLs keep working unchanged).
--
-- This migration only widens the CHECK constraint; no data changes.
-- Existing backdrops keep `is_background = true, shape = 'rect'` and
-- render identically. When a streamer picks "Backdrop" in the shape
-- picker for a new slot, admin/page.tsx::handleUpdateShape sets both
-- `shape = 'backdrop'` and `is_background = true` in the same write.

alter table overlay_elements
  drop constraint if exists overlay_elements_shape_check;

alter table overlay_elements
  add constraint overlay_elements_shape_check
  check (shape in ('rect','rounded','circle','hex','banner','backdrop'));
