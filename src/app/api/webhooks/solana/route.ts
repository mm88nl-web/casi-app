import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const STREAMFLOW_PROGRAM_ID = 'strmRqUvRpeYvH9bZfBy86M8nmUqh5pGEF2p9Vv4v';
const USDC_DEVNET_MINT       = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  for (const event of body) {
    // Only process Streamflow USDC transactions
    const isStreamflow = event.instructions?.some(
      (ix: any) => ix.programId === STREAMFLOW_PROGRAM_ID,
    );
    const isUsdc = event.tokenTransfers?.some(
      (t: any) => t.mint === USDC_DEVNET_MINT,
    );
    if (!isStreamflow || !isUsdc) continue;

    const txSignature: string = event.signature;
    if (!txSignature) continue;

    // Match to the booking that stored this tx_signature at stream-creation time
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('tx_signature', txSignature)
      .eq('status', 'pending')
      .single();

    if (error || !booking) {
      console.warn('[solana webhook] no pending booking for tx', txSignature);
      continue;
    }

    // Activate the booking — the streamer's admin panel will now show it
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'active' })
      .eq('id', booking.id);

    if (updateError) {
      console.error('[solana webhook] failed to activate booking', booking.id, updateError);
    } else {
      console.log('[solana webhook] activated booking', booking.id, 'via tx', txSignature);
    }
  }

  return NextResponse.json({ ok: true });
}
