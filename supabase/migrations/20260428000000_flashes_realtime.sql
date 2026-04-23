-- Enable Supabase Realtime broadcasts on the flashes table.
--
-- Every flash-display surface in the app already subscribes to
-- postgres_changes on flashes:
--   - admin/page.tsx pendingFlashes (Requests tab)
--   - overlay/page.tsx FlashFeed (OBS ephemeral pop-ups)
--   - overlay/page.tsx FlashPanel (viewer chat-style feed)
--   - components/FlashPanel.tsx (admin studio embedded feed)
--
-- But Supabase doesn't broadcast changes to tables that aren't in
-- the `supabase_realtime` publication. The flashes table was never
-- added — probably missed during initial setup because bookings and
-- overlay_elements were toggled on via the Supabase dashboard and
-- flashes wasn't. Result: new flashes / approvals / denials never
-- reached any subscriber; streamers had to hit refresh to see
-- pending flashes and viewers had to refresh to see approved ones.
--
-- Idempotent — safe to re-run. Skips if flashes is already in the
-- publication (e.g. someone already toggled it in the dashboard).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'flashes'
  ) then
    alter publication supabase_realtime add table public.flashes;
  end if;
end $$;
