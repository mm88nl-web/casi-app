"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

function Logo({ scale = 1, color = '#F58220', bg = '#050505' }: { scale?: number; color?: string; bg?: string }) {
  const w = 120 * scale;
  const h = 60 * scale;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width={w} height={h}>
      <g stroke={color} fill={color} strokeWidth="16" strokeLinecap="round">
        <line x1="50" y1="60" x2="350" y2="60" />
        <line x1="20" y1="100" x2="380" y2="100" />
        <line x1="50" y1="140" x2="350" y2="140" />
      </g>
      <path fill={color} stroke="none" d="M 90,100 C 130,30 270,30 310,100 C 270,170 130,170 90,100 Z" />
      <circle fill={bg} cx="200" cy="100" r="45" />
    </svg>
  );
}

export default function HomePage() {
  const [liveCount, setLiveCount] = useState(0);
  const [streamerCount, setStreamerCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { count: total } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: live } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_live', true);
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

        .cp { background: #050505; color: #e8e8e8; font-family: 'Syne', sans-serif; min-height: 100vh; overflow-x: hidden; }
        .cp::before {
          content: ''; position: fixed; inset: 0;
          background-image: linear-gradient(rgba(245,130,32,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(245,130,32,0.025) 1px, transparent 1px);
          background-size: 64px 64px; pointer-events: none; z-index: 0;
        }
        .mono { font-family: 'DM Mono', monospace; }

        /* ── NAV ── */
        .nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 48px; height: 68px;
          border-bottom: 1px solid #111;
          background: rgba(5,5,5,0.94);
          backdrop-filter: blur(20px);
        }
        .nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .nav-wm { font-size: 22px; font-weight: 800; color: #F58220; letter-spacing: -0.5px; }
        .nav-right { display: flex; align-items: center; gap: 28px; }
        .nav-link { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #555; text-decoration: none; transition: color .2s; }
        .nav-link:hover { color: #e8e8e8; }
        .live-pill { display: flex; align-items: center; gap: 6px; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #06b6d4; background: rgba(6,182,212,0.08); border: 1px solid rgba(6,182,212,0.25); border-radius: 20px; padding: 5px 14px; text-decoration: none; white-space: nowrap; }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #06b6d4; animation: blink 1.5s infinite; flex-shrink: 0; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        .btn-primary { background: #F58220; color: #050505; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 13px; text-transform: uppercase; padding: 11px 22px; border-radius: 8px; text-decoration: none; transition: all .2s; white-space: nowrap; letter-spacing: 0.3px; }
        .btn-primary:hover { background: #ff9030; transform: translateY(-1px); }

        /* ── HERO ── */
        .hero {
          position: relative; z-index: 1;
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 64px; align-items: center;
          max-width: 1280px; margin: 0 auto;
          padding: 88px 48px 80px;
        }
        .eyebrow { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: #F58220; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
        .eyebrow::before { content: ''; display: block; width: 28px; height: 1px; background: #F58220; flex-shrink: 0; }
        .headline { font-size: clamp(36px, 3.8vw, 64px); font-weight: 800; line-height: 1.0; letter-spacing: -2.5px; color: #f0f0f0; margin-bottom: 22px; }
        .headline .o { color: #F58220; }
        .sub { font-size: 15px; line-height: 1.8; color: #555; margin-bottom: 40px; max-width: 420px; }
        .ctas { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
        .btn-lg { background: #F58220; color: #050505; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 14px; text-transform: uppercase; padding: 15px 30px; border-radius: 10px; text-decoration: none; transition: all .2s; white-space: nowrap; letter-spacing: 0.3px; }
        .btn-lg:hover { background: #ff9030; transform: translateY(-1px); }
        .btn-ghost { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #444; text-decoration: none; border-bottom: 1px solid #222; padding-bottom: 2px; transition: all .2s; }
        .btn-ghost:hover { color: #aaa; border-color: #555; }

        .stats { display: flex; align-items: center; gap: 32px; margin-top: 52px; padding-top: 36px; border-top: 1px solid #111; flex-wrap: wrap; }
        .stat-n { font-family: 'DM Mono', monospace; font-size: 28px; font-weight: 500; color: #F58220; letter-spacing: -1px; line-height: 1; }
        .stat-l { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #333; margin-top: 4px; }
        .stat-div { width: 1px; height: 32px; background: #1c1c1c; flex-shrink: 0; }

        /* ── STREAM MOCKUP ── */
        .stream-frame { width: 100%; aspect-ratio: 16/9; background: #080808; border: 1px solid #1c1c1c; border-radius: 14px; overflow: hidden; position: relative; }
        .sf-bg { position: absolute; inset: 0; background: linear-gradient(135deg, #0d160a 0%, #050505 45%, #090d18 100%); }
        .sf-scan { position: absolute; inset: 0; z-index: 9; background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px); pointer-events: none; }
        .sf-person { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 48%; height: 82%; background: linear-gradient(to top, #1a1a1a 0%, #111 35%, transparent 100%); border-radius: 50% 50% 0 0 / 15% 15% 0 0; opacity: 0.28; }
        .sf-live { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 5px; background: rgba(220,38,38,0.88); border-radius: 20px; padding: 3px 10px; font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: white; z-index: 20; white-space: nowrap; }
        .sf-beam { position: absolute; z-index: 20; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
        .sf-empty { top: 8%; left: 4%; width: 22%; height: 32%; border: 1.5px dashed rgba(245,130,32,0.4); background: rgba(245,130,32,0.04); }
        .sf-full  { top: 8%; right: 4%; width: 22%; height: 32%; border: 1.5px solid rgba(6,182,212,0.5); background: rgba(6,182,212,0.06); }
        .sf-bl { font-family: 'DM Mono', monospace; font-size: 7px; letter-spacing: 1px; text-transform: uppercase; color: rgba(245,130,32,0.6); }
        .sf-bp { font-family: 'DM Mono', monospace; font-size: 10px; color: #F58220; }
        .sf-av { width: 24px; height: 24px; border-radius: 5px; background: rgba(6,182,212,0.2); display: flex; align-items: center; justify-content: center; font-size: 12px; }
        .sf-bn { font-family: 'DM Mono', monospace; font-size: 7px; color: #06b6d4; }
        .sf-card { position: absolute; z-index: 20; background: rgba(5,5,5,0.92); border-radius: 8px; padding: 8px 12px; }
        .sf-earn { bottom: 8%; right: 4%; border: 1px solid #1c1c1c; }
        .sf-queue { bottom: 8%; left: 4%; border: 1px solid rgba(245,130,32,0.15); }
        .sf-cl { font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 1.5px; text-transform: uppercase; color: #3a3a3a; }
        .sf-cv { font-family: 'DM Mono', monospace; font-size: 17px; margin-top: 2px; }
        .frame-cap { text-align: center; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #1e1e1e; margin-top: 14px; }

        /* ── HOW IT WORKS ── */
        .how { position: relative; z-index: 1; max-width: 1280px; margin: 0 auto; padding: 80px 48px; border-top: 1px solid #0d0d0d; }
        .sec-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: #F58220; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
        .sec-label::before { content: ''; display: block; width: 24px; height: 1px; background: #F58220; flex-shrink: 0; }
        .sec-title { font-size: clamp(24px, 2.8vw, 40px); font-weight: 800; letter-spacing: -1.5px; color: #f0f0f0; margin-bottom: 48px; }
        .steps { display: grid; grid-template-columns: repeat(3,1fr); border: 1px solid #111; border-radius: 14px; overflow: hidden; }
        .step { padding: 40px 32px; background: #050505; position: relative; transition: background .25s; }
        .step:hover { background: #080808; }
        .step + .step { border-left: 1px solid #111; }
        .step-n { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; color: #222; margin-bottom: 20px; }
        .step-ic { width: 44px; height: 44px; border-radius: 10px; background: rgba(245,130,32,0.07); border: 1px solid rgba(245,130,32,0.13); display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 20px; }
        .step-t { font-size: 19px; font-weight: 700; letter-spacing: -0.5px; color: #e8e8e8; margin-bottom: 10px; }
        .step-b { font-size: 13px; line-height: 1.7; color: #484848; }
        .step-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: transparent; transition: background .3s; }
        .step:hover .step-bar { background: linear-gradient(90deg, #F58220 0%, transparent 100%); }

        /* ── CTA ── */
        .cta-wrap { position: relative; z-index: 1; max-width: 1280px; margin: 0 auto 88px; padding: 0 48px; }
        .cta-box {
          background: #080808; border: 1px solid #181818; border-radius: 16px;
          padding: 64px 64px; display: flex; align-items: center; justify-content: space-between;
          gap: 48px; position: relative; overflow: hidden;
        }
        .cta-box::before {
          content: ''; position: absolute; top: -120px; right: -120px;
          width: 480px; height: 480px;
          background: radial-gradient(circle, rgba(245,130,32,0.055) 0%, transparent 65%);
          pointer-events: none;
        }
        .cta-t { font-size: clamp(26px, 2.8vw, 40px); font-weight: 800; letter-spacing: -1.5px; color: #f0f0f0; margin-bottom: 12px; }
        .cta-s { font-size: 14px; color: #484848; line-height: 1.65; max-width: 520px; }
        .cta-r { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; flex-shrink: 0; }
        .cta-note { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1px; color: #2a2a2a; }

        /* ── FOOTER ── */
        .foot { position: relative; z-index: 1; border-top: 1px solid #0d0d0d; padding: 28px 48px; display: flex; align-items: center; justify-content: space-between; }
        .foot-links { display: flex; gap: 28px; }

        /* ── MOBILE ── */
        @media (max-width: 960px) {
          .nav { padding: 0 20px; }
          .nav-link { display: none; }
          .hero { grid-template-columns: 1fr; padding: 52px 20px 60px; gap: 44px; }
          .headline { font-size: clamp(32px, 9vw, 52px); letter-spacing: -2px; }
          .sub { max-width: 100%; }
          .how { padding: 60px 20px; }
          .steps { grid-template-columns: 1fr; }
          .step + .step { border-left: none; border-top: 1px solid #111; }
          .cta-wrap { padding: 0 20px; margin-bottom: 60px; }
          .cta-box { flex-direction: column; align-items: flex-start; padding: 40px 28px; }
          .cta-r { align-items: flex-start; }
          .foot { padding: 24px 20px; flex-direction: column; gap: 20px; }
          .foot-links { flex-wrap: wrap; justify-content: center; }
        }
        @media (max-width: 500px) {
          .ctas { flex-direction: column; align-items: flex-start; }
          .stats { gap: 20px; }
        }
      `}</style>

      <div className="cp">

        {/* NAV */}
        <nav className="nav">
          <a href="/" className="nav-logo">
            <Logo scale={0.42} />
            <span className="nav-wm">casi</span>
          </a>
          <div className="nav-right">
            {liveCount > 0 && (
              <a href="/search" className="live-pill">
                <span className="live-dot" />
                {liveCount} live now
              </a>
            )}
            <a href="/search" className="nav-link">Browse</a>
            <a href="/login" className="nav-link">Sign in</a>
            <a href="/signup" className="btn-primary">Start streaming →</a>
          </div>
        </nav>

        {/* HERO */}
        <section className="hero">
          <div>
            <div className="eyebrow">Stream monetization</div>
            <h1 className="headline">
              Your stream.<br/>
              <span className="o">Your space.</span><br/>
              Their stage.
            </h1>
            <p className="sub">
              Let viewers rent slots on your live stream. They place their image or brand on your screen — you get paid per minute, per hour, your rules.
            </p>
            <div className="ctas">
              <a href="/signup" className="btn-lg">Create your studio →</a>
              <a href="/search" className="btn-ghost">Browse streams</a>
            </div>
            {streamerCount > 0 && (
              <div className="stats">
                <div>
                  <div className="stat-n">{streamerCount}</div>
                  <div className="stat-l">Streamers</div>
                </div>
                {liveCount > 0 && (
                  <>
                    <div className="stat-div" />
                    <div>
                      <div className="stat-n" style={{ color: '#06b6d4' }}>{liveCount}</div>
                      <div className="stat-l">Live now</div>
                    </div>
                  </>
                )}
                <div className="stat-div" />
                <div>
                  <div className="stat-n">2–5%</div>
                  <div className="stat-l">Platform fee</div>
                </div>
              </div>
            )}
          </div>

          {/* MOCKUP */}
          <div>
            <div className="stream-frame">
              <div className="sf-bg" />
              <div className="sf-scan" />
              <div className="sf-person" />
              <div className="sf-live">
                <span className="live-dot" style={{ background: 'white', width: 5, height: 5 }} />
                Live
              </div>
              <div className="sf-beam sf-empty">
                <div className="sf-bl">Beam slot</div>
                <div className="sf-bp">$5/min</div>
              </div>
              <div className="sf-beam sf-full">
                <div className="sf-av">🔥</div>
                <div className="sf-bn">● CoolTiger42</div>
              </div>
              <div className="sf-card sf-queue">
                <div className="sf-cl">Queue</div>
                <div className="sf-cv" style={{ color: '#F58220' }}>3 waiting</div>
              </div>
              <div className="sf-card sf-earn">
                <div className="sf-cl">Earning</div>
                <div className="sf-cv" style={{ color: '#4ade80' }}>$4.80<span style={{ fontSize: 10, color: '#2a2a2a' }}>/min</span></div>
              </div>
            </div>
            <div className="frame-cap">Your stream, monetized in real time</div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="how">
          <div className="sec-label">How it works</div>
          <h2 className="sec-title">Up in under 5 minutes</h2>
          <div className="steps">
            {[
              { n: '01', ic: '✦', t: 'Add slots to OBS',  b: 'Drop a browser source into OBS. Add beam slots or a full backdrop — position them anywhere on your scene.' },
              { n: '02', ic: '$', t: 'Set your price',    b: 'Charge per minute or per hour. Cap the duration, lock slots when full. Your stream, your rules.' },
              { n: '03', ic: '●', t: 'Approve and earn',  b: 'Viewers request a slot with their image. You approve it, it goes live instantly. Queue fills automatically.' },
            ].map(s => (
              <div className="step" key={s.n}>
                <div className="step-n mono">{s.n}</div>
                <div className="step-ic">{s.ic}</div>
                <div className="step-t">{s.t}</div>
                <div className="step-b">{s.b}</div>
                <div className="step-bar" />
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="cta-wrap">
          <div className="cta-box">
            <div>
              <h2 className="cta-t">Ready to monetize?</h2>
              <p className="cta-s">Set up your overlay, set your price, go live. Stripe payments coming soon — get in early and shape the platform.</p>
            </div>
            <div className="cta-r">
              <a href="/signup" className="btn-lg">Create your studio →</a>
              <div className="cta-note">Free to start · No card required</div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="foot">
          <a href="/" className="nav-logo" style={{ textDecoration: 'none' }}>
            <Logo scale={0.42} />
            <span className="nav-wm">casi</span>
          </a>
          <div className="foot-links">
            <a href="/search" className="nav-link">Find streams</a>
            <a href="/signup" className="nav-link">Sign up</a>
            <a href="/login" className="nav-link">Sign in</a>
          </div>
        </footer>

      </div>
    </>
  );
}
