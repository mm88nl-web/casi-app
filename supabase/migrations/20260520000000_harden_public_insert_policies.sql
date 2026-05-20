-- All booking and flash inserts go through server routes (service_role), which bypass
-- RLS entirely. The public INSERT policies below serve no legitimate purpose and allow
-- anyone to bypass server-side validation by calling PostgREST directly. Removing them
-- closes a queue-spam / fake-free-booking abuse vector.

-- bookings: remove the anon insert path entirely
DROP POLICY IF EXISTS bookings_insert_public ON public.bookings;

-- flashes: same
DROP POLICY IF EXISTS flashes_insert_public ON public.flashes;

-- chat_messages: insert policy has WITH CHECK (true) — no constraint at all.
-- If chat is not a live product feature, remove it; if it is, restrict it.
DROP POLICY IF EXISTS chat_insert_public ON public.chat_messages;

-- Revoke the now-redundant column-level INSERT privilege on cancel_token from
-- anon and authenticated — they can no longer insert rows at all via PostgREST.
REVOKE INSERT (cancel_token) ON public.bookings FROM anon;
REVOKE INSERT (cancel_token) ON public.bookings FROM authenticated;

-- Revoke anon SELECT on stripe_account_id — it's a live Stripe Connect identifier
-- that viewers have no reason to read. Streamer-owned pages read it via service_role.
REVOKE SELECT (stripe_account_id) ON public.profiles FROM anon;

-- Fix mutable search_path on the reserved-username trigger function.
-- The function body already qualifies the table reference (public.reserved_usernames)
-- so this is a defence-in-depth hardening, not a functional change.
CREATE OR REPLACE FUNCTION public.profiles_block_reserved_username()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.username IS NULL THEN
    RETURN NEW;
  END IF;
  -- Allow UPDATE that keeps the same username (grandfathered handles, e.g. 'casi').
  IF TG_OP = 'UPDATE' AND OLD.username = NEW.username THEN
    RETURN NEW;
  END IF;
  IF public.username_is_reserved(NEW.username) THEN
    RAISE EXCEPTION 'username % is reserved', NEW.username
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Revoke unnecessary public EXECUTE on the event-trigger helper. It cannot be called
-- via PostgREST (event triggers fire on DDL only) but the grant is misleading.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
