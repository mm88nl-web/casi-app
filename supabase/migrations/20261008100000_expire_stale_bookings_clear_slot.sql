-- expire_stale_bookings() runs every minute from pg_cron (job
-- "expire-stale-bookings"). It was created by hand in the dashboard and was
-- never in this repo. The original only flipped bookings to 'expired' and
-- left overlay_elements.image_url untouched, so whenever it beat the
-- viewer's own /api/bookings/expire-and-advance call (or the viewer had
-- closed the tab), the slot kept showing the finished beam/backdrop forever:
-- on /obs, on the Studio canvas, with nothing listed under "On air". The
-- route then no-ops on 'not_active', so nothing else ever cleaned it up and
-- a queued booking behind it was never promoted.
--
-- This version does the same slot handling expire-and-advance does:
--   no queued booking      -> clear the slot
--   next is free / Stripe  -> promote it (DB flip + slot image, no money moves)
--   next is Solana         -> clear the slot, leave it approved_queued
--                             (start_beam must land on-chain first; the
--                             streamer uses Play now)

CREATE OR REPLACE FUNCTION public.expire_stale_bookings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  expired_count integer;
  slot_ids uuid[];
  slot_id uuid;
  nxt record;
BEGIN
  WITH done AS (
    UPDATE public.bookings
    SET status = 'expired',
        image_url = NULL
    WHERE status = 'active'
      AND started_at IS NOT NULL
      AND duration_minutes IS NOT NULL
      AND started_at + (duration_minutes * interval '1 minute') < now()
    RETURNING element_id
  )
  SELECT count(*), array_agg(DISTINCT element_id) FILTER (WHERE element_id IS NOT NULL)
    INTO expired_count, slot_ids
  FROM done;

  FOREACH slot_id IN ARRAY coalesce(slot_ids, '{}'::uuid[]) LOOP
    -- Another booking already took the slot over: its image is the live one.
    IF EXISTS (SELECT 1 FROM public.bookings
               WHERE element_id = slot_id AND status = 'active') THEN
      CONTINUE;
    END IF;

    SELECT id, image_url, payment_method INTO nxt
    FROM public.bookings
    WHERE element_id = slot_id AND status = 'approved_queued'
    ORDER BY approved_at ASC NULLS LAST
    LIMIT 1;

    IF FOUND AND nxt.payment_method IS DISTINCT FROM 'solana' THEN
      UPDATE public.bookings
      SET status = 'active', started_at = now()
      WHERE id = nxt.id AND status = 'approved_queued';
      UPDATE public.overlay_elements SET image_url = nxt.image_url WHERE id = slot_id;
    ELSE
      UPDATE public.overlay_elements SET image_url = NULL WHERE id = slot_id;
    END IF;
  END LOOP;

  RETURN expired_count;
END;
$function$;
