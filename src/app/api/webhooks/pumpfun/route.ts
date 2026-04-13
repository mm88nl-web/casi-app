import { NextResponse } from 'next/server';

// Pump.fun program ID (Devnet) — for observing real-time trade activity only.
// This route does NOT touch the database or business logic.
// In Helius, create a SEPARATE webhook pointing here with:
//   Program ID: 6EF8rSrgUzhZbtCRjMDoocc5nKUvXGGFp7uCrXBEK8S
//   Network: Devnet  |  Type: Enhanced  |  Status: Success

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json({ ok: true });
  }

  for (const event of body) {
    const sig   = event.signature ?? '?';
    const type  = event.type ?? 'UNKNOWN';
    const desc  = event.description ?? '';
    const transfers = (event.tokenTransfers ?? []).map(
      (t: any) => `${t.tokenAmount} ${t.mint?.slice(0, 6)}… → ${t.toUserAccount?.slice(0, 6)}…`,
    );

    console.log(
      `[pump.fun] ${type} | ${sig.slice(0, 8)}… | ${desc || '(no description)'}`,
      transfers.length ? `\n  transfers: ${transfers.join(', ')}` : '',
    );
  }

  // Always 200 — no retries, no credit waste
  return NextResponse.json({ ok: true });
}
