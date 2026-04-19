import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Keypair } from '@solana/web3.js';
import { sealSessionSecret } from '@/lib/delegate-crypto';
import { logError } from '@/lib/observability';

/**
 * Install (or rotate) a session-key delegate for the authenticated streamer.
 *
 * Flow:
 *   1. Verify Supabase bearer token → `user.id`.
 *   2. Validate `expiresAt` (must be in the future, capped to 180 days).
 *   3. Generate a fresh ed25519 keypair server-side.
 *   4. Encrypt the 64-byte secret key with AES-256-GCM + DELEGATE_ENCRYPTION_KEY.
 *   5. Upsert the row keyed by `profile_id` — rotation replaces the prior
 *      delegate in place, matching the on-chain `init_if_needed` behavior.
 *   6. Return `{ sessionPubkey, expiresAt }` so the streamer's client can
 *      sign the on-chain `set_delegate` tx. The secret NEVER leaves the
 *      server.
 *
 * Errors are returned as JSON with a `reason` the UI can switch on.
 */

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Mirrors MAX_DELEGATE_LIFETIME_SECS in programs/casi-escrow/src/lib.rs. */
const MAX_LIFETIME_SECS = 180 * 24 * 60 * 60;
/** Sensible minimum — avoids races where the tx lands post-expiry. */
const MIN_LIFETIME_SECS = 60;

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { lifetimeSecs?: number } = {};
  try { body = (await req.json()) ?? {}; } catch { /* empty body is fine */ }

  const requested = Number(body.lifetimeSecs ?? MAX_LIFETIME_SECS);
  if (!Number.isFinite(requested) || requested < MIN_LIFETIME_SECS) {
    return NextResponse.json(
      { error: `lifetimeSecs must be a number ≥ ${MIN_LIFETIME_SECS}`, reason: 'invalid_lifetime' },
      { status: 400 },
    );
  }
  const lifetime = Math.min(Math.floor(requested), MAX_LIFETIME_SECS);
  const expiresAt = Math.floor(Date.now() / 1000) + lifetime;

  // Generate the session keypair inside the process — the secret never reaches
  // the client. Using Keypair.generate() pulls from Node's CSPRNG.
  const keypair = Keypair.generate();

  let encryptedSecret: string;
  try {
    encryptedSecret = sealSessionSecret(keypair.secretKey);
  } catch (err) {
    logError('delegates-install', err, { profile_id: user.id, scope: 'sealSessionSecret' });
    return NextResponse.json(
      { error: 'Server crypto misconfigured', reason: 'crypto_error' },
      { status: 500 },
    );
  }

  const { error: dbErr } = await supabase
    .from('streamer_delegates')
    .upsert({
      profile_id:       user.id,
      session_pubkey:   keypair.publicKey.toBase58(),
      encrypted_secret: encryptedSecret,
      expires_at:       new Date(expiresAt * 1000).toISOString(),
      rotated_at:       new Date().toISOString(),
      revoked_at:       null,
    }, { onConflict: 'profile_id' });
  if (dbErr) {
    logError('delegates-install', dbErr, { profile_id: user.id });
    return NextResponse.json(
      { error: 'Failed to persist delegate', reason: 'db_error' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    sessionPubkey: keypair.publicKey.toBase58(),
    expiresAt,  // unix seconds — client passes this verbatim into set_delegate
    lifetimeSecs: lifetime,
  });
}
