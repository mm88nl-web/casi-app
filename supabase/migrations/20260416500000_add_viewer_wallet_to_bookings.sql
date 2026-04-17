-- Beam bookings on the Solana rail need the viewer's wallet stored server-side
-- so the streamer's admin UI can rebuild the `settle_beam` CPI account list
-- (and as a sanity check on viewer identity for the RLS policy). Mirrors the
-- equivalent column on `flashes` added in 20260416200000.
alter table public.bookings
  add column if not exists viewer_wallet text;

create index if not exists bookings_viewer_wallet_idx
  on public.bookings(viewer_wallet)
  where viewer_wallet is not null;
