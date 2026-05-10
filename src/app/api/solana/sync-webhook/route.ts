import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncHeliusWebhook } from '@/lib/helius';

// Registers the caller's saved `profiles.solana_wallet` with the Helius
// webhook account list. Anonymous access here was a supply-chain DoS: any
// caller could append arbitrary addresses until the Helius limit was hit,
// silently breaking legitimate streamer wallet registration. We now require
// a Supabase bearer token and read the address from the caller's own row
// (which is already RLS-gated to the owner), so the client no longer
// supplies the address.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('solana_wallet')
    .eq('id', user.id)
    .single();

  if (!profile?.solana_wallet) {
    return NextResponse.json({ error: 'No wallet saved on profile' }, { status: 400 });
  }

  try {
    await syncHeliusWebhook(profile.solana_wallet);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[sync-webhook]', err.message);
    // Return 200 so a Helius misconfiguration doesn't block the wallet save UX
    return NextResponse.json({ ok: false, error: err.message });
  }
}
