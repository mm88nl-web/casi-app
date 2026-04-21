/**
 * POST /api/bookings/cleanup-stale-solana
 *
 * Bulk reconciler for "ghost" RECOVER USDC chips. When a viewer switches
 * wallets, upgrades the app across a breaking change, or otherwise ends up
 * with rows whose on-chain escrow has already closed but whose DB still has
 * `escrow_pda` set, this route probes each PDA and nulls `escrow_pda` on the
 * ones that are actually gone. Rows where the PDA is still alive (pending or
 * active funds) are left untouched — the viewer still needs to sign a real
 * `cancel_escrow` / `settle_beam` from the overlay chip to recover those.
 *
 * Auth model: none. The only write this route performs is `escrow_pda = null`
 * on rows scoped to the supplied `viewer_wallet`, and only after confirming
 * on-chain that the PDA has closed (funds already distributed by the program).
 * No funds move, no status changes, and the blast radius is "an attacker can
 * clear the escrow_pda column on rows belonging to a wallet they specify,
 * which only breaks the viewer's own recovery chip". We accept that tradeoff
 * to keep the flow usable across browsers without bearer tokens or signed
 * challenges.
 *
 * Request:  { viewer_wallet, profile_id? }
 * Response: {
 *             cleaned: number,       // PDAs gone, DB cleared
 *             stillOpen: number,     // PDAs still alive, viewer must sign
 *             errors: number,        // RPC probe failed, try again later
 *           }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logError } from '@/lib/observability';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Loose base58 check — just enough to reject obvious garbage before we hit
// PublicKey() and waste RPC budget. Solana pubkeys are 32-44 base58 chars.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const viewer_wallet: string | undefined = body?.viewer_wallet;
  const profile_id: string | undefined = body?.profile_id;

  if (!viewer_wallet || typeof viewer_wallet !== 'string' || !BASE58_RE.test(viewer_wallet)) {
    return NextResponse.json({ error: 'viewer_wallet required' }, { status: 400 });
  }

  let query = supabase
    .from('bookings')
    .select('id, escrow_pda')
    .eq('viewer_wallet', viewer_wallet)
    .eq('payment_method', 'solana')
    .not('escrow_pda', 'is', null)
    .in('status', ['denied', 'expired', 'cancelled'])
    .limit(100);
  if (profile_id) query = query.eq('profile_id', profile_id);

  const { data: rows, error: selectErr } = await query;
  if (selectErr) {
    logError('cleanup-stale-solana', selectErr, { viewer_wallet });
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ cleaned: 0, stillOpen: 0, errors: 0 });
  }

  const { Connection, PublicKey } = await import('@solana/web3.js');
  const { SOLANA_RPC } = await import('@/lib/solana-network');
  const conn = new Connection(SOLANA_RPC, 'confirmed');

  let cleaned = 0;
  let stillOpen = 0;
  let errors = 0;

  // Sequential probe: 100-row ceiling means worst case ~100 RPC calls, and
  // Helius rate-limits bursts. A short-circuit parallel fan-out is available
  // if this ever shows up as slow — for now the simple loop is plenty.
  for (const row of rows) {
    if (!row.escrow_pda) continue;
    let pda;
    try {
      pda = new PublicKey(row.escrow_pda);
    } catch {
      // Garbage escrow_pda value — safe to null out.
      await supabase.from('bookings').update({ escrow_pda: null }).eq('id', row.id);
      cleaned++;
      continue;
    }
    try {
      const info = await conn.getAccountInfo(pda);
      if (!info) {
        await supabase.from('bookings').update({ escrow_pda: null }).eq('id', row.id);
        cleaned++;
      } else {
        stillOpen++;
      }
    } catch (err) {
      errors++;
      logError('cleanup-stale-solana', err, { booking_id: row.id });
    }
  }

  return NextResponse.json({ cleaned, stillOpen, errors });
}
