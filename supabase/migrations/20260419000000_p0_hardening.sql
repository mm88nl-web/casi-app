-- ── P0 hardening: free-tier gate + abuse reports table ────────────────────
--
-- Two changes:
--
-- 1. Tighten bookings INSERT: free slots (price_value = 0) can no longer be
--    inserted by anon directly. They must route through
--    /api/bookings/create-free which enforces Turnstile + text moderation
--    before writing the row (service role bypasses RLS).
--
-- 2. Add abuse_reports table for user-submitted DMCA / illegal-content
--    takedown requests. Readable only by authenticated platform operators
--    (service role); insertable by anon via /api/abuse/report.

-- ── 1. Bookings INSERT — require paid element for anon inserts ─────────────
DROP POLICY IF EXISTS "bookings_insert_public" ON bookings;

CREATE POLICY "bookings_insert_public"
  ON bookings FOR INSERT
  WITH CHECK (
    status = 'pending'
    AND payment_intent_id IS NULL
    AND original_amount_cents IS NULL
    AND started_at IS NULL
    AND approved_at IS NULL
    AND tx_signature IS NULL
    AND escrow_pda IS NULL
    AND EXISTS (
      SELECT 1 FROM overlay_elements e
      WHERE e.id = element_id
        AND e.profile_id = profile_id
        -- Free slots must go through /api/bookings/create-free so content
        -- moderation + captcha can run. Paid slots still go through Stripe
        -- Checkout which provides its own friction.
        AND e.price_value > 0
    )
  );

-- ── 2. Abuse reports table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS abuse_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Category of complaint: 'dmca' | 'illegal' | 'harassment' | 'other'
  kind            text NOT NULL CHECK (kind IN ('dmca', 'illegal', 'harassment', 'other')),
  -- Reporter contact — required so we can follow up / demand counter-notice
  reporter_email  text NOT NULL,
  reporter_name   text,
  -- What they're reporting
  target_url      text,
  target_username text,
  description     text NOT NULL,
  -- Operator workflow
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'investigating', 'actioned', 'rejected')),
  handled_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at      timestamptz,
  handler_notes   text,
  -- Coarse identity so we can rate-limit + detect spam
  reporter_ip_hash text
);

CREATE INDEX IF NOT EXISTS abuse_reports_status_created_idx
  ON abuse_reports (status, created_at DESC);

ALTER TABLE abuse_reports ENABLE ROW LEVEL SECURITY;

-- Anon can insert (via API route which validates + adds ip hash).
-- Only service role reads — platform operators go through admin tooling.
CREATE POLICY "abuse_reports_insert_public"
  ON abuse_reports FOR INSERT
  WITH CHECK (true);
