-- ── File upload support for beam bookings ─────────────────────────────────────
-- storage_path: path inside the 'beams' Supabase Storage bucket, used to delete
--               the file when a booking expires.  NULL for URL-linked beams.
-- file_type:    'image' or 'video' — drives the overlay render (<img> vs <video>).
--               NULL for legacy rows is treated as 'image' in the frontend.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_type    TEXT
    CHECK (file_type IN ('image', 'video'));
