"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import SearchDropdown from '@/components/SearchDropdown';

function Logo({ scale = 1 }: { scale?: number }) {
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

export default function HomePage() {
  const [liveCount, setLiveCount]         = useState(0);
  const [streamerCount, setStreamerCount]  = useState(0);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { count: total } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: live }  = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_live', true);
      setStreamerCount(total || 0);
      setLiveCount(live || 0);
    };
    load();
  }, [supabase]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .casi-page {
          background: #050505;
          color: #e8e8e8;
          font-family: 'Syne', sans-serif;
          min-height: 100vh;
          overflow-x: hidden;
        }
        .mono { font-family: 'DM Mono', monospace; }

        .casi-page::before {
          content: '';
          position: fixed; inset: 0;
          background-image:
            linear-gradient(rgba(247,147,26,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(247,147,26,0.03) 1px, transparent 1px);
          background-size: 80px 80px;
          pointer-events: none; z-index: 0;
        }

        /* ── NAV ── */
        .casi-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 40px;
          border-bottom: 1px solid #111;
          background: rgba(5,5,5,0.92);
          backdrop-filter: blur(16px);
          gap: 16px;
        }
        .casi-nav-logo {
          display: flex; align-items: center; gap: 10px;
          text-decoration: none; flex-shrink: 0;
        }
        .casi-wordmark { font-size: 22px; font-weight: 800; color: #F58220; letter-spacing: -1px; }
        .casi-nav-right { display: flex; align-items: center; gap: 16px; }

        .nav-link {
          font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 1.5px;
          text-transform: uppercase; color: #555; text-decoration: none;
          transition: color 0.2s; white-space: nowrap;
        }
        .nav-link:hover { color: #e8e8e8; }

        .live-pill {
          display: flex; align-items: center; gap: 6px;
          font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.5px;
          text-transform: uppercase; color: #06b6d4;
          background: rgba(6,182,212,0.08); border: 1px solid rgba(6,182,212,0.2);
          border-radius: 20px; padding: 5px 12px; text-decoration: none; white-space: nowrap;
        }
        .live-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #06b6d4; animation: ldpulse 1.5s infinite; flex-shrink: 0;
        }
        @keyframes ldpulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .btn-primary {
          background: #F58220; color: #050505;
          font-family: 'Syne', sans-serif; font-weight: 800; font-size: 12px;
          letter-spacing: 0.5px; text-transform: uppercase;
          padding: 10px 18px; border-radius: 8px; text-decoration: none;
          transition: all 0.2s; white-space: nowrap; flex-shrink: 0; border: none; cursor: pointer;
        }
        .btn-primary:hover { background: #ff9f20; transform: translateY(-1px); }

        /* ── VIEWER HERO ── */
        .viewer-hero {
          position: relative; z-index: 1;
          max-width: 860px; margin: 0 auto;
          padding: 72px 40px 0;
          text-align: center;
        }
        .viewer-eyebrow {
          font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 3px;
          text-transform: uppercase; color: #06b6d4; margin-bottom: 20px;
          display: flex; align-items: center; justify-content: center; gap: 10px;
        }
        .viewer-eyebrow::before, .viewer-eyebrow::after { content:''; display:block; width:24px; height:1px; background:#06b6d4; }

        .viewer-headline {
          font-size: clamp(38px, 6vw, 72px); font-weight: 800;
          line-height: 1.0; letter-spacing: -3px; color: #f0f0f0; margin-bottom: 16px;
        }
        .viewer-sub {
          font-size: 16px; line-height: 1.7; color: #555;
          max-width: 500px; margin: 0 auto 40px;
        }

        /* search handled by SearchDropdown component */

        /* Live stats row */
        .stats-row {
          display: flex; align-items: center; justify-content: center;
          gap: 32px; padding-bottom: 64px;
          border-bottom: 1px solid #0d0d0d; flex-wrap: wrap;
        }
        .stat-num   { font-size: 28px; font-weight: 800; color: #F58220; letter-spacing: -1px; font-family: 'DM Mono', monospace; }
        .stat-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #444; margin-top: 2px; }

        /* ── STREAMER SECTION ── */
        .streamer-section {
          position: relative; z-index: 1;
          max-width: 1100px; margin: 0 auto;
          padding: 72px 40px 0;
          display: grid; grid-template-columns: 1fr 1fr; gap: 72px; align-items: center;
        }

        .hero-eyebrow {
          font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 3px;
          text-transform: uppercase; color: #F58220; margin-bottom: 24px;
          display: flex; align-items: center; gap: 10px;
        }
        .hero-eyebrow::before { content:''; display:block; width:32px; height:1px; background:#F58220; }

        .hero-headline {
          font-size: clamp(36px, 4vw, 56px); font-weight: 800;
          line-height: 1.0; letter-spacing: -2px; color: #f0f0f0; margin-bottom: 20px;
        }
        .hero-headline .accent { color: #F58220; }
        .hero-sub { font-size: 15px; line-height: 1.7; color: #555; margin-bottom: 36px; max-width: 400px; }
        .hero-ctas { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }

        .btn-ghost {
          font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 1.5px;
          text-transform: uppercase; color: #555; text-decoration: none;
          padding: 11px 0; border-bottom: 1px solid #2a2a2a; transition: all 0.2s;
        }
        .btn-ghost:hover { color: #e8e8e8; border-color: #555; }

        /* ── MOCKUP ── */
        .mockup-wrap { position: relative; }
        .stream-frame {
          aspect-ratio: 16/9; background: #0a0a0a;
          border: 1px solid #1c1c1c; border-radius: 12px; overflow: hidden; position: relative;
        }
        .stream-scanline {
          position: absolute; inset: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px);
          pointer-events: none; z-index: 10;
        }
        .stream-bg { position:absolute; inset:0; background:linear-gradient(135deg,#0e1a0a 0%,#050505 50%,#0a0e1a 100%); }
        .stream-silhouette {
          position:absolute; bottom:0; left:50%; transform:translateX(-50%);
          width:55%; height:90%;
          background:linear-gradient(to top,#1a1a1a 0%,transparent 80%);
          border-radius:50% 50% 0 0/20% 20% 0 0; opacity:0.4;
        }
        .stream-live-badge {
          position:absolute; top:12px; left:50%; transform:translateX(-50%);
          display:flex; align-items:center; gap:5px;
          background:rgba(239,68,68,0.9); border-radius:20px; padding:4px 10px;
          font-family:'DM Mono',monospace; font-size:9px; letter-spacing:2px;
          text-transform:uppercase; color:white; font-weight:500; z-index:20;
        }
        .stream-beam {
          position:absolute; border:1.5px solid rgba(247,147,26,0.5); border-radius:6px;
          background:rgba(247,147,26,0.06); display:flex; flex-direction:column;
          align-items:center; justify-content:center; z-index:20;
        }
        .beam-tl { top:10%; left:5%; width:22%; height:30%; }
        .beam-tr { top:10%; right:5%; width:22%; height:30%; border-color:rgba(6,182,212,0.4); background:rgba(6,182,212,0.05); }
        .beam-label   { font-family:'DM Mono',monospace; font-size:7px; letter-spacing:1px; text-transform:uppercase; color:rgba(247,147,26,0.7); }
        .beam-price   { font-family:'DM Mono',monospace; font-size:9px; font-weight:500; color:#F58220; margin-top:2px; }
        .beam-occupied { font-family:'DM Mono',monospace; font-size:7px; color:#06b6d4; letter-spacing:1px; }
        .beam-avatar  { width:28px; height:28px; border-radius:4px; background:linear-gradient(135deg,rgba(6,182,212,0.3),rgba(6,182,212,0.1)); margin-bottom:3px; display:flex; align-items:center; justify-content:center; font-size:14px; }
        .stream-earnings {
          position:absolute; bottom:10%; right:5%;
          background:rgba(5,5,5,0.9); border:1px solid #1c1c1c; border-radius:8px; padding:8px 12px; z-index:20;
        }
        .earnings-label { font-family:'DM Mono',monospace; font-size:8px; letter-spacing:1.5px; text-transform:uppercase; color:#444; }
        .earnings-num   { font-family:'DM Mono',monospace; font-size:16px; font-weight:500; color:#4ade80; margin-top:1px; }
        .mockup-label   { text-align:center; font-family:'DM Mono',monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#2a2a2a; margin-top:16px; }

        /* ── HOW IT WORKS ── */
        .how-section { position:relative; z-index:1; max-width:1100px; margin:80px auto; padding:0 40px; }
        .how-header  { margin-bottom:56px; }
        .section-label {
          font-family:'DM Mono',monospace; font-size:10px; letter-spacing:3px; text-transform:uppercase;
          color:#F58220; margin-bottom:16px; display:flex; align-items:center; gap:10px;
        }
        .section-label::before { content:''; display:block; width:24px; height:1px; background:#F58220; }
        .section-title { font-size:36px; font-weight:800; letter-spacing:-1.5px; color:#f0f0f0; }

        .steps-grid {
          display:grid; grid-template-columns:repeat(3,1fr); gap:2px;
          background:#0d0d0d; border:1px solid #111; border-radius:12px; overflow:hidden;
        }
        .step-card { padding:40px 32px; background:#050505; position:relative; transition:background 0.2s; }
        .step-card:hover { background:#080808; }
        .step-card+.step-card { border-left:1px solid #111; }
        .step-num   { font-family:'DM Mono',monospace; font-size:11px; letter-spacing:2px; color:#2a2a2a; margin-bottom:20px; }
        .step-icon  { width:44px; height:44px; border-radius:10px; background:rgba(247,147,26,0.08); border:1px solid rgba(247,147,26,0.15); display:flex; align-items:center; justify-content:center; font-size:20px; margin-bottom:20px; }
        .step-title { font-size:20px; font-weight:700; letter-spacing:-0.5px; color:#e8e8e8; margin-bottom:10px; }
        .step-body  { font-size:14px; line-height:1.65; color:#555; }
        .step-accent { position:absolute; bottom:0; left:0; right:0; height:2px; background:transparent; transition:background 0.2s; }
        .step-card:hover .step-accent { background:linear-gradient(90deg,#F58220,transparent); }

        /* ── CTA ── */
        .cta-section { position:relative; z-index:1; max-width:1100px; margin:0 auto 100px; padding:0 40px; }
        .cta-inner {
          background:#0a0a0a; border:1px solid #1c1c1c; border-radius:16px; padding:64px;
          display:grid; grid-template-columns:1fr auto; gap:48px; align-items:center;
          position:relative; overflow:hidden;
        }
        .cta-inner::before { content:''; position:absolute; top:-80px; right:-80px; width:320px; height:320px; background:radial-gradient(circle,rgba(247,147,26,0.06) 0%,transparent 70%); pointer-events:none; }
        .cta-title   { font-size:40px; font-weight:800; letter-spacing:-1.5px; color:#f0f0f0; margin-bottom:12px; }
        .cta-sub     { font-size:15px; color:#555; line-height:1.6; }
        .cta-actions { display:flex; flex-direction:column; gap:12px; align-items:flex-end; flex-shrink:0; }
        .cta-note    { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:1px; color:#333; text-align:right; }

        /* ── FOOTER ── */
        .casi-footer { position:relative; z-index:1; border-top:1px solid #0d0d0d; padding:28px 40px; display:flex; align-items:center; justify-content:space-between; }
        .footer-links { display:flex; align-items:center; gap:28px; }

        /* ── MOBILE ── */
        @media (max-width: 768px) {
          .casi-nav { padding: 10px 16px; gap: 8px; }
          .casi-nav-right { gap: 10px; }
          .nav-live-hide { display: none; }
          .btn-primary { font-size: 11px; padding: 9px 14px; }

          .viewer-hero { padding: 48px 20px 0; }
          .viewer-headline { letter-spacing: -2px; }
          .search-form { border-radius: 10px; }

          .streamer-section { grid-template-columns: 1fr; gap: 40px; padding: 48px 20px 0; }
          .hero-headline { font-size: 36px; letter-spacing: -1.5px; }
          .hero-sub { font-size: 14px; }

          .how-section  { padding: 0 20px; margin: 60px auto; }
          .steps-grid   { grid-template-columns: 1fr; }
          .step-card+.step-card { border-left: none; border-top: 1px solid #111; }

          .cta-section { padding: 0 20px; }
          .cta-inner   { grid-template-columns: 1fr; padding: 36px 24px; gap: 28px; }
          .cta-actions { align-items: flex-start; }
          .cta-note    { text-align: left; }
          .cta-title   { font-size: 28px; }

          .casi-footer { padding: 24px 20px; flex-direction: column; gap: 16px; }
          .stats-row   { gap: 20px; padding-bottom: 48px; }
        }
      `}</style>

      <div className="casi-page">

        {/* NAV */}
        <nav className="casi-nav">
          <a href="/" className="casi-nav-logo">
            <Logo scale={0.18} />
            <span className="casi-wordmark">casi</span>
          </a>
          <div className="casi-nav-right">
            {liveCount > 0 && (
              <span className="live-pill nav-live-hide">
                <span className="live-dot" />
                {liveCount} live now
              </span>
            )}
            <a href="/login" className="btn-primary">Studio →</a>
          </div>
        </nav>

        {/* ── VIEWER HERO ── */}
        <section className="viewer-hero">
          <div className="viewer-eyebrow">Watch live · Rent a slot · Support your streamer</div>
          <h1 className="viewer-headline">Find your stream.</h1>
          <p className="viewer-sub">
            Jump into any stream, rent a slot on screen, or just watch. No account needed to browse.
          </p>

          {/* Search with live dropdown */}
          <div style={{ marginBottom: 40 }}>
            <SearchDropdown />
          </div>

          {/* Stats */}
          {(streamerCount > 0 || liveCount > 0) && (
            <div className="stats-row">
              {streamerCount > 0 && (
                <div>
                  <div className="stat-num mono">{streamerCount}</div>
                  <div className="stat-label">Streamers</div>
                </div>
              )}
              {liveCount > 0 && (
                <>
                  <div style={{ width: 1, height: 32, background: '#1c1c1c' }} />
                  <div>
                    <div className="stat-num mono" style={{ color: '#06b6d4' }}>{liveCount}</div>
                    <div className="stat-label">Live now</div>
                  </div>
                </>
              )}
              <div style={{ width: 1, height: 32, background: '#1c1c1c' }} />
              <div>
                <div className="stat-num mono">0%</div>
                <div className="stat-label">Platform fee</div>
              </div>
            </div>
          )}
        </section>

        {/* ── STREAMER PITCH ── */}
        <section className="streamer-section">
          <div>
            <div className="hero-eyebrow">For streamers</div>
            <h2 className="hero-headline">
              Your stream.<br />
              <span className="accent">Your space.</span><br />
              Their stage.
            </h2>
            <p className="hero-sub">
              Let viewers rent slots on your live stream. They place their image or brand on your screen — you get paid per minute, per hour, your rules.
            </p>
            <div className="hero-ctas">
              <a href="/login?tab=signup" className="btn-primary">Create your studio →</a>
              <a href="/login" className="btn-ghost">Sign in</a>
            </div>
          </div>

          {/* Mockup */}
          <div className="mockup-wrap">
            <div className="stream-frame">
              <div className="stream-scanline" />
              <div className="stream-bg" />
              <div className="stream-silhouette" />
              <div className="stream-live-badge">
                <span className="live-dot" style={{ background: 'white', width: 5, height: 5 }} />
                Live
              </div>
              <div className="stream-beam beam-tl">
                <div className="beam-label">Beam slot</div>
                <div className="beam-price">$5/min</div>
              </div>
              <div className="stream-beam beam-tr">
                <div className="beam-avatar">🔥</div>
                <div className="beam-occupied">● CoolTiger42</div>
              </div>
              <div className="stream-earnings">
                <div className="earnings-label">Earning</div>
                <div className="earnings-num">$4.80<span style={{ fontSize: 10, color: '#444' }}>/min</span></div>
              </div>
            </div>
            <div className="mockup-label">Your stream, monetized in real time</div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="how-section">
          <div className="how-header">
            <div className="section-label">How it works</div>
            <h2 className="section-title">Up in under 5 minutes</h2>
          </div>
          <div className="steps-grid">
            {[
              { num: '01', icon: '✦', title: 'Add slots to OBS', body: 'Drop a browser source into OBS. Add beam slots or a full backdrop — position them anywhere on your scene.' },
              { num: '02', icon: '$', title: 'Set your price', body: 'Charge per minute or per hour. You set the rate, cap the duration, lock slots when you want. Your stream, your rules.' },
              { num: '03', icon: '●', title: 'Approve and earn', body: 'Viewers request a slot with their image. You approve it, it goes live instantly on stream. Queue fills automatically.' },
            ].map(step => (
              <div className="step-card" key={step.num}>
                <div className="step-num mono">{step.num}</div>
                <div className="step-icon">{step.icon}</div>
                <div className="step-title">{step.title}</div>
                <div className="step-body">{step.body}</div>
                <div className="step-accent" />
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="cta-section">
          <div className="cta-inner">
            <div>
              <h2 className="cta-title">Ready to monetize?</h2>
              <p className="cta-sub">Set up your overlay, set your price, go live. Payments via Stripe and Solana — get in early.</p>
            </div>
            <div className="cta-actions">
              <a href="/login?tab=signup" className="btn-primary" style={{ fontSize: 14, padding: '14px 28px' }}>Create your studio →</a>
              <div className="cta-note">Free to start · No card required</div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="casi-footer">
          <a href="/" className="casi-nav-logo" style={{ textDecoration: 'none' }}>
            <Logo scale={0.15} />
          </a>
          <div className="footer-links">
            <a href="/login?tab=signup" className="nav-link">Create studio</a>
            <a href="/login" className="nav-link">Sign in</a>
          </div>
        </footer>

      </div>
    </>
  );
}
