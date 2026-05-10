-- ── Silhouette Preview UX ───────────────────────────────────────────────────
-- Stores a screenshot of the streamer's OBS layout.  Displayed as a background
-- in the viewer's booking form so they can preview where their beam will land.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preview_background_url TEXT;
