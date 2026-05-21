"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CasiMark } from '@/components/v9/CasiMark';
import { Wordmark } from '@/components/v9/Wordmark';
import TurnstileWidget from '@/components/TurnstileWidget';

const P = '#f5e1d2';
const I = '#294b3c';
const A = '#c04830';

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden width={18} height={18}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5c-2 1.5-4.5 2.5-7.5 2.5-5.3 0-9.7-3.3-11.3-8L6 32.6C9.4 39.6 16.1 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.5l6.5 5.5c-.5.4 6.2-4.5 6.2-15 0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
function TwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="#9146FF" xmlns="http://www.w3.org/2000/svg" aria-hidden width={16} height={16}>
      <path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657L23.463 14.5V0H2.149zm19.165 13.612l-3.582 3.582h-5.731l-3.045 3.045v-3.045H4.119V1.612h17.195v12zm-4.93-9.493v6.687h-2.149V4.119h2.149zm-5.731 0v6.687H8.504V4.119h2.149z"/>
    </svg>
  );
}
function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="#5865F2" xmlns="http://www.w3.org/2000/svg" aria-hidden width={16} height={16}>
      <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 00-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 00-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02C2.05 9.41 1.3 13.39 1.67 17.32c0 .02.01.04.03.05 1.79 1.32 3.5 2.13 5.19 2.66.03.01.06 0 .07-.02.39-.54.74-1.11 1.04-1.71.02-.04 0-.08-.04-.09-.56-.21-1.09-.47-1.61-.78-.04-.02-.04-.08 0-.11.11-.08.22-.17.32-.25.02-.02.05-.02.07-.01 3.42 1.56 7.13 1.56 10.51 0 .02-.01.05-.01.07.01.1.09.21.17.32.25.04.03.04.09 0 .11-.51.31-1.05.57-1.61.78-.04.01-.05.06-.04.09.31.6.66 1.17 1.04 1.71.03.02.06.03.09.02 1.7-.53 3.41-1.34 5.2-2.66.02-.01.03-.03.03-.05.43-4.52-.79-8.47-3.32-11.95-.01-.01-.02-.02-.03-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12 0-1.17.84-2.12 1.89-2.12 1.06 0 1.91.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12 0-1.17.84-2.12 1.89-2.12 1.06 0 1.91.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden width={14} height={14}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

type Step = 'account' | 'username' | 'profile';
const STEPS: Step[] = ['account', 'username', 'profile'];
const STEP_NUMS = ['01', '02', '03'];
const STEP_LABELS = ['account', 'username', 'profile'];
const PASSWORD_MIN_LENGTH = 8;
const AVATAR_MAX_LEN = 1024;
const AVATAR_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i;
const TOS_VERSION = 'v1-2026-05';

