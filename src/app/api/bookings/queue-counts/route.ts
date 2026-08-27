/**
 * POST /api/bookings/queue-counts
 *
 * Public per-slot pending-queue counts, with zero PII surface. Replaces the
 * old client query `supabase.from('bookings').select('element_id')
 * .eq('status','pending')` — element_id-only, but still a direct anon read
 * of the `pending` status bucket. Now that anon RLS no longer exposes
 * `pending` rows at all (20260827010000_narrow_anon_select_policies.sql),
 * that query would just return empty; this route replaces it properly
 * rather than leaving queue-availability display silently broken.
 *
 * Runs as service_role, returns only aggregate counts — no viewer_name,
 * message, or any other row content ever leaves this route. Takes only
 * profile_id (no element_ids filter) so the client can fire it in parallel
 * with its other profile-load queries instead of waiting on
 * overlay_elements to resolve first.
 *
 * Request body: { profile_id: string }
 * Response:     { counts: Record<element_id, number> }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const profileId = body?.profile_id;

  if (!profileId) {
    return NextResponse.json({ error: 'profile_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('element_id')
    .eq('profile_id', profileId)
    .eq('status', 'pending');

  if (error) {
    console.error('[bookings/queue-counts] query failed:', error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    if (row.element_id) counts[row.element_id] = (counts[row.element_id] || 0) + 1;
  }

  return NextResponse.json({ counts });
}
