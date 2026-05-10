-- Record the viewer's Solana wallet on each flash so the streamer (admin)
-- can derive the viewer ATA when calling `deny_flash` (refund) on-chain,
-- and so the admin tx builder knows the PDA signer for `approve_flash`.
--
-- Nullable because Stripe flashes don't have a wallet. The API layer
-- enforces `viewer_wallet IS NOT NULL` for payment_method = 'solana'.
alter table public.flashes add column if not exists viewer_wallet text;

create index if not exists flashes_viewer_wallet_idx
  on public.flashes(viewer_wallet)
  where viewer_wallet is not null;
