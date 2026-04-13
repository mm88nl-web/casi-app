-- Add skin column to profiles table
-- Stores the ID of the streamer's chosen UI skin (e.g. 'casi-dark', 'twitch', 'neon').
-- NULL means "use theme_color accent on the Casi Dark base" (backward compatible).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS skin text DEFAULT NULL;
