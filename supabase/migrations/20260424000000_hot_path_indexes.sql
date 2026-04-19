-- ── Hot-path indexes ───────────────────────────────────────────────────────
-- Every admin + overlay page load runs these filters:
--
--   • bookings where profile_id=… and status in ('pending','active',
--     'approved_queued') — admin dashboard (3 separate queries in parallel)
--   • bookings where profile_id=… and status='active' — overlay live view
--   • bookings where element_id=… and status in (…) — queue counts per slot
--   • overlay_elements where profile_id=… — admin canvas + overlay
--   • flashes where profile_id=… and status='pending' — admin requests
--
-- None of these columns are indexed yet. At a few hundred rows PostgREST is
-- fine; at 10k+ rows per streamer these become full-table scans on every
-- request. Add composite indexes matching the exact filter shapes so the
-- planner can satisfy queries with index-only or index-then-fetch.
--
-- created_at DESC index on bookings lets us order recent-first without a
-- sort step once pagination lands.

-- ── bookings ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS bookings_profile_status_idx
  ON public.bookings (profile_id, status);

CREATE INDEX IF NOT EXISTS bookings_element_status_idx
  ON public.bookings (element_id, status);

CREATE INDEX IF NOT EXISTS bookings_profile_created_idx
  ON public.bookings (profile_id, created_at DESC);

-- payment_intent_id is used by the stripe-janitor and webhook lookups.
-- Partial: only index rows that have one, which is a small slice.
CREATE INDEX IF NOT EXISTS bookings_payment_intent_idx
  ON public.bookings (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

-- tx_signature + escrow_pda are looked up from the Solana webhook path.
CREATE INDEX IF NOT EXISTS bookings_tx_signature_idx
  ON public.bookings (tx_signature)
  WHERE tx_signature IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_escrow_pda_idx
  ON public.bookings (escrow_pda)
  WHERE escrow_pda IS NOT NULL;

-- ── overlay_elements ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS overlay_elements_profile_idx
  ON public.overlay_elements (profile_id);

-- ── flashes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS flashes_profile_status_idx
  ON public.flashes (profile_id, status);

CREATE INDEX IF NOT EXISTS flashes_profile_created_idx
  ON public.flashes (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS flashes_tx_signature_idx
  ON public.flashes (tx_signature)
  WHERE tx_signature IS NOT NULL;
