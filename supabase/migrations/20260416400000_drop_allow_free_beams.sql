-- Drop allow_free_beams — redundant with per-slot pricing.
--
-- The creator already controls beam/backdrop free-ness by setting the
-- element's price_value = 0 in admin. A profile-level override can't
-- express "free for backdrop, paid for small slot" (or vice versa)
-- and would silently override per-slot pricing. Per-slot is strictly
-- more expressive.
--
-- allow_free_flashes stays: flashes are not tied to specific slots so
-- the profile toggle is the natural level of control for them.

alter table public.profiles
  drop column if exists allow_free_beams;
