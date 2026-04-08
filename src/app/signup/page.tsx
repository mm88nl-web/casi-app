"use client";
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

function Logo({ scale = 0.45 }: { scale?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width={400 * scale} height={200 * scale}>
      <g stroke="#F58220" fill="#F58220" strokeWidth="16" strokeLinecap="round">
        <line x1="50" y1="60" x2="350" y2="60" />
        <line x1="20" y1="100" x2="380" y2="100" />
        <line x1="50" y1="140" x2="350" y2="140" />
      </g>
      <path fill="#F58220" stroke="none" d="M 90,100 C 130,30 270,30 310,100 C 270,170 130,170 90,100 Z" />
      <circle fill="#050505" cx="200" cy="100" r="45" />
    </svg>
  );
}

type Step = 'account' | 'username' | 'profile';
const STEPS: Step[] = ['account', 'username', 'profile'];
const STEP_LABELS = ['Account', 'Username', 'Profile'];

export default function SignupPage() {
  const [step, setStep] = useState<Step>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarValid, setAvatarValid] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'taken' | 'available'>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const stepIndex = STEPS.indexOf(step);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const handleAccountStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setStep('username');
  };

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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError || !authData.user) {
      setError(authError?.message || 'Signup failed');
      setLoading(false);
      return;
    }
    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id, username,
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

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .auth-page {
          min-height: 100vh;
          background: #050505;
          display: grid;
          grid-template-columns: 1fr 1fr;
          font-family: 'Syne', sans-serif;
        }

        .auth-left {
          background: #080808;
          border-right: 1px solid #111;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px;
          position: relative;
          overflow: hidden;
        }
        .auth-left::before {
          content: '';
          position: absolute;
          bottom: -120px; left: -120px;
          width: 480px; height: 480px;
          background: radial-gradient(circle, rgba(245,130,32,0.07) 0%, transparent 65%);
          pointer-events: none;
        }
        .auth-left::after {
          content: '';
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(245,130,32,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(245,130,32,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }
        .auth-brand { position: relative; z-index: 1; }
        .auth-brand-name { font-size: 28px; font-weight: 800; color: #F58220; letter-spacing: -1px; margin-top: 12px; }
        .auth-brand-tag { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #444; margin-top: 4px; }

        /* Steps indicator on left panel */
        .left-steps { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 16px; }
        .left-step { display: flex; align-items: center; gap: 14px; }
        .left-step-dot {
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500;
          flex-shrink: 0; transition: all .3s;
        }
        .left-step-dot.done    { background: #F58220; color: #050505; }
        .left-step-dot.current { background: rgba(245,130,32,0.15); border: 1px solid rgba(245,130,32,0.4); color: #F58220; }
        .left-step-dot.pending { background: rgba(255,255,255,0.04); border: 1px solid #1c1c1c; color: #333; }
        .left-step-label { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; transition: color .3s; }
        .left-step-label.done    { color: #F58220; }
        .left-step-label.current { color: #e8e8e8; }
        .left-step-label.pending { color: #333; }
        .left-step-connector { width: 1px; height: 16px; background: #1c1c1c; margin-left: 15px; }

        .auth-right {
          display: flex; align-items: center; justify-content: center;
          padding: 48px 40px; background: #050505;
        }
        .auth-form-wrap { width: 100%; max-width: 400px; }

        .auth-title { font-size: 26px; font-weight: 800; color: #f0f0f0; letter-spacing: -1px; margin-bottom: 6px; }
        .auth-subtitle { font-family: 'DM Mono', monospace; font-size: 11px; color: #444; letter-spacing: 1px; margin-bottom: 32px; }

        .auth-field { margin-bottom: 16px; }
        .auth-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #555; display: block; margin-bottom: 8px; }
        .auth-input {
          width: 100%; background: #0a0a0a; border: 1px solid #1c1c1c;
          border-radius: 10px; padding: 13px 16px; font-size: 14px;
          color: #e8e8e8; outline: none; transition: border-color .2s;
          font-family: 'Syne', sans-serif;
        }
        .auth-input::placeholder { color: #333; }
        .auth-input:focus { border-color: rgba(245,130,32,0.4); }
        .auth-input.valid   { border-color: rgba(74,222,128,0.4); }
        .auth-input.invalid { border-color: rgba(248,113,113,0.4); }

        .auth-hint { font-family: 'DM Mono', monospace; font-size: 10px; margin-top: 6px; min-height: 16px; }
        .auth-hint.ok  { color: #4ade80; }
        .auth-hint.err { color: #f87171; }
        .auth-hint.dim { color: #444; }

        .auth-error { background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2); border-radius: 8px; padding: 10px 14px; font-family: 'DM Mono', monospace; font-size: 11px; color: #f87171; margin-bottom: 16px; }

        .auth-btn {
          width: 100%; background: #F58220; border: none; border-radius: 10px;
          padding: 14px; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 14px;
          text-transform: uppercase; letter-spacing: 0.5px; color: #050505;
          cursor: pointer; transition: all .2s;
        }
        .auth-btn:hover:not(:disabled) { background: #ff9030; transform: translateY(-1px); }
        .auth-btn:disabled { background: #1c1c1c; color: #444; cursor: not-allowed; }

        .auth-btn-row { display: flex; gap: 10px; margin-top: 8px; }
        .auth-btn-back {
          flex-shrink: 0; background: rgba(255,255,255,0.04); border: 1px solid #1c1c1c;
          border-radius: 10px; padding: 14px 20px; font-family: 'Syne', sans-serif;
          font-weight: 700; font-size: 13px; text-transform: uppercase; color: #555;
          cursor: pointer; transition: all .2s;
        }
        .auth-btn-back:hover { background: rgba(255,255,255,0.08); color: #e8e8e8; }

        .auth-footer { margin-top: 28px; text-align: center; font-family: 'DM Mono', monospace; font-size: 11px; color: #444; }
        .auth-footer a { color: #F58220; text-decoration: none; }
        .auth-footer a:hover { color: #ff9030; }

        /* Username input with @ prefix */
        .username-wrap { position: relative; }
        .username-at { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-family: 'DM Mono', monospace; font-size: 14px; color: #444; pointer-events: none; }
        .username-input { padding-left: 28px !important; }

        /* URL preview box */
        .url-preview { background: rgba(245,130,32,0.05); border: 1px solid rgba(245,130,32,0.12); border-radius: 8px; padding: 12px 14px; margin-top: 12px; }
        .url-preview-label { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: #555; margin-bottom: 4px; }
        .url-preview-value { font-family: 'DM Mono', monospace; font-size: 11px; color: #F58220; word-break: break-all; }

        /* Avatar preview */
        .avatar-row { display: flex; align-items: center; gap: 16px; }
        .avatar-circle { width: 56px; height: 56px; border-radius: 50%; border: 1px dashed #222; background: #0a0a0a; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 24px; }

        /* Mobile */
        @media (max-width: 768px) {
          .auth-page { grid-template-columns: 1fr; }
          .auth-left { display: none; }
          .auth-right { padding: 40px 24px; align-items: flex-start; padding-top: 60px; }
          .auth-form-wrap { max-width: 100%; }
        }
      `}</style>

      <div className="auth-page">
        {/* Left */}
        <div className="auth-left">
          <div className="auth-brand">
            <Logo scale={0.45} />
            <div className="auth-brand-name">casi</div>
            <div className="auth-brand-tag">Stream monetization</div>
          </div>

          {/* Step indicators */}
          <div className="left-steps">
            {STEPS.map((s, i) => {
              const state = i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'pending';
              return (
                <div key={s}>
                  <div className="left-step">
                    <div className={`left-step-dot ${state}`}>
                      {state === 'done' ? '✓' : i + 1}
                    </div>
                    <div className={`left-step-label ${state}`}>{STEP_LABELS[i]}</div>
                  </div>
                  {i < STEPS.length - 1 && <div className="left-step-connector" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right */}
        <div className="auth-right">
          <div className="auth-form-wrap">

            {/* Step 1 — Account */}
            {step === 'account' && (
              <>
                <div className="auth-title">Create your studio</div>
                <div className="auth-subtitle">Step 1 of 3 — Account</div>
                <form onSubmit={handleAccountStep}>
                  <div className="auth-field">
                    <label className="auth-label">Email</label>
                    <input required type="email" placeholder="streamer@email.com"
                      className="auth-input" value={email}
                      onChange={(e) => setEmail(e.target.value)} autoFocus />
                  </div>
                  <div className="auth-field">
                    <label className="auth-label">Password</label>
                    <input required type="password" placeholder="Min 6 characters"
                      className="auth-input" value={password}
                      onChange={(e) => setPassword(e.target.value)} />
                    <div className={`auth-hint ${password.length === 0 ? 'dim' : password.length < 6 ? 'err' : 'ok'}`}>
                      {password.length === 0 ? 'At least 6 characters' : password.length < 6 ? `${6 - password.length} more characters needed` : '✓ Looks good'}
                    </div>
                  </div>
                  {error && <div className="auth-error">{error}</div>}
                  <div style={{ marginTop: 8 }}>
                    <button type="submit" className="auth-btn">Continue →</button>
                  </div>
                </form>
                <div className="auth-footer" style={{ marginTop: 24 }}>
                  Already have a studio? <a href="/login">Sign in</a>
                </div>
              </>
            )}

            {/* Step 2 — Username */}
            {step === 'username' && (
              <>
                <div className="auth-title">Pick your username</div>
                <div className="auth-subtitle">Step 2 of 3 — This becomes your URL</div>
                <form onSubmit={handleUsernameStep}>
                  <div className="auth-field">
                    <label className="auth-label">Username</label>
                    <div className="username-wrap">
                      <span className="username-at">@</span>
                      <input type="text" placeholder="yourname" autoFocus maxLength={24}
                        className={`auth-input username-input ${usernameStatus === 'available' ? 'valid' : usernameStatus === 'taken' ? 'invalid' : ''}`}
                        value={username}
                        onChange={(e) => checkUsername(e.target.value)} />
                    </div>
                    <div className={`auth-hint ${usernameStatus === 'available' ? 'ok' : usernameStatus === 'taken' ? 'err' : 'dim'}`}>
                      {usernameStatus === 'checking' && 'Checking…'}
                      {usernameStatus === 'available' && '✓ Available'}
                      {usernameStatus === 'taken' && '✗ Already taken'}
                      {usernameStatus === 'idle' && (username.length > 0 && username.length < 3 ? 'Min 3 characters' : 'Lowercase, numbers, underscores')}
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

            {/* Step 3 — Profile */}
            {step === 'profile' && (
              <>
                <div className="auth-title">Set up your profile</div>
                <div className="auth-subtitle">Step 3 of 3 — Optional, you can always edit later</div>
                <form onSubmit={handleSignup}>
                  {/* Avatar */}
                  <div className="auth-field">
                    <label className="auth-label">Avatar URL</label>
                    <div className="avatar-row">
                      <div className="avatar-circle">
                        {avatarValid && avatarUrl
                          ? <img src={avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          : '👤'}
                      </div>
                      <input type="text" placeholder="https://your-image.png" className="auth-input" value={avatarUrl}
                        onChange={(e) => { setAvatarUrl(e.target.value); setAvatarValid(false); }} style={{ flex: 1 }} />
                      {avatarUrl && <img src={avatarUrl} className="hidden" alt="" onLoad={() => setAvatarValid(true)} onError={() => setAvatarValid(false)} style={{ display: 'none' }} />}
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
                    <label className="auth-label">Bio <span style={{ color: '#333', textTransform: 'none', fontSize: 9 }}>— optional</span></label>
                    <textarea placeholder="What do you stream? Tell viewers about yourself…"
                      rows={3} maxLength={160}
                      style={{ width: '100%', background: '#0a0a0a', border: '1px solid #1c1c1c', borderRadius: 10, padding: '13px 16px', fontSize: 14, color: '#e8e8e8', outline: 'none', fontFamily: "'Syne', sans-serif", resize: 'none', transition: 'border-color .2s' }}
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
