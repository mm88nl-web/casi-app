-- Add settle_tx_signature (the on-chain approve/deny transaction signature).
-- viewer_wallet is already added by 20260416200000_add_viewer_wallet_to_flashes.sql
-- but we keep the IF NOT EXISTS guard in case a cluster only ran the later one.
alter table public.flashes add column if not exists viewer_wallet text;
alter table public.flashes add column if not exists settle_tx_signature text;
