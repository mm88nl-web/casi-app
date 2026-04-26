/**
 * /auth/callback — landing route for OAuth (Google etc.) sign-ins.
 *
 * Supabase appends `?code=...` after the provider redirects back to us.
 * We exchange it for a session via `exchangeCodeForSession`, which writes
 * the session cookie. Then we route based on whether the user already has
 * a `profiles` row:
 *
 *   profile exists → /admin (returning user)
 *   profile missing → /login?finish=true (Google OAuth's first time —
 *                     the user authenticated but hasn't picked a username
 *                     or filled their bio; the login page detects ?finish
 *                     and shows the profile-setup steps directly).
 *
 * `?next` query param overrides the destination, useful for deep-linking
 * a returning user back where they came from.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { logError } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  const errParam = searchParams.get('error_description') || searchParams.get('error');

  if (errParam) {
    // Provider denied / user cancelled. Bounce back to /login with the
    // reason so the page can toast it instead of leaving the user on a
    // generic Supabase error screen.
    return NextResponse.redirect(`${origin}/login?oauth_error=${encodeURIComponent(errParam)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?oauth_error=missing_code`);
  }

  const supabase = await createClient();
  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeErr) {
    logError('auth-callback', exchangeErr, { stage: 'exchange' });
    return NextResponse.redirect(
      `${origin}/login?oauth_error=${encodeURIComponent(exchangeErr.message)}`,
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Exchange succeeded but session somehow has no user — shouldn't
    // happen in practice. Treat as a sign-in failure.
    return NextResponse.redirect(`${origin}/login?oauth_error=no_user`);
  }

  // Profile lookup decides whether this is a new or returning user.
  // First Google sign-in for a user has no profiles row yet.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.redirect(`${origin}/login?finish=true`);
  }

  return NextResponse.redirect(`${origin}${next && next.startsWith('/') ? next : '/admin'}`);
}
