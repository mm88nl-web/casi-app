"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { CasiMark } from '@/components/v9';
import TurnstileWidget from '@/components/TurnstileWidget';

/** Google's "G" mark — official 4-color SVG, no external assets. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5c-2 1.5-4.5 2.5-7.5 2.5-5.3 0-9.7-3.3-11.3-8L6 32.6C9.4 39.6 16.1 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.5l6.5 5.5c-.5.4 6.2-4.5 6.2-15 0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}

/** Twitch glyph — official purple, no external assets. */
function TwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="#9146FF" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657L23.463 14.5V0H2.149zm19.165 13.612l-3.582 3.582h-5.731l-3.045 3.045v-3.045H4.119V1.612h17.195v12zm-4.93-9.493v6.687h-2.149V4.119h2.149zm-5.731 0v6.687H8.504V4.119h2.149z"/>
    </svg>
  );
}

/** Discord glyph — official blurple, no external assets. */
function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="#5865F2" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 00-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 00-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02C2.05 9.41 1.3 13.39 1.67 17.32c0 .02.01.04.03.05 1.79 1.32 3.5 2.13 5.19 2.66.03.01.06 0 .07-.02.39-.54.74-1.11 1.04-1.71.02-.04 0-.08-.04-.09-.56-.21-1.09-.47-1.61-.78-.04-.02-.04-.08 0-.11.11-.08.22-.17.32-.25.02-.02.05-.02.07-.01 3.42 1.56 7.13 1.56 10.51 0 .02-.01.05-.01.07.01.1.09.21.17.32.25.04.03.04.09 0 .11-.51.31-1.05.57-1.61.78-.04.01-.05.06-.04.09.31.6.66 1.17 1.04 1.71.03.02.06.03.09.02 1.7-.53 3.41-1.34 5.2-2.66.02-.01.03-.03.03-.05.43-4.52-.79-8.47-3.32-11.95-.01-.01-.02-.02-.03-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12 0-1.17.84-2.12 1.89-2.12 1.06 0 1.91.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12 0-1.17.84-2.12 1.89-2.12 1.06 0 1.91.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
    </svg>
  );
}

/** X (Twitter) glyph — neutral fill since X dropped its blue. */
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

type Step = 'account' | 'username' | 'profile';
const STEPS: Step[] = ['account', 'username', 'profile'];
const STEP_LABELS = ['Account', 'Username', 'Profile'];

// Minimum password length. Matches the Supabase Auth setting we want
// configured in the dashboard (Auth → Policies → Min password length).
// Bumping client + server in sync prevents the form from advancing on
// passwords Supabase would reject anyway.
const PASSWORD_MIN_LENGTH = 8;

// Avatar URL guard. Mirrors the DB CHECK constraint
// (migrations/20260511000000) so the form rejects unusable URLs before
// the insert round-trips. Extension list is the common image types
// browsers can <img> render. Query strings are stripped before matching
// so signed CDN URLs (.png?token=...) still pass.
const AVATAR_MAX_LEN = 1024;
const AVATAR_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i;
function isPlausibleAvatarUrl(url: string): boolean {
  if (!url) return true; // optional
  if (url.length > AVATAR_MAX_LEN) return false;
  if (!url.startsWith('https://')) return false;
  // We accept either a recognizable image extension OR a common image-host
  // shape (avatars.githubusercontent.com etc. don't use extensions). The
  // <img> onLoad/onError in step 3 is the final word — this is a guard
  // against the obvious nasties only.
  try {
    const parsed = new URL(url);
    if (!/^[a-z0-9.-]+$/i.test(parsed.hostname)) return false;
    if (AVATAR_EXT_RE.test(parsed.pathname)) return true;
    // Whitelisted image hosts that don't include extensions in their URLs.
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith('.githubusercontent.com') ||
      host.endsWith('.googleusercontent.com') ||
      host.endsWith('.discordapp.com') ||
      host.endsWith('.discordapp.net') ||
      host.endsWith('.twimg.com') ||
      host.endsWith('.jtvnw.net') ||  // Twitch
      host === 'gravatar.com' ||
      host.endsWith('.gravatar.com')
    );
  } catch {
    return false;
  }
}

// TOS version recorded at signup time. Bump the string when the legal
// text changes (e.g. 'v2-2026-07') so the DB row pins exactly which
// version this user agreed to.
const TOS_VERSION = 'v1-2026-05';

