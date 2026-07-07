/**
 * GET /api/panel-auth?key=...
 *
 * Logs the owner in via a magic-link session and redirects to /studio —
 * built specifically so casi.gg/studio can be embedded in the streamer's
 * own Tailscale-only stream-control panel, which can't use the normal
 * /login flow: that panel's origin is different from casi.gg's, and the
 * session cookie the normal login flow writes defaults to SameSite=Lax,
 * which browsers refuse to send inside a cross-origin iframe.
 *
 * This route is a NARROW, separate path — it does not change the cookie
 * behavior of the normal /login flow at all. Only the session cookie
 * written HERE gets SameSite=None (required for the cross-origin iframe
 * case), scoped to just this one entry point.
 *
 * Security model: gated entirely by PANEL_ACCESS_KEY (a long random
 * secret, never exposed client-side) plus PANEL_OWNER_EMAIL (which account
 * to log in as — this route only ever authenticates that one, fixed
 * account, never an arbitrary email from the request). Unlike the CSP
 * frame-ancestors restriction, this endpoint itself is reachable from the
 * public internet (Vercel doesn't scope API routes to specific origins) —
 * the secret key is the only protection, so it must be treated like a
 * password and never committed or logged.
 */
import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || '';
  const expected = process.env.PANEL_ACCESS_KEY || '';
  const email = process.env.PANEL_OWNER_EMAIL || '';

  if (!expected || !email) {
    return NextResponse.json({ error: 'panel auth not configured' }, { status: 500 });
  }
  if (!safeEqual(key, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    return NextResponse.json({ error: error?.message || 'link generation failed' }, { status: 500 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, { ...options, sameSite: 'none', secure: true });
          });
        },
      },
    },
  );

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL('/studio', url.origin));
}
