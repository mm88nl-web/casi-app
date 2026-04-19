import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logError } from '@/lib/observability';

/**
 * Revoke the authenticated streamer's session-key delegate.
 *
 * Server-side effect: flips `revoked_at = now()` on the row. The auto-crank
 * path checks this column before it attempts to sign, so the instant this
 * route returns, the server stops using the key.
 *
 * On-chain revoke is a separate streamer-signed tx (`revoke_delegate`) — this
 * route only handles the DB side. Splitting them means the UI can show
 * "revoking…" the moment the server confirms, without waiting for a slot.
 *
 * Idempotent: re-calling for an already-revoked or non-existent delegate
 * returns 200 with `{ ok: true, alreadyRevoked: true }`.
 */

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('streamer_delegates')
    .update({ revoked_at: new Date().toISOString() })
    .eq('profile_id', user.id)
    .is('revoked_at', null)
    .select('session_pubkey')
    .maybeSingle();

  if (error) {
    logError('delegates-revoke', error, { profile_id: user.id });
    return NextResponse.json(
      { error: 'Failed to revoke delegate', reason: 'db_error' },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  return NextResponse.json({
    ok: true,
    revokedSessionPubkey: data.session_pubkey,
  });
}
