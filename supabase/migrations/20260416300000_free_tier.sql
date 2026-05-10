-- ── Free tier for Flashes and Beams ──────────────────────────────────────────
-- Creators can opt-in to accept free (payment-less) Flashes and Beams. Useful
-- for cold-start engagement, demos, and creators who prefer non-monetised chat.
--
-- Platform enforces exactly ONE rate-limit floor:
--   1 free flash per minute per (viewer_key, streamer).
-- Beams are naturally throttled by streamer approval + the slot-booking check
-- so no platform-level limit is applied there.
--
-- Payment method taxonomy (for both flashes + bookings):
--   'stripe' — Stripe manual-capture PaymentIntent (primary rail)
--   'solana' — Custom Anchor escrow / Streamflow (devnet-gated)
--   'free'   — No payment; creator approves for moderation only.

-- 1. Creator toggles. Default OFF so existing behaviour is unchanged.
alter table public.profiles
  add column if not exists allow_free_flashes boolean not null default false,
  add column if not exists allow_free_beams   boolean not null default false;

-- 2. Flashes: relax the payment_method check to allow 'free'.
alter table public.flashes
  drop constraint if exists flashes_payment_method_check;

alter table public.flashes
  add constraint flashes_payment_method_check
  check (payment_method in ('stripe', 'solana', 'free'));

-- 3. Bookings (beams): add the same check, constraining the existing
-- free-text column. Existing rows are 'stripe' or 'solana' so this is safe.
alter table public.bookings
  drop constraint if exists bookings_payment_method_check;

alter table public.bookings
  add constraint bookings_payment_method_check
  check (payment_method in ('stripe', 'solana', 'free'));

-- 4. Rate-limit table. One row per (streamer, viewer_key). viewer_key is
-- typically the logged-in auth.uid(); for anon viewers we fall back to a
-- hashed IP (sha256 of client IP, hex-encoded) to avoid storing raw IPs.
-- Upsert on send and reject if now() - last_sent_at < interval '1 minute'.
create table if not exists public.free_flash_rate_limits (
  streamer_id   uuid        not null references public.profiles(id) on delete cascade,
  viewer_key    text        not null,
  last_sent_at  timestamptz not null default now(),
  primary key (streamer_id, viewer_key)
);

alter table public.free_flash_rate_limits enable row level security;

-- Only the service role (via the /api/flashes/create route) ever touches this
-- table. No anon or authenticated policies are added intentionally.

create index if not exists free_flash_rate_limits_last_sent_idx
  on public.free_flash_rate_limits(last_sent_at);
