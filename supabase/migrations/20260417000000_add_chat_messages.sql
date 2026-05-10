-- ── Live chat messages ────────────────────────────────────────────────────────
-- Per-streamer chat room. Viewers post with their local viewer_name (same one
-- used on the booking flow — no Supabase auth session on the client). The
-- streamer can delete messages from their admin dashboard.

CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewer_name TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_viewer_name_len CHECK (char_length(viewer_name) BETWEEN 1 AND 24),
  CONSTRAINT chat_messages_message_len     CHECK (char_length(message)     BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS chat_messages_profile_created_idx
  ON chat_messages (profile_id, created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Overlay + admin + OBS all need to read the feed.
CREATE POLICY "chat_select_public"
  ON chat_messages FOR SELECT
  USING (true);

-- Anon viewers post.  Rate limiting / spam guards belong at the API layer
-- rather than RLS; length bounds are enforced via CHECK constraints above.
CREATE POLICY "chat_insert_public"
  ON chat_messages FOR INSERT
  WITH CHECK (true);

-- Only the streamer (profile owner) can moderate by deleting messages.
CREATE POLICY "chat_delete_owner"
  ON chat_messages FOR DELETE
  USING (auth.uid() = profile_id);
