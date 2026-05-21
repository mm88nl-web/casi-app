-- Adds accent2_color override for the Custom skin (v9 Appearance section).
-- When profiles.skin = 'custom', the three columns ink_color + paper_color +
-- accent2_color together define the streamer's full palette. For preset skins
-- these columns are ignored at render time — only the skin definition wins.
--
-- Column-level SELECT granted to both anon and authenticated so the OBS page
-- (uses anon client) can resolve it when applying the streamer's theme, and
-- the settings page (authenticated) can seed the pickers on load.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS accent2_color TEXT;

GRANT SELECT (accent2_color) ON TABLE profiles TO anon;
GRANT SELECT (accent2_color) ON TABLE profiles TO authenticated;
