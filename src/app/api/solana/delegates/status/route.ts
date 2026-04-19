import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logError } from '@/lib/observability';

/**
 * Read the authenticated streamer's current delegate status. UI helper: the
 * admin page calls this on mount to decide which card state to render
 * (not installed / installed / expired / revoked).
 *
 * Only returns the public fields — session_pubkey, timestamps. Never leaks
 * the encrypted secret.
 */

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: Request) {
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
    .select('session_pubkey, expires_at, rotated_at, revoked_at, created_at')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (error) {
    logError('delegates-status', error, { profile_id: user.id });
    return NextResponse.json(
      { error: 'Failed to read delegate', reason: 'db_error' },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ installed: false });
  }

  const now   = Date.now();
  const expAt = Date.parse(data.expires_at);
  const expired = Number.isFinite(expAt) && expAt <= now;

  return NextResponse.json({
    installed: true,
    sessionPubkey: data.session_pubkey,
    expiresAt:     Math.floor(expAt / 1000),
    rotatedAt:     data.rotated_at,
    createdAt:     data.created_at,
    revoked:       !!data.revoked_at,
    revokedAt:     data.revoked_at,
    expired,
  });
}
