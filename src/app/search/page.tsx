'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { CasiMark } from '@/components/v9/CasiMark';
import { Wordmark } from '@/components/v9/Wordmark';

// Same three roots as the landing — edit once, updates both.
const P = '#f5e1d2';
const I = '#294b3c';
const A = '#c04830';

type LiveProfile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  ink_color: string | null;
  theme_color: string | null;
};

export default function BrowsePage() {
  const supabase = createClient();
  const [live, setLive] = useState<LiveProfile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, bio, ink_color, theme_color')
        .eq('is_live', true)
        .order('username');
      if (!cancelled) setLive((data ?? []) as LiveProfile[]);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const showLive = live !== null && live.length > 0;

  return (
    <main className="casi-browse" data-paper="light">
      <header className="top">
        <Link href="/" className="mark" aria-label="Casi">
          <CasiMark />
          <Wordmark />
        </Link>
        <div className="top-r">
          {showLive && (
            <>
              <div className="stamp">
                <span className="n">{live!.length}</span> live
              </div>
              <span className="sep" aria-hidden="true" />
            </>
          )}
          <Link href="/login" className="login">Log in</Link>
        </div>
      </header>

      <section className="b-head">
        <h1>
          Pick a streamer.<br />
          <em>Take their screen.</em>
        </h1>
      </section>

      <section className="b-body">
        {live === null ? (
          <div className="b-loading">Loading…</div>
        ) : live.length === 0 ? (
          <div className="b-empty">
            <h2>No one&apos;s live right now.</h2>
            <p>Be the first to go live.</p>
            <Link
              href="/studio"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                marginTop: '20px',
                background: I,
                color: P,
                padding: '13px 22px',
                fontFamily: 'var(--font-casi-display), system-ui, sans-serif',
                fontWeight: 700,
                fontSize: '15px',
                border: `1.5px solid ${I}`,
                textDecoration: 'none',
              }}
            >
              Go live yourself →
            </Link>
          </div>
        ) : (
          <div className="b-grid">
            {live.map((p) => {
              const accent = p.ink_color || p.theme_color || I;
              const initial = (p.display_name || p.username).charAt(0).toUpperCase();
              return (
                <Link
                  key={p.username}
                  href={`/overlay?s=${p.username}`}
                  className="b-card"
                  style={{ '--card-ink': accent } as React.CSSProperties}
                >
                  <div className="b-card-hero">
                    <span className="b-card-live-pill">
                      <span className="b-card-live-dot" />
                      Live
                    </span>
                    <div className="b-card-avatar">
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar_url} alt="" />
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>
                  </div>
                  <div className="b-card-body">
                    <div className="b-card-name">{p.display_name || p.username}</div>
                    <div className="b-card-handle">@{p.username}</div>
                    {p.bio
                      ? <p className="b-card-bio">{p.bio}</p>
                      : <p className="b-card-bio b-card-bio-empty">No bio yet.</p>
                    }
                  </div>
                  <div className="b-card-foot">
                    <span className="b-card-cta">Book a slot</span>
                    <span className="b-card-arrow">→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <footer className="foot">
        <div className="foot-left">
          <span>© {new Date().getFullYear()} Casi</span>
          <a href="https://github.com/mm88nl-web/casi-app" target="_blank" rel="noopener noreferrer">
            github
          </a>
        </div>
        <div className="foot-right">
          <Link href="/legal/terms">terms</Link>
          <Link href="/legal/privacy">privacy</Link>
          <Link href="/legal/aup">use</Link>
        </div>
      </footer>

      <div className="seal" aria-hidden="true" />

      <style jsx>{`
        .casi-browse {
          --paper: ${P};
          --ink:   ${I};
          --accent: ${A};
          --type:   #221a14;
          --type-2: #6a574b;
          --H: var(--font-casi-display), 'Bricolage Grotesque', system-ui, sans-serif;
          --S: var(--font-casi-serif), 'Instrument Serif', Georgia, serif;
          --M: var(--font-casi-mono), 'JetBrains Mono', ui-monospace, monospace;

          background: var(--paper);
          color: var(--type);
          font-family: var(--H);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow-x: hidden;
        }

        .casi-browse :global(.casi-v9-wordmark) {
          color: var(--type);
          font-family: var(--H);
          font-weight: 800;
          font-size: 28px;
          letter-spacing: -0.035em;
        }
        .casi-browse :global(.casi-v9-wordmark .casi-v9-dot) { color: var(--accent); }
        .casi-browse :global(.casi-v9-mark) { color: var(--ink); width: 60px; height: 30px; }

        /* NAV — identical pattern to landing */
        .top {
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          padding: 32px 40px 0;
        }
        @media (max-width: 640px) { .top { padding: 26px 22px 0; } }
        .mark { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
        .top-r { position: absolute; right: 40px; display: flex; align-items: center; gap: 18px; }
        @media (max-width: 640px) { .top-r { right: 22px; } }
        .stamp {
          font-family: var(--S);
          font-style: italic;
          font-size: 17px;
          color: var(--type-2);
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .stamp::before {
          content: '';
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--accent);
          animation: blink 1.6s ease-out infinite;
        }
        @keyframes blink {
          0%   { box-shadow: 0 0 0 0   rgba(192, 72, 48, 0.55); }
          100% { box-shadow: 0 0 0 7px rgba(192, 72, 48, 0); }
        }
        .stamp .n {
          color: var(--type);
          font-style: normal;
          font-family: var(--H);
          font-weight: 700;
          font-size: 17px;
        }
        .sep { width: 1px; height: 16px; background: rgba(34, 26, 20, 0.18); }
        .login {
          font-family: var(--S);
          font-style: italic;
          font-size: 17px;
          color: var(--type);
          border-bottom: 1.5px solid rgba(34, 26, 20, 0.25);
          padding-bottom: 1px;
          text-decoration: none;
        }
        @media (max-width: 540px) {
          .sep { display: none; }
          .stamp, .stamp .n, .login { font-size: 15px; }
        }

        /* HEAD */
        .b-head {
          padding: 64px 40px 48px;
          border-bottom: 1px solid rgba(34, 26, 20, 0.1);
        }
        @media (max-width: 640px) { .b-head { padding: 40px 22px 36px; } }
        h1 {
          font-family: var(--H);
          font-weight: 700;
          font-variation-settings: 'opsz' 96;
          font-size: clamp(44px, 7vw, 96px);
          line-height: 0.92;
          letter-spacing: -0.04em;
          color: var(--type);
        }
        h1 :global(em) {
          font-family: var(--S);
          font-style: italic;
          font-weight: 400;
          color: var(--accent);
          font-size: 0.95em;
          letter-spacing: -0.015em;
        }

        /* BODY */
        .b-body { flex: 1; padding: 40px 40px 80px; }
        @media (max-width: 640px) { .b-body { padding: 32px 22px 64px; } }
        .b-loading {
          font-family: var(--M);
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--type-2);
          padding: 48px 0;
          text-align: center;
        }
        .b-empty { max-width: 480px; padding: 48px 0; border-top: 1px solid rgba(34, 26, 20, 0.1); }
        .b-empty h2 {
          font-family: var(--H);
          font-weight: 700;
          font-size: clamp(28px, 4vw, 40px);
          letter-spacing: -0.025em;
          color: var(--type);
        }
        .b-empty p { margin-top: 12px; font-size: 15px; color: var(--type-2); }

        /* GRID */
        .b-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 360px));
          gap: 16px;
          justify-content: start;
        }
        @media (max-width: 480px) { .b-grid { grid-template-columns: 1fr; } }

        /* CARD */
        .b-card {
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(34, 26, 20, 0.12);
          background: rgba(255, 255, 255, 0.5);
          text-decoration: none;
          color: inherit;
          transition: transform 0.14s, border-color 0.14s;
          overflow: hidden;
        }
        .b-card:hover { transform: translateY(-2px); border-color: var(--card-ink); }

        .b-card-hero {
          position: relative;
          aspect-ratio: 16 / 9;
          background:
            radial-gradient(
              circle at 30% 30%,
              color-mix(in oklab, var(--card-ink) 50%, transparent),
              color-mix(in oklab, var(--card-ink) 15%, transparent) 70%
            ),
            ${P};
          border-bottom: 1px solid rgba(34, 26, 20, 0.08);
        }
        .b-card-live-pill {
          position: absolute;
          top: 12px; right: 12px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 9px;
          background: rgba(245, 225, 210, 0.92);
          color: var(--type);
          font-family: var(--M);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          border: 1px solid rgba(34, 26, 20, 0.1);
        }
        .b-card-live-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--card-ink);
          animation: livePulse 1.8s ease-in-out infinite;
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
        .b-card-avatar {
          position: absolute;
          left: 18px; bottom: -22px;
          width: 64px; height: 64px;
          background: ${P};
          color: var(--card-ink);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--H);
          font-weight: 800;
          font-size: 28px;
          letter-spacing: -0.04em;
          border: 2px solid ${P};
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(34, 26, 20, 0.14);
        }
        .b-card-avatar :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }

        .b-card-body { padding: 34px 20px 18px; flex: 1; }
        .b-card-name {
          font-family: var(--H);
          font-weight: 700;
          font-size: 20px;
          letter-spacing: -0.02em;
          color: var(--type);
          line-height: 1.15;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .b-card-handle { font-family: var(--M); font-size: 11px; letter-spacing: 0.04em; color: var(--type-2); margin-top: 4px; }
        .b-card-bio {
          font-size: 13px;
          color: var(--type-2);
          margin-top: 14px;
          line-height: 1.5;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .b-card-bio-empty { font-style: italic; opacity: 0.6; }

        .b-card-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 20px;
          border-top: 1px solid rgba(34, 26, 20, 0.08);
          background: rgba(34, 26, 20, 0.03);
          transition: background 0.18s ease;
        }
        .b-card:hover .b-card-foot { background: var(--card-ink); }
        .b-card-cta {
          font-family: var(--M);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--type-2);
          transition: color 0.18s ease;
        }
        .b-card:hover .b-card-cta { color: ${P}; }
        .b-card-arrow {
          font-family: var(--M);
          font-size: 16px;
          color: var(--type-2);
          transition: color 0.18s ease, transform 0.18s ease;
        }
        .b-card:hover .b-card-arrow { color: ${P}; transform: translateX(4px); }

        /* FOOTER */
        .foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 14px;
          padding: 22px 40px 28px;
          font-family: var(--M);
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--type-2);
          border-top: 1px solid rgba(34, 26, 20, 0.1);
        }
        @media (max-width: 640px) { .foot { padding: 18px 22px 24px; } }
        .foot-left, .foot-right { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
        .foot a { text-decoration: none; color: inherit; }

        /* Seal */
        .seal {
          position: fixed;
          right: -120px; bottom: -120px;
          width: 360px; height: 360px;
          border-radius: 50%;
          border: 28px solid ${I};
          opacity: 0.08;
          pointer-events: none;
        }
        @media (max-width: 640px) {
          .seal { width: 220px; height: 220px; border-width: 16px; right: -90px; bottom: -90px; }
        }
      `}</style>
    </main>
  );
}
