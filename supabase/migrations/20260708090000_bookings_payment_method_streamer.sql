-- Streamer self-publish (src/app/api/bookings/streamer-publish/route.ts, added
-- 2026-07-07) inserts bookings with payment_method='streamer', but the check
-- constraint was never widened to allow it — every self-publish insert fails
-- with a 23514 violation. Add 'streamer' alongside the existing rail values.

alter table public.bookings
  drop constraint if exists bookings_payment_method_check;

alter table public.bookings
  add constraint bookings_payment_method_check
  check (payment_method in ('stripe', 'solana', 'free', 'streamer'));
