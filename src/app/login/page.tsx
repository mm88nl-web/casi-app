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

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/admin');
    }
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

        /* Left panel — branding */
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
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(245,130,32,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(245,130,32,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }
        .auth-brand { position: relative; z-index: 1; }
        .auth-brand-name { font-size: 28px; font-weight: 800; color: #F58220; letter-spacing: -1px; margin-top: 12px; }
        .auth-brand-tag { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #444; margin-top: 4px; }

        .auth-quote { position: relative; z-index: 1; }
        .auth-quote-text { font-size: 22px; font-weight: 700; color: #e8e8e8; line-height: 1.3; letter-spacing: -0.5px; margin-bottom: 12px; }
        .auth-quote-text .o { color: #F58220; }
        .auth-quote-sub { font-family: 'DM Mono', monospace; font-size: 11px; color: #444; letter-spacing: 1px; }

        /* Right panel — form */
        .auth-right {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 40px;
          background: #050505;
        }
        .auth-form-wrap { width: 100%; max-width: 380px; }

        .auth-title { font-size: 26px; font-weight: 800; color: #f0f0f0; letter-spacing: -1px; margin-bottom: 6px; }
        .auth-subtitle { font-family: 'DM Mono', monospace; font-size: 11px; color: #444; letter-spacing: 1px; margin-bottom: 36px; }

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

        .auth-error { background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2); border-radius: 8px; padding: 10px 14px; font-family: 'DM Mono', monospace; font-size: 11px; color: #f87171; margin-bottom: 16px; }

        .auth-btn {
          width: 100%; background: #F58220; border: none; border-radius: 10px;
          padding: 14px; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 14px;
          text-transform: uppercase; letter-spacing: 0.5px; color: #050505;
          cursor: pointer; transition: all .2s; margin-top: 8px;
        }
        .auth-btn:hover { background: #ff9030; transform: translateY(-1px); }
        .auth-btn:disabled { background: #1c1c1c; color: #444; transform: none; cursor: not-allowed; }

        .auth-footer { margin-top: 28px; text-align: center; font-family: 'DM Mono', monospace; font-size: 11px; color: #444; }
        .auth-footer a { color: #F58220; text-decoration: none; }
        .auth-footer a:hover { color: #ff9030; }

        .auth-divider { display: flex; align-items: center; gap: 12px; margin: 24px 0; }
        .auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: #111; }
        .auth-divider span { font-family: 'DM Mono', monospace; font-size: 10px; color: #333; letter-spacing: 1px; white-space: nowrap; }

        /* Mobile */
        @media (max-width: 768px) {
          .auth-page { grid-template-columns: 1fr; }
          .auth-left { display: none; }
          .auth-right { padding: 40px 24px; align-items: flex-start; padding-top: 60px; }
          .auth-form-wrap { max-width: 100%; }
        }
      `}</style>

      <div className="auth-page">
        {/* Left branding panel */}
        <div className="auth-left">
          <div className="auth-brand">
            <Logo scale={0.45} />
            <div className="auth-brand-name">casi</div>
            <div className="auth-brand-tag">Stream monetization</div>
          </div>
          <div className="auth-quote">
            <div className="auth-quote-text">
              Your stream.<br/>
              <span className="o">Your space.</span><br/>
              Their stage.
            </div>
            <div className="auth-quote-sub">Monetize your live stream with paid slots</div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="auth-right">
          <div className="auth-form-wrap">
            <div className="auth-title">Welcome back</div>
            <div className="auth-subtitle">Sign in to your studio</div>

            <form onSubmit={handleLogin}>
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

            <div className="auth-divider"><span>new here?</span></div>

            <div className="auth-footer">
              Don't have a studio?{' '}
              <a href="/signup">Create one free →</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
