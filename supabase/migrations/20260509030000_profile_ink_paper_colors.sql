-- Phase 1 of the Appearance v2 rename: theme_color → ink_color, plus a
-- brand new paper_color override.
--
-- v9's design system is two-color (ink + paper) but the streamer settings
-- only exposed an "accent" override (theme_color → --ink). There was no
-- way for a streamer to lighten the background or pick a light-mode paper
-- without forking the entire skin. This migration unblocks both axes:
--
--   profiles.ink_color   — overrides --ink   (replaces theme_color)
--   profiles.paper_color — overrides --paper (new)
--
-- Backfill ink_color from theme_color so existing streamers keep their
-- chosen accent without re-picking. theme_color is intentionally LEFT IN
-- PLACE for this migration — code reads `ink_color ?? theme_color` so a
-- code deploy that lags the SQL doesn't blank anyone's accent. A followup
-- migration drops the column once the rename has shipped to prod.
--
-- Per AGENTS.md "extend the column-level GRANT list when adding new
-- sensitive columns" — neither column is sensitive (just hex strings)
-- but the streamer dashboard fetches them as `authenticated`, and viewer
-- pages (overlay, /s/[username]) fetch them as `anon`, so both roles need
-- column-level SELECT to keep the table-level REVOKE intact.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ink_color   TEXT,
  ADD COLUMN IF NOT EXISTS paper_color TEXT;

UPDATE profiles
   SET ink_color = theme_color
 WHERE ink_color IS NULL
   AND theme_color IS NOT NULL;

GRANT SELECT (ink_color)   ON TABLE profiles TO anon;
GRANT SELECT (ink_color)   ON TABLE profiles TO authenticated;
GRANT SELECT (paper_color) ON TABLE profiles TO anon;
GRANT SELECT (paper_color) ON TABLE profiles TO authenticated;