export default function AuthPage() {
  // mode
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  // sign-in fields
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  // sign-up fields
  const [step, setStep]                     = useState<Step>('account');
  const [regEmail, setRegEmail]             = useState('');
  const [regPassword, setRegPassword]       = useState('');
  const [username, setUsername]             = useState('');
  const [displayName, setDisplayName]       = useState('');
  const [bio, setBio]                       = useState('');
  const [avatarUrl, setAvatarUrl]           = useState('');
  const [avatarValid, setAvatarValid]       = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle'|'checking'|'taken'|'available'>('idle');
  const [acceptedTos, setAcceptedTos]       = useState(false);
  // shared
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  // True iff we landed on step='username' with an already-live Supabase session
  // (i.e. user completed OAuth but bailed before picking a username). Used to
  // show a "Use a different account" escape hatch.
  const [postOAuth, setPostOAuth] = useState(false);
  // Cloudflare Turnstile token. Set to 'dev-skip' when NEXT_PUBLIC_TURNSTILE_SITE_KEY
  // is unset (TurnstileWidget short-circuits). When Supabase has CAPTCHA
  // enabled in the dashboard, sending a token is mandatory on signUp /
  // signInWithPassword — without it the auth call fails. We pass it
  // unconditionally when present and Supabase ignores it on projects
  // that don't have CAPTCHA enabled, so this is safe in both modes.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Memoize onVerify so TurnstileWidget's effect doesn't re-render the
  // widget on every parent re-render (would burn through anti-replay
  // quotas and flash the widget UI).
  const onCaptchaVerify = useCallback((t: string) => setCaptchaToken(t), []);
  const onCaptchaExpire = useCallback(() => setCaptchaToken(null), []);
  // Only forward the token to Supabase when it's a real one; 'dev-skip'
  // is our sentinel for "no Turnstile configured" — passing it would
  // make Supabase reject the auth call if CAPTCHA is enabled there.
  const realCaptchaToken = captchaToken && captchaToken !== 'dev-skip' ? captchaToken : undefined;
  const router  = useRouter();
  const supabase = useRef(createClient()).current;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // Redirect to studio if already signed in, and respect ?tab=signup.
  // Special case — `?finish=true` lands here from /auth/callback when a
  // Google sign-in succeeded but the user has no profiles row yet. We
  // jump them to step 2 (username) of signup with display_name + avatar
  // pre-filled from their Google metadata. The auth.users row already
  // exists, so the final submit just inserts into profiles.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const finish = params.get('finish') === 'true';
    const oauthErr = params.get('oauth_error');
    if (oauthErr) setError(oauthErr);
    if (params.get('tab') === 'signup') setMode('signup');

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      // If the URL says ?finish=true OR they have a session but no profile,
      // pivot into the post-OAuth profile-setup flow.
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (profile && !finish) {
        router.replace('/studio');
        return;
      }
      // Profile missing → finish setup. Pre-fill from Google metadata.
      const meta = session.user.user_metadata || {};
      setMode('signup');
      setStep('username');
      setPostOAuth(true);
      setRegEmail(session.user.email ?? '');
      setDisplayName(meta.full_name || meta.name || '');
      if (typeof meta.avatar_url === 'string' && meta.avatar_url.startsWith('http')) {
        setAvatarUrl(meta.avatar_url);
        setAvatarValid(true);
      }
      setAcceptedTos(true); // Google ToS-equivalent — they signed in via Google.
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = (m: 'signin' | 'signup') => {
    setMode(m);
    setError('');
    setStep('account');
  };

  /* ── Sign in ── */
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: realCaptchaToken ? { captchaToken: realCaptchaToken } : undefined,
    });
    if (err) { setError(err.message); setLoading(false); }
    else router.push('/studio');
  };

  /* ── Sign in or sign up with an OAuth provider ──
   * Same call for both — Supabase creates an auth.users row on first
   * sign-in, returns an existing session on subsequent ones. The
   * /auth/callback route distinguishes new vs returning by checking
   * whether a `profiles` row exists for the user, regardless of which
   * provider was used.
   *
   * Each provider must also be enabled in the Supabase Dashboard
   * (Authentication → Providers) with its client id + secret. If a
   * provider is enabled in the UI here but not in the dashboard, the
   * button will surface a "provider is not enabled" error.
   */
  type OAuthProvider = 'google' | 'twitch' | 'discord' | 'x';
  const handleOAuth = async (provider: OAuthProvider) => {
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${origin}/auth/callback${mode === 'signup' ? '?next=/admin' : ''}`,
      },
    });
    if (err) { setError(err.message); setLoading(false); }
    // No success branch — Supabase redirects the tab to the provider.
  };

  /* ── Sign up ── step 1 */
  const handleAccountStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (regPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }
    if (!acceptedTos) { setError('Please accept the Terms and Privacy Policy'); return; }
    setStep('username');
  };

  /* ── Sign up ── username check
   *
   * Two-stage check, fail-closed:
   *   (1) Reserved list — server-seeded table of route-shadowing handles.
   *   (2) Uniqueness — case-insensitive lookup, matches the DB UNIQUE
   *       index on LOWER(username).
   *
   * .maybeSingle() returns { data: null } when no row matches, instead
   * of .single()'s "0 rows" error which the old code was implicitly
   * swallowing as "available". maybeSingle differentiates "no match"
   * (available) from "real error" (network etc., where we should NOT
   * say available).
   *
   * The DB CHECK constraint is the final word; this is just UX. If the
   * client check passes but the trigger blocks, the insert error path
   * surfaces it.
   */
  const checkUsername = async (val: string) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
    setUsername(cleaned);
    if (cleaned.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    // Reserved-list lookup first — cheaper, also doesn't depend on
    // network race outcomes if both queries fire in parallel.
    const { data: reserved } = await supabase
      .from('reserved_usernames')
      .select('username')
      .eq('username', cleaned)
      .maybeSingle();
    if (reserved) { setUsernameStatus('taken'); return; }
    const { data: taken, error: lookupError } = await supabase
      .from('profiles')
      .select('username')
      .ilike('username', cleaned)
      .maybeSingle();
    if (lookupError) { setUsernameStatus('idle'); return; }
    setUsernameStatus(taken ? 'taken' : 'available');
  };

  const handleUsernameStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus !== 'available') return;
    setDisplayName(username);
    setStep('profile');
  };

  /* ── Sign up ── final */
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Two paths converge here:
    //   1. Email/password signup — auth user doesn't exist yet, sign them up.
    //   2. Post-Google "finish profile" — auth user exists, just need to
    //      INSERT into profiles. We detect this by checking the current
    //      session: if it's already authenticated, skip auth.signUp.
    const { data: { session } } = await supabase.auth.getSession();
    let userId = session?.user.id ?? null;

    if (!userId) {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: regEmail,
        password: regPassword,
        options: realCaptchaToken ? { captchaToken: realCaptchaToken } : undefined,
      });
      if (authError) {
        // Generic error message — don't differentiate "email already
        // registered" from other auth errors. Telling the user "that
        // email already has an account" is a user-enumeration vector
        // (someone fishing a list of emails can confirm CASI accounts).
        // The "try signing in" hint is still useful — if they did
        // register before, the sign-in tab will work; if they didn't,
        // the generic message just nudges them to retry.
        setError('Could not create account. If you already have one, try signing in instead.');
        setEmail(regEmail);
        setPassword('');
        setLoading(false);
        return;
      }
      if (!authData.user) { setError('Signup failed. Please try again.'); setLoading(false); return; }
      userId = authData.user.id;
    }

    // Final avatar URL gate — even though step 3 hides the field if not
    // validated, a determined user could still submit a non-image URL.
    // DB CHECK catches it but the error message is opaque; gate here for
    // a clearer message.
    const avatarToWrite = avatarValid && isPlausibleAvatarUrl(avatarUrl) ? avatarUrl : null;
    if (avatarUrl && !avatarToWrite) {
      setError('Avatar URL must be an https:// link to an image (.png, .jpg, .gif, .webp, .svg, .avif).');
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      username,
      display_name: (displayName || username).slice(0, 64),
      bio: bio ? bio.slice(0, 320) : null,
      avatar_url: avatarToWrite,
      is_live: false,
      tos_accepted_at: new Date().toISOString(),
      tos_version: TOS_VERSION,
    });
    if (profileError) {
      // The DB has UNIQUE + CHECK constraints; surface a friendly
      // message when we know the cause, otherwise echo the error verbatim
      // (these errors are rare on the happy path and the verbose form
      // helps debugging when something goes sideways).
      const msg = profileError.message.toLowerCase();
      if (msg.includes('reserved')) {
        setError('That username is reserved. Try a different one.');
        setStep('username');
        setUsernameStatus('taken');
      } else if (msg.includes('duplicate key') || msg.includes('unique')) {
        setError('That username was just taken. Try a different one.');
        setStep('username');
        setUsernameStatus('taken');
      } else {
        setError('Could not create profile: ' + profileError.message);
      }
      setLoading(false);
      return;
    }
    router.push('/studio');
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .auth-page {
          /* Apothecary palette — matches landing + search */
          --casi-bg:         #f5e1d2;
          --casi-surface:    #ede0cf;
          --casi-surface-2:  #e4d4be;
          --casi-border:     rgba(34, 26, 20, 0.14);
          --casi-border-2:   rgba(34, 26, 20, 0.26);
          --casi-accent:     #294b3c;
          --casi-accent-rgb: 41, 75, 60;
          --casi-dot:        #c04830;
          --casi-text:       #221a14;
          --casi-text-muted: #6a574b;
          --casi-text-mid:   #8a7a5a;
          --casi-text-dim:   #a89a8a;
          --ink:             #294b3c;

          min-height: 100vh;
          background: var(--casi-bg);
          display: grid;
          grid-template-columns: 1fr 1fr;
          font-family: var(--font-casi-sans), sans-serif;
        }

        /* Left panel */
        .auth-left {
          background: var(--casi-surface);
          border-right: 1px solid var(--casi-border);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 52px 48px;
          position: relative;
          overflow: hidden;
        }
        /* Accent radial glow — bottom-left corner */
        .auth-left::before {
          content: '';
          position: absolute;
          bottom: -140px; left: -100px;
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(var(--casi-accent-rgb),0.07) 0%, transparent 65%);
          pointer-events: none;
        }
        /* v7 dot grid (replaces v3 line grid) */
        .auth-left::after {
          content: '';
          position: absolute; inset: 0;
          background-image: radial-gradient(circle, rgba(var(--casi-accent-rgb),0.12) 1px, transparent 1px);
          background-size: 32px 32px;
          opacity: 0.4;
          pointer-events: none;
        }
        .auth-brand { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: flex-start; }
        .auth-brand-row { display: flex; align-items: center; gap: 10px; margin-bottom: 0; }
        .auth-brand-name { font-family: var(--H); font-size: 28px; font-weight: 800; color: var(--casi-text); letter-spacing: -0.04em; }
        .auth-brand-tag  { font-family: var(--M); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-4); margin-top: 5px; }

        .auth-quote { position: relative; z-index: 1; }
        .auth-quote-text { font-family: var(--font-casi-display), var(--font-casi-sans), sans-serif; font-size: clamp(22px, 2.5vw, 30px); font-weight: 800; color: var(--casi-text); line-height: 1.2; letter-spacing: -1px; margin-bottom: 14px; }
        /* Outline treatment — same move as the landing headline */
        .auth-quote-text .o { -webkit-text-stroke: 1.5px rgba(var(--casi-accent-rgb), 0.65); color: transparent; }
        .auth-quote-sub  { font-family: var(--font-casi-mono), monospace; font-size: 11px; color: var(--casi-text-dim); letter-spacing: 0.14em; text-transform: uppercase; }

        /* Step indicators */
        .left-steps { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 0; }
        .left-step  { display: flex; align-items: center; gap: 14px; }
        .left-step-dot {
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-casi-mono), monospace; font-size: 11px; font-weight: 500;
          flex-shrink: 0; transition: all .25s;
        }
        .left-step-dot.done    { background: var(--casi-accent); color: var(--casi-bg); }
        .left-step-dot.current { background: rgba(var(--casi-accent-rgb),0.14); border: 1px solid rgba(var(--casi-accent-rgb),0.4); color: var(--casi-accent); }
        .left-step-dot.pending { background: rgba(34,26,20,0.06); border: 1px solid var(--casi-border); color: var(--casi-text-dim); }
        .left-step-label { font-family: var(--font-casi-mono), monospace; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; transition: color .25s; }
        .left-step-label.done    { color: var(--casi-accent); }
        .left-step-label.current { color: var(--casi-text); }
        .left-step-label.pending { color: var(--casi-text-dim); }
        .left-step-connector { width: 1px; height: 20px; background: var(--casi-border); margin-left: 15px; }

        /* Right panel */
        .auth-right {
          display: flex; align-items: center; justify-content: center;
          padding: 52px 44px; background: var(--casi-bg);
        }
        .auth-form-wrap { width: 100%; max-width: 380px; }

        /* Mode tabs */
        .auth-tabs {
          display: flex; background: var(--casi-surface); border: 1px solid var(--casi-border);
          border-radius: 11px; padding: 4px; margin-bottom: 32px; gap: 3px;
        }
        .auth-tab {
          flex: 1; font-family: var(--font-casi-sans), sans-serif; font-weight: 700; font-size: 13px;
          padding: 9px 0; border: none; border-radius: 8px;
          cursor: pointer; transition: all .18s; background: none; color: var(--casi-text-mid);
        }
        .auth-tab.active { background: var(--casi-accent); color: var(--casi-bg); }
        .auth-tab:not(.active):hover { color: var(--casi-text); }

        .auth-title    { font-family: var(--font-casi-display), var(--font-casi-sans), sans-serif; font-size: 26px; font-weight: 800; color: var(--casi-text); letter-spacing: -1px; margin-bottom: 5px; }
        .auth-subtitle { font-family: var(--font-casi-mono), monospace; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--casi-text-dim); margin-bottom: 28px; }

        .auth-field { margin-bottom: 14px; }
        .auth-label {
          font-family: var(--font-casi-mono), monospace; font-size: 9.5px; letter-spacing: 0.2em;
          text-transform: uppercase; color: var(--casi-text-mid); display: block; margin-bottom: 7px;
        }
        .auth-input {
          width: 100%; background: var(--casi-surface); border: 1px solid var(--casi-border);
          border-radius: 9px; padding: 12px 14px; font-size: 14px;
          color: var(--casi-text); outline: none; transition: border-color .18s;
          font-family: var(--font-casi-sans), sans-serif;
        }
        .auth-input::placeholder { color: var(--casi-text-dim); }
        .auth-input:focus  { border-color: rgba(var(--casi-accent-rgb),0.45); }
        .auth-input.valid  { border-color: rgba(var(--casi-accent-rgb),0.45); }
        .auth-input.invalid { border-color: rgba(239,68,68,0.4); }

        .auth-hint     { font-family: var(--font-casi-mono), monospace; font-size: 10px; margin-top: 5px; min-height: 15px; }
        .auth-hint.ok  { color: var(--casi-accent); }
        .auth-hint.err { color: #f87171; }
        .auth-hint.dim { color: var(--casi-text-dim); }

        .auth-error {
          background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
          border-radius: 8px; padding: 10px 14px;
          font-family: var(--font-casi-mono), monospace; font-size: 11px; color: #f87171; margin-bottom: 16px;
        }

        .auth-btn {
          width: 100%; background: var(--casi-accent); border: none; border-radius: 9px;
          padding: 13px; font-family: var(--font-casi-display), var(--font-casi-sans), sans-serif; font-weight: 800; font-size: 14px;
          letter-spacing: -0.2px; color: var(--casi-bg);
          cursor: pointer; transition: opacity .15s, transform .15s; margin-top: 6px;
        }
        .auth-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .auth-btn:disabled { background: var(--casi-surface-2); color: var(--casi-text-dim); cursor: not-allowed; transform: none; }

        /* OAuth — Google */
        .auth-oauth-btn {
          width: 100%; background: #fff; color: #1f1f1f; border: 1px solid var(--casi-border);
          border-radius: 10px; padding: 12px 14px;
          font-family: var(--font-casi-sans), sans-serif; font-weight: 700; font-size: 14px;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          cursor: pointer; transition: all .15s; margin-bottom: 16px;
        }
        .auth-oauth-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .auth-oauth-btn:disabled { opacity: .55; cursor: not-allowed; transform: none; }
        .auth-oauth-btn svg { width: 18px; height: 18px; flex-shrink: 0; }
        .auth-or {
          display: flex; align-items: center; gap: 12px; margin-bottom: 18px;
          font-family: var(--font-casi-mono), monospace; font-size: 9px;
          letter-spacing: 2px; text-transform: uppercase; color: var(--casi-text-dim);
        }
        .auth-or::before, .auth-or::after { content: ''; flex: 1; height: 1px; background: var(--casi-border); }

        .auth-btn-row { display: flex; gap: 10px; margin-top: 6px; }
        .auth-btn-back {
          flex-shrink: 0; background: var(--casi-surface); border: 1px solid var(--casi-border);
          border-radius: 9px; padding: 13px 18px; font-family: var(--font-casi-sans), sans-serif;
          font-weight: 700; font-size: 13px; color: var(--casi-text-mid);
          cursor: pointer; transition: all .15s;
        }
        .auth-btn-back:hover { border-color: var(--casi-border-2); color: var(--casi-text); }

        /* Username input */
        .username-wrap { position: relative; }
        .username-at   { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-family: var(--font-casi-mono), monospace; font-size: 14px; color: var(--casi-text-dim); pointer-events: none; }
        .username-input { padding-left: 28px !important; }

        /* URL preview */
        .url-preview       { background: rgba(var(--casi-accent-rgb),0.05); border: 1px solid rgba(var(--casi-accent-rgb),0.15); border-radius: 8px; padding: 12px 14px; margin-top: 10px; }
        .url-preview-label { font-family: var(--font-casi-mono), monospace; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--casi-text-dim); margin-bottom: 4px; }
        .url-preview-value { font-family: var(--font-casi-mono), monospace; font-size: 11px; color: var(--casi-accent); word-break: break-all; }

        /* Avatar row */
        .avatar-row    { display: flex; align-items: center; gap: 14px; }
        .avatar-circle { width: 52px; height: 52px; border-radius: 12px; border: 1px dashed var(--casi-border); background: var(--casi-surface); overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 20px; }

        /* Mobile */
        @media (max-width: 768px) {
          .auth-page { grid-template-columns: 1fr; }
          .auth-left { display: none; }
          .auth-right { padding: 40px 24px; align-items: flex-start; padding-top: 52px; }
          .auth-form-wrap { max-width: 100%; }
        }
      `}</style>

      <div className="auth-page">

        {/* ── Left branding panel ── */}
        <div className="auth-left">
          <div className="auth-brand">
            <div className="auth-brand-row">
              <CasiMark width={60} height={30} />
              <span className="auth-brand-name">casi<span style={{ color: 'var(--casi-dot)' }}>.</span></span>
            </div>
          </div>

          {mode === 'signup' && (
            <div className="left-steps">
              {STEPS.map((s, i) => {
                const state = i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'pending';
                return (
                  <div key={s}>
                    <div className="left-step">
                      <div className={`left-step-dot ${state}`}>{state === 'done' ? '✓' : i + 1}</div>
                      <div className={`left-step-label ${state}`}>{STEP_LABELS[i]}</div>
                    </div>
                    {i < STEPS.length - 1 && <div className="left-step-connector" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right form panel ── */}
        <div className="auth-right">
          <div className="auth-form-wrap">

            {/* Tab switcher */}
            <div className="auth-tabs">
              <button className={`auth-tab${mode === 'signin' ? ' active' : ''}`} onClick={() => switchMode('signin')}>
                Sign in
              </button>
              <button className={`auth-tab${mode === 'signup' ? ' active' : ''}`} onClick={() => switchMode('signup')}>
                Create studio
              </button>
            </div>

            {/* ── SIGN IN ── */}
            {mode === 'signin' && (
              <>
                <div className="auth-title">Welcome back</div>
                <div className="auth-subtitle">Sign in to your studio</div>
                <button type="button" onClick={() => handleOAuth('google')} disabled={loading} className="auth-oauth-btn">
                  <GoogleG />
                  Continue with Google
                </button>
                <button type="button" onClick={() => handleOAuth('twitch')} disabled={loading} className="auth-oauth-btn">
                  <TwitchIcon />
                  Continue with Twitch
                </button>
                <button type="button" onClick={() => handleOAuth('discord')} disabled={loading} className="auth-oauth-btn">
                  <DiscordIcon />
                  Continue with Discord
                </button>
                <button type="button" onClick={() => handleOAuth('x')} disabled={loading} className="auth-oauth-btn">
                  <XIcon />
                  Continue with X
                </button>
                <div className="auth-or">or use email</div>
                <form onSubmit={handleSignIn}>
                  <div className="auth-field">
                    <label className="auth-label">Email</label>
                    <input required type="email" placeholder="streamer@email.com"
                      className="auth-input" value={email}
                      onChange={(e) => setEmail(e.target.value)} autoFocus />
                  </div>
                  <div className="auth-field">
                    <label className="auth-label">Password</label>
                    <input required type="password" placeholder="••••••••"
                      className="auth-input" value={password}
                      onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  {error && <div className="auth-error">{error}</div>}
                  <div style={{ marginBottom: 10 }}>
                    <TurnstileWidget onVerify={onCaptchaVerify} onExpire={onCaptchaExpire} compact />
                  </div>
                  <button type="submit" disabled={loading} className="auth-btn">
                    {loading ? 'Signing in…' : 'Enter studio →'}
                  </button>
                </form>
              </>
            )}

            {/* ── SIGN UP — step 1: Account ── */}
            {mode === 'signup' && step === 'account' && (
              <>
                <div className="auth-title">Create your studio</div>
                <div className="auth-subtitle">Step 1 of 3 · Account</div>
                <button type="button" onClick={() => handleOAuth('google')} disabled={loading} className="auth-oauth-btn">
                  <GoogleG />
                  Continue with Google
                </button>
                <button type="button" onClick={() => handleOAuth('twitch')} disabled={loading} className="auth-oauth-btn">
                  <TwitchIcon />
                  Continue with Twitch
                </button>
                <button type="button" onClick={() => handleOAuth('discord')} disabled={loading} className="auth-oauth-btn">
                  <DiscordIcon />
                  Continue with Discord
                </button>
                <button type="button" onClick={() => handleOAuth('x')} disabled={loading} className="auth-oauth-btn">
                  <XIcon />
                  Continue with X
                </button>
                <div className="auth-or">or use email</div>
                <form onSubmit={handleAccountStep}>
                  <div className="auth-field">
                    <label className="auth-label">Email</label>
                    <input required type="email" placeholder="streamer@email.com"
                      className="auth-input" value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)} autoFocus />
                  </div>
                  <div className="auth-field">
                    <label className="auth-label">Password</label>
                    <input required type="password" placeholder={`Min ${PASSWORD_MIN_LENGTH} characters`}
                      className="auth-input" value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)} />
                    <div className={`auth-hint ${regPassword.length === 0 ? 'dim' : regPassword.length < PASSWORD_MIN_LENGTH ? 'err' : 'ok'}`}>
                      {regPassword.length === 0
                        ? `At least ${PASSWORD_MIN_LENGTH} characters`
                        : regPassword.length < PASSWORD_MIN_LENGTH
                          ? `${PASSWORD_MIN_LENGTH - regPassword.length} more needed`
                          : '✓ Looks good'}
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 12, fontFamily: "var(--font-casi-mono), monospace", fontSize: 10.5, color: 'var(--casi-text-mid)', lineHeight: 1.5, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={acceptedTos}
                      onChange={(e) => setAcceptedTos(e.target.checked)}
                      style={{ marginTop: 2, accentColor: 'var(--casi-accent)', cursor: 'pointer' }}
                    />
                    <span>
                      I agree to the{' '}
                      <a href="/legal/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--casi-accent)' }}>Terms of Service</a>,{' '}
                      <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--casi-accent)' }}>Privacy Policy</a>, and{' '}
                      <a href="/legal/aup" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--casi-accent)' }}>Acceptable Use Policy</a>. I confirm I am 18 or older.
                    </span>
                  </label>
                  {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
                  <div style={{ marginTop: 12 }}>
                    <TurnstileWidget onVerify={onCaptchaVerify} onExpire={onCaptchaExpire} compact />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button type="submit" disabled={!acceptedTos} className="auth-btn">Continue →</button>
                  </div>
                </form>
              </>
            )}

            {/* ── SIGN UP — step 2: Username ── */}
            {mode === 'signup' && step === 'username' && (
              <>
                <div className="auth-title">Pick your username</div>
                <div className="auth-subtitle">Step 2 of 3 · Becomes your URL</div>
                <form onSubmit={handleUsernameStep}>
                  <div className="auth-field">
                    <label className="auth-label">Username</label>
                    <div className="username-wrap">
                      <span className="username-at">@</span>
                      <input type="text" placeholder="yourname" autoFocus maxLength={24}
                        className={`auth-input username-input${usernameStatus === 'available' ? ' valid' : usernameStatus === 'taken' ? ' invalid' : ''}`}
                        value={username}
                        onChange={(e) => checkUsername(e.target.value)} />
                    </div>
                    <div className={`auth-hint ${usernameStatus === 'available' ? 'ok' : usernameStatus === 'taken' ? 'err' : 'dim'}`}>
                      {usernameStatus === 'checking'  && 'Checking…'}
                      {usernameStatus === 'available' && '✓ Available'}
                      {usernameStatus === 'taken'     && '✗ Already taken'}
                      {usernameStatus === 'idle'      && (username.length > 0 && username.length < 3 ? 'Min 3 characters' : 'Lowercase, numbers, underscores')}
                    </div>
                  </div>
                  {usernameStatus === 'available' && (
                    <div className="url-preview">
                      <div className="url-preview-label">Your overlay URL</div>
                      <div className="url-preview-value">{origin}/overlay?s={username}</div>
                    </div>
                  )}
                  <div className="auth-btn-row">
                    {postOAuth ? (
                      <button
                        type="button"
                        className="auth-btn-back"
                        onClick={async () => {
                          await supabase.auth.signOut();
                          setPostOAuth(false);
                          setMode('signin');
                          setStep('account');
                          setRegEmail(''); setDisplayName(''); setAvatarUrl(''); setAvatarValid(false);
                          setUsername(''); setUsernameStatus('idle'); setBio(''); setAcceptedTos(false);
                          setError('');
                        }}
                      >
                        Use a different account
                      </button>
                    ) : (
                      <button type="button" className="auth-btn-back" onClick={() => { setStep('account'); setError(''); }}>← Back</button>
                    )}
                    <button type="submit" disabled={usernameStatus !== 'available'} className="auth-btn">Continue →</button>
                  </div>
                </form>
              </>
            )}

            {/* ── SIGN UP — step 3: Profile ── */}
            {mode === 'signup' && step === 'profile' && (
              <>
                <div className="auth-title">Set up your profile</div>
                <div className="auth-subtitle">Step 3 of 3 · Optional, edit anytime</div>
                <form onSubmit={handleSignup}>
                  <div className="auth-field">
                    <label className="auth-label">Avatar URL</label>
                    <div className="avatar-row">
                      <div className="avatar-circle">
                        {avatarValid && avatarUrl
                          ? <img src={avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          : '👤'}
                      </div>
                      <input type="text" placeholder="https://your-image.png" className="auth-input" value={avatarUrl}
                        maxLength={AVATAR_MAX_LEN}
                        style={{ flex: 1 }}
                        onChange={(e) => { setAvatarUrl(e.target.value); setAvatarValid(false); }} />
                      {avatarUrl && isPlausibleAvatarUrl(avatarUrl) && <img src={avatarUrl} alt="" style={{ display: 'none' }} onLoad={() => setAvatarValid(true)} onError={() => setAvatarValid(false)} />}
                    </div>
                    {avatarUrl && !isPlausibleAvatarUrl(avatarUrl) && <div className="auth-hint err">Must be an https:// link to an image (.png, .jpg, .gif, .webp, .svg, .avif).</div>}
                    {avatarUrl && isPlausibleAvatarUrl(avatarUrl) && <div className={`auth-hint ${avatarValid ? 'ok' : 'err'}`}>{avatarValid ? '✓ Image loaded' : 'Image not loading. Check the URL.'}</div>}
                  </div>
                  <div className="auth-field">
                    <label className="auth-label">Display name</label>
                    <input type="text" placeholder={username} maxLength={32}
                      className="auth-input" value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)} autoFocus />
                  </div>
                  <div className="auth-field">
                    <label className="auth-label">Bio <span style={{ color: 'var(--casi-text-faint)', textTransform: 'none', fontSize: 9 }}>· optional</span></label>
                    <textarea placeholder="What do you stream?" rows={3} maxLength={160}
                      style={{ width: '100%', background: 'var(--casi-surface)', border: '1px solid var(--casi-border)', borderRadius: 9, padding: '12px 14px', fontSize: 14, color: 'var(--casi-text)', outline: 'none', fontFamily: "var(--font-casi-sans), sans-serif", resize: 'none', transition: 'border-color .18s', lineHeight: 1.5 }}
                      value={bio} onChange={(e) => setBio(e.target.value)} />
                    <div className="auth-hint dim" style={{ textAlign: 'right' }}>{bio.length}/160</div>
                  </div>
                  {error && <div className="auth-error">{error}</div>}
                  <div className="auth-btn-row">
                    <button type="button" className="auth-btn-back" onClick={() => { setStep('username'); setError(''); }}>← Back</button>
                    <button type="submit" disabled={loading} className="auth-btn">
                      {loading ? 'Launching…' : 'Launch studio →'}
                    </button>
                  </div>
                </form>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
