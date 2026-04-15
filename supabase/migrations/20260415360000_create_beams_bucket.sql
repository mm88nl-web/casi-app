-- ── Supabase Storage: 'beams' bucket ──────────────────────────────────────────
-- Public-read bucket for viewer-uploaded beam images and videos.
-- Server-enforced 5 MB file size limit and MIME-type allowlist.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'beams',
  'beams',
  true,
  5242880,  -- 5 MB
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
) ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS policies ───────────────────────────────────────────────────────
-- Public SELECT: OBS browser source and the overlay page read without auth.
DROP POLICY IF EXISTS "beams_select_public"  ON storage.objects;
DROP POLICY IF EXISTS "beams_insert_anon"    ON storage.objects;
DROP POLICY IF EXISTS "beams_delete_auth"    ON storage.objects;

CREATE POLICY "beams_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'beams');

-- Anonymous viewers (no Supabase session) upload their beam files before paying.
CREATE POLICY "beams_insert_anon"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'beams');

-- Authenticated streamers can delete beam files (cleanup on expiry).
-- Server-side expiry calls use the service_role key which bypasses this policy.
CREATE POLICY "beams_delete_auth"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'beams' AND auth.role() IN ('authenticated', 'service_role'));
