-- profiles: store the streamer's Solana wallet address so viewers know where to stream USDC
alter table profiles
  add column if not exists solana_wallet text;

-- bookings: track Solana-specific payment data alongside the existing Stripe fields
alter table bookings
  add column if not exists payment_method text not null default 'stripe',
  add column if not exists stream_id      text,         -- Streamflow contract / metadata address
  add column if not exists tx_signature   text;         -- on-chain tx that created the stream
