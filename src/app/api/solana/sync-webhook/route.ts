import { NextResponse } from 'next/server';
import { syncHeliusWebhook } from '@/lib/helius';

export async function POST(req: Request) {
  const { address } = await req.json().catch(() => ({}));

  if (!address || typeof address !== 'string') {
    return NextResponse.json({ error: 'address required' }, { status: 400 });
  }

  try {
    await syncHeliusWebhook(address);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[sync-webhook]', err.message);
    // Return 200 so a Helius misconfiguration doesn't block the wallet save
    return NextResponse.json({ ok: false, error: err.message });
  }
}
