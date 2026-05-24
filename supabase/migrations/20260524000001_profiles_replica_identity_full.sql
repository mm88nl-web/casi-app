-- Required so Supabase realtime can filter UPDATE events on non-PK columns
-- (e.g. id=eq.<profile_id>). Without FULL replica identity the WAL record
-- contains only the changed columns, so the row filter can't match on id.
-- Same pattern applied to the flashes table in 20260428010000.
alter table public.profiles replica identity full;
