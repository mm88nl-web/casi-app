-- Persist the streamer's Stripe Connect settlement currency on profiles.
--
-- Before this column existed, every viewer-facing surface that needed to
-- know "what currency does this streamer charge in?" had to round-trip
-- through Stripe via /api/stripe/connect/status — fine for the studio
-- dashboard which loads once, hopeless for the overlay booking form
-- which renders the price preview on every duration tick.
--
-- The column mirrors Stripe Connect's account.default_currency (a
-- lowercase ISO-4217 code) and is populated by the Stripe authorize
-- + connect/status routes whenever they have a fresh value. nullable
-- because new streamers haven't onboarded Stripe yet (USDC-only is
-- valid) and the value isn't determinable until Stripe Connect has
-- assigned one.
--
-- Display currency `display_currency` was previously check-constrained
-- to ('eur','usd','usdc'). That constraint is dropped here so the
-- per-streamer picker can widen to the full 8-currency Stripe seed
-- list (eur/usd/gbp/aud/cad/brl/jpy/sgd + usdc) without a future
-- migration every time we add a code.

alter table public.profiles
  add column if not exists settlement_currency text;

comment on column public.profiles.settlement_currency is
  'Stripe Connect account.default_currency for this streamer (lowercase ISO-4217). Mirror only; Stripe Connect remains authoritative. NULL when Stripe is not yet connected.';

-- Drop the narrow check constraint on display_currency. The picker UI
-- enforces the supported list now; we don't want a constraint that
-- requires a migration to add a new currency.
alter table public.profiles
  drop constraint if exists profiles_display_currency_check;

-- Column-level GRANTs so viewer pages (anon) can read the streamer's
-- settlement currency without service-role. Same pattern as
-- ink_color / paper_color. settlement_currency is non-sensitive — it's
-- just an ISO code, no PII, no account identifiers.
grant select (settlement_currency) on table profiles to anon;
grant select (settlement_currency) on table profiles to authenticated;
