-- Streamer-level "what currency do my dashboard tiles show in?" preference.
-- Doesn't affect what viewers can pay (both rails stay open) — purely a
-- display choice for the studio dashboard tiles + flashes-log totals so the
-- streamer sees one number that matches their mental model instead of two
-- columns of "is this useful?" data.
--
-- Values:
--   eur  — flashes-log totals + earnings tiles render in EUR. USDC ignored
--          for tile totals (both rails still bookable).
--   usd  — same, in USD (Stripe Connect supports USD per-account, not
--          currency-converted; this is a label preference, not FX).
--   usdc — totals render in USDC; EUR/USD rows ignored for tile totals.
--
-- Default 'eur' matches today's hard-coded behaviour so existing rows don't
-- shift when the column lands.

alter table public.profiles
  add column if not exists display_currency text not null default 'eur'
  check (display_currency in ('eur', 'usd', 'usdc'));

comment on column public.profiles.display_currency is
  'Streamer-chosen currency for studio dashboard tiles + flashes-log totals. Display preference only — does not gate which rails viewers can pay on.';
