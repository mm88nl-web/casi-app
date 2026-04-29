-- v7 redesign: skin preset remap
--
-- The seven skin presets in src/lib/skins.ts changed in the v7 redesign.
-- Streamers whose profiles.skin still points at a retired id need to land
-- on the closest replacement so getSkinById() doesn't silently fall back
-- to 'casi-dark' (which would visibly change everyone's accent / surfaces
-- on the next page load).
--
-- Mapping (old → new), per PLAN.md decision #2:
--   twitch    → twitch    (kept verbatim, no rewrite needed)
--   void      → mono      (mono replaces the pure-mono preset)
--   chrome    → mono      (closest neutral)
--   ember     → rose      (warm/saturated)
--   neon      → rose      (saturated pink/magenta)
--   terminal  → kick      (phosphor green)
--   casi-dark → casi-dark (kept verbatim)
--   anything else → casi-dark via getSkinById fallback at runtime.
--
-- Idempotent: WHERE clauses scope each UPDATE to rows still on the old id.
-- Safe to re-run.

UPDATE profiles SET skin = 'mono' WHERE skin = 'void';
UPDATE profiles SET skin = 'mono' WHERE skin = 'chrome';
UPDATE profiles SET skin = 'rose' WHERE skin = 'ember';
UPDATE profiles SET skin = 'rose' WHERE skin = 'neon';
UPDATE profiles SET skin = 'kick' WHERE skin = 'terminal';
