/**
 * overlay_elements.image_url is per-SLOT, not per-booking — many bookings
 * share the same element_id over time as a queue advances. Any cleanup path
 * that runs long after a booking stopped being the live one for its slot
 * (a viewer's own "recover USDC" tap can happen days after the fact; the
 * daily reconciler's leaked-escrow sweep is explicitly designed to run late)
 * must NOT blindly null the canvas — a different, currently-active booking
 * may have legitimately taken over that same slot since.
 *
 * expire-and-advance avoids this correctly because its clear only ever runs
 * as a direct consequence of the exact row it just confirmed, via a
 * conditional `.eq('status', 'active')` update, WAS the live one. Anything
 * that clears the canvas from a booking that's already terminal by the time
 * it runs (viewer-deny, cleanup-stale-solana, the reconciler's leaked scan)
 * needs this same guarantee some other way — hence this helper.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function clearElementIfNoActiveBooking(
  supabase: SupabaseClient,
  elementId: string,
): Promise<void> {
  const { data: stillActive } = await supabase
    .from('bookings')
    .select('id')
    .eq('element_id', elementId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (stillActive) return;
  await supabase.from('overlay_elements').update({ image_url: null }).eq('id', elementId);
}
