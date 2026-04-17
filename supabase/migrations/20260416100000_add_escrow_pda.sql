-- Add escrow_pda column to flashes table (stores the on-chain PDA address for Anchor escrow)
alter table public.flashes add column if not exists escrow_pda text;

-- Add escrow_pda column to bookings table (for future Beam escrow support)
alter table public.bookings add column if not exists escrow_pda text;

-- Index for fast lookups by escrow_pda
create index if not exists flashes_escrow_pda_idx   on public.flashes(escrow_pda) where escrow_pda is not null;
create index if not exists bookings_escrow_pda_idx  on public.bookings(escrow_pda) where escrow_pda is not null;
