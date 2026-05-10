// Supabase Edge Function: expire-bookings
// Runs on a cron schedule every minute
// Finds all active bookings past their duration and expires them,
// then auto-starts the next approved_queued booking if one exists

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const now = new Date().toISOString();

  // Find all active bookings that have passed their end time
  const { data: expired, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'active')
    .not('started_at', 'is', null)
    .not('duration_minutes', 'is', null);

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  const toExpire = (expired || []).filter(booking => {
    const started = new Date(booking.started_at).getTime();
    const expiresAt = started + booking.duration_minutes * 60 * 1000;
    return Date.now() > expiresAt;
  });

  let expiredCount = 0;
  let startedCount = 0;

  for (const booking of toExpire) {
    // Mark booking as expired
    await supabase.from('bookings').update({ status: 'expired' }).eq('id', booking.id);
    expiredCount++;

    if (booking.element_id) {
      // Check for next approved_queued booking on this slot
      const { data: next } = await supabase
        .from('bookings')
        .select('*')
        .eq('element_id', booking.element_id)
        .eq('status', 'approved_queued')
        .order('approved_at', { ascending: true })
        .limit(1)
        .single();

      if (next) {
        // Auto-start the next booking
        await supabase.from('bookings')
          .update({ status: 'active', started_at: now })
          .eq('id', next.id);
        await supabase.from('overlay_elements')
          .update({ image_url: next.image_url })
          .eq('id', next.element_id);
        startedCount++;
      } else {
        // No queue — clear the slot image
        await supabase.from('overlay_elements')
          .update({ image_url: '' })
          .eq('id', booking.element_id);
      }
    }
  }

  return new Response(
    JSON.stringify({ expired: expiredCount, started: startedCount, checked: (expired || []).length }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
