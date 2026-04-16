-- ── Flash Messages ────────────────────────────────────────────────────────────
-- One-time paid chat messages from viewers to streamers.
-- Payment is held (manual capture for Stripe, Streamflow escrow for Solana)
-- until the streamer approves or denies the message.

create table public.flashes (
  id                uuid        primary key default gen_random_uuid(),
  profile_id        uuid        not null references public.profiles(id) on delete cascade,
  viewer_name       text        not null,
  message           text        not null,
  amount_cents      integer     not null,
  currency          text        not null default 'eur',
  status            text        not null default 'pending'
                                check (status in ('pending', 'approved', 'denied')),
  payment_method    text        not null default 'stripe'
                                check (payment_method in ('stripe', 'solana')),
  payment_intent_id text,
  stream_id         text,
  tx_signature      text,
  created_at        timestamptz not null default now()
);

alter table public.flashes enable row level security;

-- Overlay and admin both need to read all flashes for a profile.
create policy "flashes_select_public"
  on public.flashes for select
  using (true);

-- Unauthenticated viewers (anon key, no Supabase session) create flashes.
create policy "flashes_insert_public"
  on public.flashes for insert
  with check (true);

-- Updates: authenticated streamer (via API) or anon viewer (e.g. Solana stream recovery).
create policy "flashes_update_owner_or_anon"
  on public.flashes for update
  using (auth.uid() is null or auth.uid() = profile_id);
