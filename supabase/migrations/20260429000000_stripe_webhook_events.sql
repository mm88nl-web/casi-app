-- ── Stripe webhook event ledger ──────────────────────────────────────────
-- Stripe retries webhook deliveries on 5xx or timeout. Without dedup the
-- same event can fire a handler twice — double-updating a booking row, or
-- (worse, with new handlers) issuing a refund twice. We insert the event
-- id first with ON CONFLICT DO NOTHING; if the row already exists the
-- handler short-circuits and returns 200.
--
-- Service-role only: the webhook handler writes, nothing else reads.
-- No anon / authenticated grants. RLS is enabled with no policies so
-- direct PostgREST access is denied even if grants somehow leak.
--
-- Growth note: ~1 row per webhook delivery. At current volumes this is
-- a handful of rows per day; no pruning job is needed yet. If the table
-- gets large, add a daily cron that deletes rows older than 30 days.

create table if not exists public.stripe_webhook_events (
  event_id    text        primary key,
  type        text        not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

revoke all on public.stripe_webhook_events from anon, authenticated;
