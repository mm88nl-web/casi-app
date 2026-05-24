-- Enable realtime for the profiles table so skin / theme changes made in
-- studio settings propagate to open overlay pages without a reload.
--
-- The overlay subscribes to UPDATE events on this table (filtered to the
-- specific profile_id) to merge new skin/theme_color values into local
-- React state, which SkinProvider then applies as CSS variables immediately.
--
-- Guard: no-op if already in the publication (e.g. toggled via Dashboard).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
