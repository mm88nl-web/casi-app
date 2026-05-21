'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { CasiMark } from '@/components/v9/CasiMark';
import { Wordmark } from '@/components/v9/Wordmark';

const P = '#f5e1d2';
const I = '#294b3c';
const A = '#c04830';

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
        <Link href="/" className="hero-mark" aria-label="Casi">
          <CasiMark />
          <Wordmark />
        </Link>

        <p className="tagline">
          Get on a <em>live stream.</em>
        </p>

        <div className="cta-row">
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
              borderRadius: '999px',
              textDecoration: 'none',
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
            }}
          >
            Create studio{' '}
            <span style={{ fontFamily: 'var(--font-casi-serif), Georgia, serif', fontStyle: 'italic', fontSize: '20px', lineHeight: 1 }}>→</span>
          </Link>
          <Link
            href="/search"
            style={{
              fontFamily: 'var(--font-casi-serif), Georgia, serif',
              fontStyle: 'italic',
              fontSize: '19px',
              color: I,
              textDecoration: 'none',
              borderBottom: `1.5px solid rgba(41,75,60,0.35)`,
              paddingBottom: '1px',
              opacity: 0.78,
              whiteSpace: 'nowrap',
            }}
          >
            find a streamer
          </Link>
        </div>
      </section>

      <div className="foot-strip">
        <span>free or paid</span>
        <span className="pip" aria-hidden="true" />
        <span>approval gated</span>
        <span className="pip" aria-hidden="true" />
        <span>solana · stripe</span>
      </div>

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
          display: flex;
          flex-direction: column;
          overflow-x: hidden;
        }

        .casi-landing :global(.casi-v9-wordmark) {
          color: var(--type);
          font-family: var(--H);
          font-weight: 800;
          font-size: 149px;
          letter-spacing: -0.045em;
          line-height: 0.85;
          font-variation-settings: 'opsz' 96;
        }
        .casi-landing :global(.casi-v9-wordmark .casi-v9-dot) { color: var(--accent); }
        .casi-landing :global(.casi-v9-mark) {
          color: var(--ink);
          width: 345px;
          height: 172px;
          margin-bottom: -18px;
        }
        @media (max-width: 900px) {
          .casi-landing :global(.casi-v9-wordmark) { font-size: 110px; }
          .casi-landing :global(.casi-v9-mark) { width: 260px; height: 130px; }
        }
        @media (max-width: 600px) {
          .casi-landing :global(.casi-v9-wordmark) { font-size: 72px; }
          .casi-landing :global(.casi-v9-mark) { width: 172px; height: 86px; }
        }

        .top {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 28px 40px 0;
          flex-shrink: 0;
        }
        @media (max-width: 640px) { .top { padding: 22px 22px 0; } }
        .top-r { display: flex; align-items: center; gap: 18px; }

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
          0%   { box-shadow: 0 0 0 0   color-mix(in oklab, var(--accent) 55%, transparent); }
          100% { box-shadow: 0 0 0 9px color-mix(in oklab, var(--accent)  0%, transparent); }
        }
        .stamp .n { color: var(--type); font-style: normal; font-family: var(--H); font-weight: 700; font-size: 17px; }
        .sep { width: 1px; height: 16px; background: color-mix(in oklab, var(--type) 22%, transparent); }
        .login {
          font-family: var(--S);
          font-style: italic;
          font-size: 17px;
          color: var(--type);
          border-bottom: 1.5px solid color-mix(in oklab, var(--type) 30%, transparent);
          padding-bottom: 1px;
          text-decoration: none;
          white-space: nowrap;
        }
        @media (max-width: 540px) {
          .sep { display: none; }
          .stamp, .stamp .n, .login { font-size: 15px; }
        }

        .lede {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 40px 80px;
          text-align: center;
        }
        .hero-mark {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-decoration: none;
        }

        .tagline {
          font-family: var(--H);
          font-weight: 500;
          font-size: 30px;
          letter-spacing: -0.022em;
          color: var(--type);
          line-height: 1.18;
          margin: 30px 0 38px;
          max-width: 680px;
        }
        .tagline :global(em) {
          font-family: var(--S);
          font-style: italic;
          font-weight: 400;
          color: var(--ink);
        }
        @media (max-width: 600px) { .tagline { font-size: 22px; margin: 22px 0 28px; } }

        .cta-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 22px;
          flex-wrap: wrap;
        }

        .foot-strip {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          font-family: var(--M);
          font-size: 10.5px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--type-2);
          padding: 0 40px 32px;
          white-space: nowrap;
          flex-wrap: wrap;
        }
        .pip {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--ink);
          opacity: 0.7;
          display: inline-block;
        }
        @media (max-width: 480px) { .foot-strip { font-size: 9.5px; gap: 10px; } }

        .foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 14px;
          padding: 16px 40px 28px;
          font-family: var(--M);
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--type-2);
          border-top: 1px solid color-mix(in oklab, var(--type) 10%, transparent);
        }
        @media (max-width: 640px) { .foot { padding: 16px 22px 24px; } }
        .foot-left, .foot-right { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
        .foot a { text-decoration: none; color: inherit; }
      `}</style>
    </main>
  );
}
