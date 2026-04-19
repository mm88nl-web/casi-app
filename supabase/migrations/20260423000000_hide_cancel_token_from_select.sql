-- ── P0: cancel_token was publicly readable ─────────────────────────────────
-- bookings_select_public is `USING (true)` and anon had a table-level SELECT
-- grant, which meant any anonymous PostgREST client could read cancel_token
-- from arbitrary rows:
--
--   supabase.from('bookings').select('cancel_token').eq('id', <target>)
--
-- That completely defeated the per-booking token auth on:
--   • /api/bookings/viewer-deny     (deny any booking)
--   • /api/bookings/attach-solana-tx (inject fake on-chain proof)
--   • /api/stripe/cancel             (cancel/refund any active booking)
--
-- Fix: replace the table-level SELECT grant with a column-level grant that
-- lists every column EXCEPT cancel_token. All application reads already read
-- named columns or .select('*') excluding server-only fields — dropping the
-- column from PostgREST responses has no client impact. Server routes run
-- as service_role and bypass grants, so /api/stripe/authorize can still
-- read and write cancel_token.

REVOKE SELECT ON TABLE bookings FROM anon;

GRANT SELECT (
  id,
  created_at,
  profile_id,
  element_id,
  viewer_name,
  status,
  image_url,
  storage_path,
  file_type,
  message,
  duration_minutes,
  price_value,
  price_unit,
  payment_method,
  stream_id,
  tx_signature,
  payment_intent_id,
  original_amount_cents,
  approved_at,
  started_at,
  escrow_pda,
  viewer_wallet,
  is_queued,
  queue_position
) ON TABLE bookings TO anon;

-- Mirror the grant for `authenticated` so logged-in streamers read the same
-- shape via their own session. Streamer dashboards don't need cancel_token
-- either — the cancel endpoints fall back to the streamer bearer token.
REVOKE SELECT ON TABLE bookings FROM authenticated;

GRANT SELECT (
  id,
  created_at,
  profile_id,
  element_id,
  viewer_name,
  status,
  image_url,
  storage_path,
  file_type,
  message,
  duration_minutes,
  price_value,
  price_unit,
  payment_method,
  stream_id,
  tx_signature,
  payment_intent_id,
  original_amount_cents,
  approved_at,
  started_at,
  escrow_pda,
  viewer_wallet,
  is_queued,
  queue_position
) ON TABLE bookings TO authenticated;
