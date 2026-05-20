'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { CasiMark } from '@/components/v9/CasiMark';
import { Wordmark } from '@/components/v9/Wordmark';

// Palette constants — edit here to recolor the landing.
// Scoped to .casi-landing so it never bleeds into studio/overlay routes.
const P = '#f5e1d2'; // paper  — salmon
const I = '#294b3c'; // ink    — sage
const A = '#c04830'; // accent — terracotta

export default function HomePage() {
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_live', true);
      if (!cancelled) setLiveCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const showLive = liveCount !== null && liveCount > 0;

  return (
    <main className="casi-landing" data-paper="light">
      <header className="top">
        <Link href="/" className="mark" aria-label="Casi">
          <CasiMark />
          <Wordmark />
        </Link>
        <div className="top-r">
          {showLive && (
            <>
              <div className="stamp">
                <span className="n">{liveCount}</span> live
              </div>
              <span className="sep" aria-hidden="true" />
            </>
          )}
          <Link href="/login" className="login">Log in</Link>
        </div>
      </header>

      <section className="lede">
        <h1>
          Your stream is space <span className="hl">for rent.</span>
        </h1>

        <div className="cta-row">
          {/* Inline styles bypass styled-jsx scoping issues in production */}
          <Link
            href="/studio"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              background: I,
              color: P,
              padding: '15px 28px',
              fontFamily: 'var(--font-casi-display), system-ui, sans-serif',
              fontWeight: 700,
              fontSize: '16px',
              border: `1.5px solid ${I}`,
              textDecoration: 'none',
              letterSpacing: '-0.01em',
            }}
          >
            Create studio <span style={{ fontStyle: 'italic', fontSize: '20px', lineHeight: 1 }}>→</span>
          </Link>
          <Link
            href="/search"
            style={{
              fontFamily: 'var(--font-casi-serif), Georgia, serif',
              fontStyle: 'italic',
              fontSize: '19px',
              color: I,
              textDecoration: 'none',
              borderBottom: `1.5px solid ${I}`,
              paddingBottom: '1px',
              opacity: 0.7,
            }}
          >
            or find streamer
          </Link>
        </div>
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
        .casi-landing {
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
          display: grid;
          grid-template-rows: auto 1fr auto;
          position: relative;
          overflow-x: hidden;
        }

        .casi-landing :global(.casi-v9-wordmark) {
          color: var(--type);
          font-family: var(--H);
          font-weight: 800;
          font-size: 28px;
          letter-spacing: -0.035em;
        }
        .casi-landing :global(.casi-v9-wordmark .casi-v9-dot) {
          color: var(--accent);
        }
        .casi-landing :global(.casi-v9-mark) {
          color: var(--ink);
          width: 60px;
          height: 30px;
        }

        /* NAV */
        .top {
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          padding: 32px 40px 0;
        }
        @media (max-width: 640px) {
          .top { padding: 26px 22px 0; }
        }
        .mark {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
        }
        .top-r {
          position: absolute;
          right: 40px;
          display: flex;
          align-items: center;
          gap: 18px;
        }
        @media (max-width: 640px) {
          .top-r { right: 22px; }
        }

        /* LIVE STAMP */
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
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent);
          animation: blink 1.6s ease-out infinite;
        }
        @keyframes blink {
          0%   { box-shadow: 0 0 0 0   color-mix(in oklab, var(--accent) 55%, transparent); }
          100% { box-shadow: 0 0 0 7px color-mix(in oklab, var(--accent)  0%, transparent); }
        }
        .stamp .n {
          color: var(--type);
          font-style: normal;
          font-family: var(--H);
          font-weight: 700;
          font-size: 17px;
        }
        .sep {
          width: 1px;
          height: 16px;
          background: color-mix(in oklab, var(--type) 22%, transparent);
        }
        .login {
          font-family: var(--S);
          font-style: italic;
          font-size: 17px;
          color: var(--type);
          border-bottom: 1.5px solid color-mix(in oklab, var(--type) 30%, transparent);
          padding-bottom: 1px;
          text-decoration: none;
        }
        @media (max-width: 540px) {
          .sep { display: none; }
          .stamp, .stamp .n, .login { font-size: 15px; }
        }

        /* HERO */
        .lede {
          align-self: center;
          padding: 48px 40px 72px;
          max-width: 1200px;
          width: 100%;
          margin: 0 auto;
        }
        @media (max-width: 640px) {
          .lede { padding: 36px 22px 56px; }
        }

        h1 {
          font-family: var(--H);
          font-weight: 700;
          font-variation-settings: 'opsz' 96;
          font-size: clamp(44px, 8vw, 116px);
          line-height: 0.96;
          letter-spacing: -0.038em;
          color: var(--type);
          text-wrap: balance;
          max-width: 980px;
        }
        h1 .hl {
          background-image: linear-gradient(
            transparent 68%, var(--accent) 68%, var(--accent) 96%, transparent 96%
          );
          background-repeat: no-repeat;
          background-size: 100% 100%;
          padding: 0 8px;
          margin: 0 -4px;
          color: var(--type);
        }

        .cta-row {
          margin-top: 44px;
          display: flex;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
        }
        @media (max-width: 540px) {
          .cta-row { margin-top: 32px; gap: 16px; }
        }

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
        }
        @media (max-width: 640px) {
          .foot { padding: 18px 22px 24px; }
        }
        .foot-left, .foot-right {
          display: flex;
          align-items: center;
          gap: 18px;
          flex-wrap: wrap;
        }
        .foot a {
          text-decoration: none;
          color: inherit;
        }

        /* SEAL — faint ring, pure decoration */
        .seal {
          position: fixed;
          right: -120px;
          bottom: -120px;
          width: 360px;
          height: 360px;
          border-radius: 50%;
          border: 28px solid var(--ink);
          opacity: 0.12;
          pointer-events: none;
        }
        @media (max-width: 640px) {
          .seal { width: 220px; height: 220px; border-width: 16px; right: -90px; bottom: -90px; }
        }
      `}</style>
    </main>
  );
}
