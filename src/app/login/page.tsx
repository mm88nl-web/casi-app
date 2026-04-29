"use client";
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import CasiLogo from '@/components/CasiLogo';

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

type Step = 'account' | 'username' | 'profile';
const STEPS: Step[] = ['account', 'username', 'profile'];
const STEP_LABELS = ['Account', 'Username', 'Profile'];

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
        router.replace('/admin');
        return;
      }
      // Profile missing → finish setup. Pre-fill from Google metadata.
      const meta = session.user.user_metadata || {};
      setMode('signup');
      setStep('username');
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
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); }
    else router.push('/admin');
  };

  /* ── Sign in or sign up with Google ──
   * Same call for both — Supabase creates an auth.users row on first
   * sign-in, returns an existing session on subsequent ones. The
   * /auth/callback route distinguishes new vs returning by checking
   * whether a `profiles` row exists for the user.
   */
  const handleGoogleAuth = async () => {
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback${mode === 'signup' ? '?next=/admin' : ''}`,
      },
    });
    if (err) { setError(err.message); setLoading(false); }
    // No success branch — Supabase redirects the tab to Google.
  };

  /* ── Sign up ── step 1 */
  const handleAccountStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (regPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!acceptedTos)            { setError('Please accept the Terms and Privacy Policy'); return; }
    setStep('username');
  };

  /* ── Sign up ── username check */
  const checkUsername = async (val: string) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(cleaned);
    if (cleaned.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    const { data } = await supabase.from('profiles').select('username').eq('username', cleaned).single();
    setUsernameStatus(data ? 'taken' : 'available');
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
      });
      if (authError) {
        const msg = authError.message.toLowerCase();
        if (msg.includes('already registered') || msg.includes('already in use') || msg.includes('already exists')) {
          setError('That email already has an account — signing you in instead.');
          setEmail(regEmail);
          setPassword('');
          setMode('signin');
        } else {
          setError(authError.message);
        }
        setLoading(false);
        return;
      }
      if (!authData.user) { setError('Signup failed — please try again'); setLoading(false); return; }
      userId = authData.user.id;
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      username,
      display_name: displayName || username,
      bio: bio || null,
      avatar_url: avatarValid ? avatarUrl : null,
      is_live: false,
    });
    if (profileError) {
      setError('Could not create profile — ' + profileError.message);
      setLoading(false);
      return;
    }
    router.push('/admin');
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .auth-page {
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
        .auth-brand-name { font-family: var(--font-casi-display), var(--font-casi-sans), sans-serif; font-size: 22px; font-weight: 800; color: var(--casi-accent); letter-spacing: 0.5px; }
        .auth-brand-tag  { font-family: var(--font-casi-mono), monospace; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--casi-text-dim); margin-top: 5px; }

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
        .left-step-dot.pending { background: rgba(255,255,255,0.04); border: 1px solid var(--casi-border); color: var(--casi-text-dim); }
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
              <CasiLogo size={60} color="var(--casi-accent)" bgColor="var(--casi-bg)" />
              <span className="auth-brand-name">casi</span>
            </div>
            <div className="auth-brand-tag">Stream monetization</div>
          </div>

          {mode === 'signup' ? (
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
          ) : (
            <div className="auth-quote">
              <div className="auth-quote-text">
                Your stream.<br />
                <span className="o">Your space.</span><br />
                Their stage.
              </div>
              <div className="auth-quote-sub">Monetize your live stream with paid slots</div>
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
                <button type="button" onClick={handleGoogleAuth} disabled={loading} className="auth-oauth-btn">
                  <GoogleG />
                  Continue with Google
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
                <div className="auth-subtitle">Step 1 of 3 — Account</div>
                <button type="button" onClick={handleGoogleAuth} disabled={loading} className="auth-oauth-btn">
                  <GoogleG />
                  Continue with Google
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
                    <input required type="password" placeholder="Min 6 characters"
                      className="auth-input" value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)} />
                    <div className={`auth-hint ${regPassword.length === 0 ? 'dim' : regPassword.length < 6 ? 'err' : 'ok'}`}>
                      {regPassword.length === 0 ? 'At least 6 characters' : regPassword.length < 6 ? `${6 - regPassword.length} more needed` : '✓ Looks good'}
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
                <div className="auth-subtitle">Step 2 of 3 — Becomes your URL</div>
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
                    <button type="button" className="auth-btn-back" onClick={() => { setStep('account'); setError(''); }}>← Back</button>
                    <button type="submit" disabled={usernameStatus !== 'available'} className="auth-btn">Continue →</button>
                  </div>
                </form>
              </>
            )}

            {/* ── SIGN UP — step 3: Profile ── */}
            {mode === 'signup' && step === 'profile' && (
              <>
                <div className="auth-title">Set up your profile</div>
                <div className="auth-subtitle">Step 3 of 3 — Optional, edit anytime</div>
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
                        style={{ flex: 1 }}
                        onChange={(e) => { setAvatarUrl(e.target.value); setAvatarValid(false); }} />
                      {avatarUrl && <img src={avatarUrl} alt="" style={{ display: 'none' }} onLoad={() => setAvatarValid(true)} onError={() => setAvatarValid(false)} />}
                    </div>
                    {avatarUrl && <div className={`auth-hint ${avatarValid ? 'ok' : 'err'}`}>{avatarValid ? '✓ Image loaded' : 'Image not loading — check URL'}</div>}
                  </div>
                  <div className="auth-field">
                    <label className="auth-label">Display name</label>
                    <input type="text" placeholder={username} maxLength={32}
                      className="auth-input" value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)} autoFocus />
                  </div>
                  <div className="auth-field">
                    <label className="auth-label">Bio <span style={{ color: 'var(--casi-text-faint)', textTransform: 'none', fontSize: 9 }}>— optional</span></label>
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