function isPlausibleAvatarUrl(url: string): boolean {
  if (!url) return true;
  if (url.length > AVATAR_MAX_LEN) return false;
  if (!url.startsWith('https://')) return false;
  try {
    const parsed = new URL(url);
    if (!/^[a-z0-9.-]+$/i.test(parsed.hostname)) return false;
    if (AVATAR_EXT_RE.test(parsed.pathname)) return true;
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith('.githubusercontent.com') ||
      host.endsWith('.googleusercontent.com') ||
      host.endsWith('.discordapp.com') ||
      host.endsWith('.discordapp.net') ||
      host.endsWith('.twimg.com') ||
      host.endsWith('.jtvnw.net') ||
      host === 'gravatar.com' ||
      host.endsWith('.gravatar.com')
    );
  } catch { return false; }
}

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('account');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarValid, setAvatarValid] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle'|'checking'|'taken'|'available'>('idle');
  const [acceptedTos, setAcceptedTos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [postOAuth, setPostOAuth] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const onCaptchaVerify = useCallback((t: string) => setCaptchaToken(t), []);
  const onCaptchaExpire = useCallback(() => setCaptchaToken(null), []);
  const realCaptchaToken = captchaToken && captchaToken !== 'dev-skip' ? captchaToken : undefined;
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const finish = params.get('finish') === 'true';
    const oauthErr = params.get('oauth_error');
    if (oauthErr) setError(oauthErr);
    if (params.get('tab') === 'signup') setMode('signup');

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data: profile } = await supabase
        .from('profiles').select('id').eq('id', session.user.id).maybeSingle();
      if (profile && !finish) { router.replace('/studio'); return; }
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
      setAcceptedTos(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = (m: 'signin' | 'signup') => { setMode(m); setError(''); setStep('account'); };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.signInWithPassword({
      email, password,
      options: realCaptchaToken ? { captchaToken: realCaptchaToken } : undefined,
    });
    if (err) { setError(err.message); setLoading(false); }
    else router.push('/studio');
  };

  type OAuthProvider = 'google' | 'twitch' | 'discord' | 'x';
  const handleOAuth = async (provider: OAuthProvider) => {
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${origin}/auth/callback${mode === 'signup' ? '?next=/admin' : ''}` },
    });
    if (err) { setError(err.message); setLoading(false); }
  };

  const handleAccountStep = (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (regPassword.length < PASSWORD_MIN_LENGTH) { setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`); return; }
    if (!acceptedTos) { setError('Please accept the Terms and Privacy Policy'); return; }
    setStep('username');
  };

  const checkUsername = async (val: string) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
    setUsername(cleaned);
    if (cleaned.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    const { data: reserved } = await supabase.from('reserved_usernames').select('username').eq('username', cleaned).maybeSingle();
    if (reserved) { setUsernameStatus('taken'); return; }
    const { data: taken, error: lookupError } = await supabase.from('profiles').select('username').ilike('username', cleaned).maybeSingle();
    if (lookupError) { setUsernameStatus('idle'); return; }
    setUsernameStatus(taken ? 'taken' : 'available');
  };

  const handleUsernameStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus !== 'available') return;
    setDisplayName(username);
    setStep('profile');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const { data: { session } } = await supabase.auth.getSession();
    let userId = session?.user.id ?? null;

    if (!userId) {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: regEmail, password: regPassword,
        options: realCaptchaToken ? { captchaToken: realCaptchaToken } : undefined,
      });
      if (authError) {
        setError('Could not create account. If you already have one, try signing in instead.');
        setEmail(regEmail); setPassword(''); setLoading(false); return;
      }
      if (!authData.user) { setError('Signup failed. Please try again.'); setLoading(false); return; }
      userId = authData.user.id;
    }

    const avatarToWrite = avatarValid && isPlausibleAvatarUrl(avatarUrl) ? avatarUrl : null;
    if (avatarUrl && !avatarToWrite) {
      setError('Avatar URL must be an https:// link to an image (.png, .jpg, .gif, .webp, .svg, .avif).');
      setLoading(false); return;
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId, username,
      display_name: (displayName || username).slice(0, 64),
      bio: bio ? bio.slice(0, 320) : null,
      avatar_url: avatarToWrite,
      is_live: false,
      tos_accepted_at: new Date().toISOString(),
      tos_version: TOS_VERSION,
    });
    if (profileError) {
      const msg = profileError.message.toLowerCase();
      if (msg.includes('reserved')) { setError('That username is reserved. Try a different one.'); setStep('username'); setUsernameStatus('taken'); }
      else if (msg.includes('duplicate key') || msg.includes('unique')) { setError('That username was just taken. Try a different one.'); setStep('username'); setUsernameStatus('taken'); }
      else { setError('Could not create profile: ' + profileError.message); }
      setLoading(false); return;
    }
    router.push('/studio');
  };

  const stepIndex = STEPS.indexOf(step);

  // Nav right link
  const navRight = mode === 'signin'
    ? <Link href="/search" className="nav-link">find a streamer</Link>
    : <button type="button" className="nav-link" onClick={() => switchMode('signin')}>have an account? sign in</button>;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .ap {
          --paper: ${P};
          --ink:   ${I};
          --accent: ${A};
          --type:   #221a14;
          --type-2: #6a574b;
          --H: var(--font-casi-display), 'Bricolage Grotesque', system-ui, sans-serif;
          --S: var(--font-casi-serif), 'Instrument Serif', Georgia, serif;
          --M: var(--font-casi-mono), 'JetBrains Mono', ui-monospace, monospace;

          min-height: 100vh;
          background: var(--paper);
          color: var(--type);
          font-family: var(--H);
          display: flex;
          flex-direction: column;
        }

        /* Mark + wordmark in nav */
        .ap :global(.casi-v9-wordmark) {
          color: var(--type);
          font-family: var(--H);
          font-weight: 800;
          font-size: 24px;
          letter-spacing: -0.035em;
          line-height: 1;
        }
        .ap :global(.casi-v9-wordmark .casi-v9-dot) { color: var(--accent); }
        .ap :global(.casi-v9-mark) { color: var(--ink); width: 56px; height: 28px; }

        /* NAV */
        .ap-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 28px 40px;
          flex-shrink: 0;
        }
        @media (max-width: 640px) { .ap-nav { padding: 22px 22px; } }
        .ap-logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
        .nav-link {
          font-family: var(--S);
          font-style: italic;
          font-size: 17px;
          color: var(--type);
          border-bottom: 1.5px solid color-mix(in oklab, var(--type) 30%, transparent);
          padding-bottom: 1px;
          text-decoration: none;
          background: none;
          border-top: none;
          border-left: none;
          border-right: none;
          cursor: pointer;
          white-space: nowrap;
        }
        .nav-link:hover { opacity: 0.8; }

        /* CENTERED COLUMN */
        .ap-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 32px 80px;
        }
        .ap-wrap {
          width: 100%;
          max-width: 480px;
          display: flex;
          flex-direction: column;
        }

        /* EYEBROW */
        .eyebrow {
          font-family: var(--M);
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--type-2);
          margin-bottom: 12px;
        }

        /* HEADLINE */
        .ap-h1 {
          font-family: var(--H);
          font-weight: 800;
          font-size: 56px;
          letter-spacing: -0.035em;
          line-height: 0.95;
          color: var(--type);
          font-variation-settings: 'opsz' 56;
          white-space: nowrap;
        }
        .ap-h1 em {
          font-family: var(--S);
          font-style: italic;
          font-weight: 400;
          color: var(--ink);
          font-size: 0.94em;
          letter-spacing: -0.015em;
        }
        @media (max-width: 480px) { .ap-h1 { font-size: 42px; } }

        /* SUB */
        .ap-sub {
          margin-top: 10px;
          font-size: 14.5px;
          line-height: 1.45;
          color: var(--type-2);
          max-width: 400px;
        }

        /* STEP PILLS */
        .ap-steps {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 18px;
          font-family: var(--M);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .ap-step {
          padding: 4px 10px;
          border: 1px solid color-mix(in oklab, var(--type) 20%, transparent);
          border-radius: 999px;
          color: var(--type-2);
          white-space: nowrap;
        }
        .ap-step.active {
          background: var(--ink);
          color: var(--paper);
          border-color: var(--ink);
        }

        /* FORM */
        .ap-form { display: flex; flex-direction: column; gap: 8px; margin-top: 22px; }

        /* OAuth 2-column grid */
        .oauth-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .oauth-btn {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 11px 14px;
          background: color-mix(in oklab, var(--paper) 70%, white);
          color: var(--type);
          border: 1.5px solid color-mix(in oklab, var(--type) 18%, transparent);
          border-radius: 999px;
          font-family: var(--H); font-weight: 600; font-size: 13.5px; letter-spacing: -0.01em;
          cursor: pointer; white-space: nowrap;
          transition: border-color 0.14s, transform 0.14s;
        }
        .oauth-btn:hover:not(:disabled) { border-color: var(--ink); transform: translateY(-1px); }
        .oauth-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .oauth-glyph { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }

        /* OR divider */
        .ap-or {
          display: flex; align-items: center; gap: 10px; margin: 4px 0 0;
          font-family: var(--M); font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase;
          color: var(--type-2); white-space: nowrap;
        }
        .ap-or::before, .ap-or::after {
          content: ''; flex: 1; height: 1px;
          background: color-mix(in oklab, var(--type) 18%, transparent);
        }

        /* FIELD */
        .ap-field { display: flex; flex-direction: column; gap: 4px; }
        .ap-label {
          font-family: var(--M); font-size: 9.5px; letter-spacing: 0.2em;
          text-transform: uppercase; color: var(--type-2);
        }
        .ap-input {
          appearance: none; -webkit-appearance: none;
          width: 100%; padding: 11px 18px;
          background: color-mix(in oklab, var(--paper) 80%, white);
          color: var(--type);
          border: 1.5px solid color-mix(in oklab, var(--type) 18%, transparent);
          border-radius: 999px;
          font-family: var(--H); font-size: 14.5px; font-weight: 500;
          outline: none; transition: border-color 0.14s, background 0.14s;
        }
        .ap-input::placeholder { color: var(--type-2); opacity: 0.6; }
        .ap-input:focus { border-color: var(--ink); background: color-mix(in oklab, var(--paper) 60%, white); }
        .ap-input.valid  { border-color: color-mix(in oklab, var(--ink) 60%, transparent); }
        .ap-input.invalid { border-color: rgba(239,68,68,0.5); }

        /* Username wrap */
        .username-wrap { position: relative; }
        .username-at {
          position: absolute; left: 18px; top: 50%; transform: translateY(-50%);
          font-family: var(--M); font-size: 14px; color: var(--type-2); pointer-events: none;
        }
        .username-input { padding-left: 32px !important; }

        /* Textarea */
        .ap-textarea {
          width: 100%; padding: 12px 18px;
          background: color-mix(in oklab, var(--paper) 80%, white);
          color: var(--type);
          border: 1.5px solid color-mix(in oklab, var(--type) 18%, transparent);
          border-radius: 16px;
          font-family: var(--H); font-size: 14.5px; font-weight: 500; line-height: 1.5;
          outline: none; resize: none;
          transition: border-color 0.14s;
        }
        .ap-textarea::placeholder { color: var(--type-2); opacity: 0.6; }
        .ap-textarea:focus { border-color: var(--ink); }

        /* Hint */
        .ap-hint { font-family: var(--M); font-size: 10px; padding-left: 4px; }
        .ap-hint.ok  { color: var(--ink); }
        .ap-hint.err { color: #f87171; }
        .ap-hint.dim { color: var(--type-2); }

        /* Error */
        .ap-error {
          background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
          border-radius: 12px; padding: 10px 16px;
          font-family: var(--M); font-size: 11px; color: #f87171;
        }

        /* TOS */
        .ap-tos {
          display: flex; align-items: flex-start; gap: 10px; margin-top: 4px;
          font-family: var(--M); font-size: 10px; color: var(--type-2); line-height: 1.5; cursor: pointer;
        }
        .ap-tos input { margin-top: 2px; accent-color: var(--ink); cursor: pointer; flex-shrink: 0; }
        .ap-tos a { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }

        /* SUBMIT */
        .ap-submit {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 14px;
          background: var(--ink); color: var(--paper);
          border: none; border-radius: 999px;
          font-family: var(--H); font-weight: 700; font-size: 15px; letter-spacing: -0.01em;
          cursor: pointer; transition: opacity 0.14s, transform 0.14s;
        }
        .ap-submit .arr { font-family: var(--S); font-style: italic; font-size: 19px; line-height: 1; }
        .ap-submit:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .ap-submit:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

        /* BACK */
        .ap-back {
          flex-shrink: 0; padding: 14px 20px;
          background: transparent; color: var(--type-2);
          border: 1.5px solid color-mix(in oklab, var(--type) 20%, transparent);
          border-radius: 999px;
          font-family: var(--H); font-weight: 600; font-size: 14px;
          cursor: pointer; transition: border-color 0.14s, color 0.14s;
        }
        .ap-back:hover { border-color: var(--ink); color: var(--ink); }

        /* BTN ROW */
        .ap-btn-row { display: flex; gap: 8px; }
        .ap-btn-row .ap-submit { flex: 1; }

        /* URL preview */
        .url-preview {
          background: color-mix(in oklab, var(--ink) 6%, var(--paper));
          border: 1px solid color-mix(in oklab, var(--ink) 18%, transparent);
          border-radius: 12px; padding: 12px 16px;
        }
        .url-preview-label { font-family: var(--M); font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--type-2); margin-bottom: 4px; }
        .url-preview-value { font-family: var(--M); font-size: 11px; color: var(--ink); word-break: break-all; }

        /* Avatar row */
        .avatar-row { display: flex; align-items: center; gap: 14px; }
        .avatar-circle {
          width: 52px; height: 52px; border-radius: 12px;
          border: 1.5px dashed color-mix(in oklab, var(--type) 20%, transparent);
          background: color-mix(in oklab, var(--paper) 80%, white);
          overflow: hidden; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; font-size: 20px;
        }

        /* Meta link */
        .ap-meta {
          margin-top: 12px; align-self: center; text-align: center;
          font-family: var(--H); font-size: 13.5px; color: var(--type-2);
          white-space: nowrap;
        }
        .ap-meta em {
          font-family: var(--S); font-style: italic; color: var(--ink);
          border-bottom: 1.5px solid color-mix(in oklab, var(--ink) 40%, transparent);
          padding-bottom: 1px;
        }
        .ap-meta button {
          background: none; border: none; padding: 0; cursor: pointer;
          font-family: inherit; font-size: inherit; color: inherit;
        }

        /* TRUST STRIP */
        .trust-strip {
          display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap;
          font-family: var(--M); font-size: 10.5px; letter-spacing: 0.22em; text-transform: uppercase;
          color: var(--type-2); padding: 32px 40px 0;
        }
        .pip { width: 5px; height: 5px; border-radius: 50%; background: var(--ink); opacity: 0.7; display: inline-block; }

        /* FOOTER */
        .ap-foot {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 14px; padding: 16px 40px 28px;
          font-family: var(--M); font-size: 11px; letter-spacing: 0.04em; color: var(--type-2);
          border-top: 1px solid color-mix(in oklab, var(--type) 10%, transparent);
          margin-top: 32px;
        }
        @media (max-width: 640px) { .ap-foot { padding: 16px 22px 24px; } }
        .ap-foot-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
        .ap-foot a { text-decoration: none; color: inherit; }
      `}</style>

      <div className="ap">
        {/* NAV */}
        <nav className="ap-nav">
          <Link href="/" className="ap-logo" aria-label="Casi">
            <CasiMark />
            <Wordmark />
          </Link>
          {navRight}
        </nav>

        {/* FORM COLUMN */}
        <div className="ap-body">
          <div className="ap-wrap">

            {/* ── SIGN IN ── */}
            {mode === 'signin' && (
              <>
                <div className="eyebrow">— sign in</div>
                <h1 className="ap-h1">Welcome <em>back.</em></h1>
                <p className="ap-sub">Open your studio. Manage your slots. See who&rsquo;s knocking.</p>
                <div className="ap-form">
                  <div className="oauth-grid">
                    <button type="button" className="oauth-btn" onClick={() => handleOAuth('google')} disabled={loading}>
                      <span className="oauth-glyph"><GoogleG /></span>Google
                    </button>
                    <button type="button" className="oauth-btn" onClick={() => handleOAuth('twitch')} disabled={loading}>
                      <span className="oauth-glyph"><TwitchIcon /></span>Twitch
                    </button>
                    <button type="button" className="oauth-btn" onClick={() => handleOAuth('discord')} disabled={loading}>
                      <span className="oauth-glyph"><DiscordIcon /></span>Discord
                    </button>
                    <button type="button" className="oauth-btn" onClick={() => handleOAuth('x')} disabled={loading}>
                      <span className="oauth-glyph"><XIcon /></span>X
                    </button>
                  </div>
                  <div className="ap-or">or use email</div>
                  <form onSubmit={handleSignIn} style={{ display: 'contents' }}>
                    <div className="ap-field">
                      <label className="ap-label">Email</label>
                      <input required type="email" placeholder="you@email.com" className="ap-input"
                        value={email} onChange={e => setEmail(e.target.value)} autoFocus />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Password</label>
                      <input required type="password" placeholder="••••••••" className="ap-input"
                        value={password} onChange={e => setPassword(e.target.value)} />
                    </div>
                    {error && <div className="ap-error">{error}</div>}
                    <div><TurnstileWidget onVerify={onCaptchaVerify} onExpire={onCaptchaExpire} compact /></div>
                    <button type="submit" className="ap-submit" disabled={loading}>
                      {loading ? 'Signing in…' : <><span>Enter studio</span> <span className="arr">→</span></>}
                    </button>
                  </form>
                  <p className="ap-meta">
                    New here?{' '}
                    <em><button type="button" onClick={() => switchMode('signup')}>Create a studio</button></em>
                  </p>
                </div>
              </>
            )}

            {/* ── SIGN UP — step 1: Account ── */}
            {mode === 'signup' && step === 'account' && (
              <>
                <div className="eyebrow">— create studio</div>
                <h1 className="ap-h1">Start your <em>studio.</em></h1>
                <p className="ap-sub">Drop one OBS source. Approve everything yourself. Casi takes zero.</p>
                <div className="ap-steps">
                  {STEPS.map((s, i) => (
                    <span key={s} className={`ap-step${i === stepIndex ? ' active' : ''}`}>
                      {STEP_NUMS[i]} · {STEP_LABELS[i]}
                    </span>
                  ))}
                </div>
                <div className="ap-form">
                  <div className="oauth-grid">
                    <button type="button" className="oauth-btn" onClick={() => handleOAuth('google')} disabled={loading}>
                      <span className="oauth-glyph"><GoogleG /></span>Google
                    </button>
                    <button type="button" className="oauth-btn" onClick={() => handleOAuth('twitch')} disabled={loading}>
                      <span className="oauth-glyph"><TwitchIcon /></span>Twitch
                    </button>
                    <button type="button" className="oauth-btn" onClick={() => handleOAuth('discord')} disabled={loading}>
                      <span className="oauth-glyph"><DiscordIcon /></span>Discord
                    </button>
                    <button type="button" className="oauth-btn" onClick={() => handleOAuth('x')} disabled={loading}>
                      <span className="oauth-glyph"><XIcon /></span>X
                    </button>
                  </div>
                  <div className="ap-or">or use email</div>
                  <form onSubmit={handleAccountStep} style={{ display: 'contents' }}>
                    <div className="ap-field">
                      <label className="ap-label">Email</label>
                      <input required type="email" placeholder="you@email.com" className="ap-input"
                        value={regEmail} onChange={e => setRegEmail(e.target.value)} autoFocus />
                    </div>
                    <div className="ap-field">
                      <label className="ap-label">Password</label>
                      <input required type="password" placeholder={`min ${PASSWORD_MIN_LENGTH} characters`} className="ap-input"
                        value={regPassword} onChange={e => setRegPassword(e.target.value)} />
                      <div className={`ap-hint ${regPassword.length === 0 ? 'dim' : regPassword.length < PASSWORD_MIN_LENGTH ? 'err' : 'ok'}`}>
                        {regPassword.length === 0
                          ? `At least ${PASSWORD_MIN_LENGTH} characters`
                          : regPassword.length < PASSWORD_MIN_LENGTH
                            ? `${PASSWORD_MIN_LENGTH - regPassword.length} more needed`
                            : '✓ Looks good'}
                      </div>
                    </div>
                    <label className="ap-tos">
                      <input type="checkbox" checked={acceptedTos} onChange={e => setAcceptedTos(e.target.checked)} />
                      <span>
                        I agree to the{' '}
                        <a href="/legal/terms" target="_blank" rel="noopener noreferrer">Terms</a>,{' '}
                        <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">Privacy</a> and{' '}
                        <a href="/legal/aup" target="_blank" rel="noopener noreferrer">Acceptable Use</a>. I&rsquo;m 18 or older.
                      </span>
                    </label>
                    {error && <div className="ap-error">{error}</div>}
                    <div><TurnstileWidget onVerify={onCaptchaVerify} onExpire={onCaptchaExpire} compact /></div>
                    <button type="submit" className="ap-submit" disabled={!acceptedTos || loading}>
                      Continue <span className="arr">→</span>
                    </button>
                  </form>
                  <p className="ap-meta">
                    Have an account?{' '}
                    <em><button type="button" onClick={() => switchMode('signin')}>Sign in</button></em>
                  </p>
                </div>
              </>
            )}

            {/* ── SIGN UP — step 2: Username ── */}
            {mode === 'signup' && step === 'username' && (
              <>
                <div className="eyebrow">— create studio</div>
                <h1 className="ap-h1">Pick a <em>username.</em></h1>
                <p className="ap-sub">Becomes your overlay URL. Lowercase, numbers, underscores.</p>
                <div className="ap-steps">
                  {STEPS.map((s, i) => (
                    <span key={s} className={`ap-step${i === stepIndex ? ' active' : ''}`}>
                      {STEP_NUMS[i]} · {STEP_LABELS[i]}
                    </span>
                  ))}
                </div>
                <form className="ap-form" onSubmit={handleUsernameStep}>
                  <div className="ap-field">
                    <label className="ap-label">Username</label>
                    <div className="username-wrap">
                      <span className="username-at">@</span>
                      <input type="text" placeholder="yourname" autoFocus maxLength={24}
                        className={`ap-input username-input${usernameStatus === 'available' ? ' valid' : usernameStatus === 'taken' ? ' invalid' : ''}`}
                        value={username} onChange={e => checkUsername(e.target.value)} />
                    </div>
                    <div className={`ap-hint ${usernameStatus === 'available' ? 'ok' : usernameStatus === 'taken' ? 'err' : 'dim'}`}>
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
                  {error && <div className="ap-error">{error}</div>}
                  <div className="ap-btn-row">
                    {postOAuth ? (
                      <button type="button" className="ap-back" onClick={async () => {
                        await supabase.auth.signOut();
                        setPostOAuth(false); setMode('signin'); setStep('account');
                        setRegEmail(''); setDisplayName(''); setAvatarUrl(''); setAvatarValid(false);
                        setUsername(''); setUsernameStatus('idle'); setBio(''); setAcceptedTos(false); setError('');
                      }}>
                        Different account
                      </button>
                    ) : (
                      <button type="button" className="ap-back" onClick={() => { setStep('account'); setError(''); }}>← Back</button>
                    )}
                    <button type="submit" className="ap-submit" disabled={usernameStatus !== 'available'}>
                      Continue <span className="arr">→</span>
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* ── SIGN UP — step 3: Profile ── */}
            {mode === 'signup' && step === 'profile' && (
              <>
                <div className="eyebrow">— create studio</div>
                <h1 className="ap-h1">Your <em>profile.</em></h1>
                <p className="ap-sub">Optional — edit anytime in settings.</p>
                <div className="ap-steps">
                  {STEPS.map((s, i) => (
                    <span key={s} className={`ap-step${i === stepIndex ? ' active' : ''}`}>
                      {STEP_NUMS[i]} · {STEP_LABELS[i]}
                    </span>
                  ))}
                </div>
                <form className="ap-form" onSubmit={handleSignup}>
                  <div className="ap-field">
                    <label className="ap-label">Avatar URL</label>
                    <div className="avatar-row">
                      <div className="avatar-circle">
                        {avatarValid && avatarUrl
                          ? <img src={avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          : '👤'}
                      </div>
                      <input type="text" placeholder="https://your-image.png" className="ap-input"
                        maxLength={AVATAR_MAX_LEN} style={{ flex: 1 }}
                        value={avatarUrl}
                        onChange={e => { setAvatarUrl(e.target.value); setAvatarValid(false); }} />
                      {avatarUrl && isPlausibleAvatarUrl(avatarUrl) && (
                        <img src={avatarUrl} alt="" style={{ display: 'none' }}
                          onLoad={() => setAvatarValid(true)}
                          onError={() => setAvatarValid(false)} />
                      )}
                    </div>
                    {avatarUrl && !isPlausibleAvatarUrl(avatarUrl) && <div className="ap-hint err">Must be an https:// image link.</div>}
                    {avatarUrl && isPlausibleAvatarUrl(avatarUrl) && <div className={`ap-hint ${avatarValid ? 'ok' : 'err'}`}>{avatarValid ? '✓ Image loaded' : 'Image not loading — check the URL.'}</div>}
                  </div>
                  <div className="ap-field">
                    <label className="ap-label">Display name</label>
                    <input type="text" placeholder={username} maxLength={32} className="ap-input"
                      value={displayName} onChange={e => setDisplayName(e.target.value)} autoFocus />
                  </div>
                  <div className="ap-field">
                    <label className="ap-label">Bio <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0, fontSize: 9 }}>· optional</span></label>
                    <textarea placeholder="What do you stream?" rows={3} maxLength={160}
                      className="ap-textarea" value={bio} onChange={e => setBio(e.target.value)} />
                    <div className="ap-hint dim" style={{ textAlign: 'right' }}>{bio.length}/160</div>
                  </div>
                  {error && <div className="ap-error">{error}</div>}
                  <div className="ap-btn-row">
                    <button type="button" className="ap-back" onClick={() => { setStep('username'); setError(''); }}>← Back</button>
                    <button type="submit" className="ap-submit" disabled={loading}>
                      {loading ? 'Launching…' : <><span>Launch studio</span> <span className="arr">→</span></>}
                    </button>
                  </div>
                </form>
              </>
            )}

          </div>
        </div>

        {/* TRUST STRIP */}
        <div className="trust-strip">
          <span>free or paid</span>
          <span className="pip" aria-hidden="true" />
          <span>approval gated</span>
          <span className="pip" aria-hidden="true" />
          <span>solana · stripe</span>
        </div>

        {/* FOOTER */}
        <footer className="ap-foot">
          <div className="ap-foot-row">
            <span>© {new Date().getFullYear()} Casi</span>
            <a href="https://github.com/mm88nl-web/casi-app" target="_blank" rel="noopener noreferrer">github</a>
          </div>
          <div className="ap-foot-row">
            <a href="/legal/terms">terms</a>
            <a href="/legal/privacy">privacy</a>
            <a href="/legal/aup">use</a>
          </div>
        </footer>
      </div>
    </>
  );
}
