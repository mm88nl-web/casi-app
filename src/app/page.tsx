'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { CasiMark } from '@/components/v9/CasiMark';
import { Wordmark } from '@/components/v9/Wordmark';

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
              background: 'var(--ink)',
              color: 'var(--paper)',
              padding: '15px 28px',
              fontFamily: 'var(--H)',
              fontWeight: 700,
              fontSize: '16px',
              border: '1.5px solid var(--ink)',
              borderRadius: 'var(--radius-pill)',
              textDecoration: 'none',
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
            }}
          >
            Create studio{' '}
            <span style={{ fontFamily: 'var(--S)', fontStyle: 'italic', fontSize: '20px', lineHeight: 1 }}>→</span>
          </Link>
          <Link
            href="/search"
            style={{
              fontFamily: 'var(--S)',
              fontStyle: 'italic',
              fontSize: '19px',
              color: 'var(--ink)',
              textDecoration: 'none',
              borderBottom: '1.5px solid color-mix(in oklab, var(--ink) 35%, transparent)',
              paddingBottom: '1px',
              opacity: 0.78,
              whiteSpace: 'nowrap',
            }}
          >
            find a streamer
          </Link>
        </div>

        <figure className="demo">
          <video
            src="/casi-demo.mp4"
            poster="/casi-demo-poster.jpg"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-label="Demo: a viewer's paid beam appears on a live stream"
          />
          <figcaption>a viewer’s beam, live on stream</figcaption>
        </figure>
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
          <span className="foot-copy">
            <CasiMark width={22} height={11} className="foot-mark" />
            © {new Date().getFullYear()} Casi
          </span>
          <a href="https://github.com/mm88nl-web/casi-app" target="_blank" rel="noopener noreferrer">
            github
          </a>
        </div>
        <div className="foot-mid">
          <Link href="/solitaire">solitaire</Link>
          <Link href="/words">word gen</Link>
        </div>
        <div className="foot-right">
          <Link href="/legal/terms">terms</Link>
          <Link href="/legal/privacy">privacy</Link>
          <Link href="/legal/aup">use</Link>
        </div>
      </footer>

      <style jsx global>{`
        /* While the landing page is mounted, override the body/html background
           so the dark default from globals.css doesn't flash during navigation.
           --chrome-paper (not --paper) — landing is app chrome, not a
           per-streamer skin surface, and --paper is a live root mutated by
           SkinProvider / the anti-FOUC script / dev tools for whichever skin
           is currently active. --chrome-paper is never touched by any of
           those, so this can't bleed a streamer's (or a stray dev-tool)
           skin onto the public marketing page. */
        html, body { background: var(--chrome-paper); }
      `}</style>
      <style jsx>{`
        .casi-landing {
          /* Pin the whole subtree to Casi's fixed brand identity, not the
             mutable --ink/--paper roots — see --chrome-* in globals.css. */
          --paper:   var(--chrome-paper);
          --ink:     var(--chrome-ink);
          --accent:  var(--chrome-accent);
          --text:    var(--chrome-text);
          --text-2:  var(--chrome-text-2);

          background: var(--paper);
          color: var(--text);
          font-family: var(--H);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          overflow-x: hidden;
        }

        .casi-landing :global(.casi-v9-wordmark) {
          color: var(--text);
          font-family: var(--H);
          font-weight: 800;
          font-size: 149px;
          letter-spacing: -0.05em;
          line-height: 0.85;
          font-stretch: 108%;
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
          color: var(--text-2);
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
        .stamp .n { color: var(--text); font-style: normal; font-family: var(--H); font-weight: 700; font-size: 17px; }
        .sep { width: 1px; height: 16px; background: color-mix(in oklab, var(--text) 22%, transparent); }
        .login {
          font-family: var(--S);
          font-style: italic;
          font-size: 17px;
          color: var(--text);
          border-bottom: 1.5px solid color-mix(in oklab, var(--text) 30%, transparent);
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
          color: var(--text);
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

        .demo {
          margin: 40px auto 0;
          width: 100%;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 11px;
        }
        .demo video {
          width: 100%;
          aspect-ratio: 16 / 9;
          object-fit: cover;
          display: block;
          border-radius: var(--radius-card);
          border: 1px solid color-mix(in oklab, var(--ink) 16%, transparent);
          box-shadow: 0 22px 60px -24px color-mix(in oklab, var(--ink) 50%, transparent);
          background: var(--ink);
        }
        .demo figcaption {
          font-family: var(--S);
          font-style: italic;
          font-size: 15px;
          color: var(--text-2);
        }
        @media (max-width: 600px) {
          .demo { margin-top: 30px; }
          .demo figcaption { font-size: 13.5px; }
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
          color: var(--text-2);
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
          color: var(--text-2);
          border-top: 1px solid color-mix(in oklab, var(--text) 10%, transparent);
        }
        @media (max-width: 640px) { .foot { padding: 16px 22px 24px; } }
        .foot-left, .foot-mid, .foot-right { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
        .foot a { text-decoration: none; color: inherit; }
        .foot-copy { display: inline-flex; align-items: center; gap: 8px; }
        .foot-copy :global(.foot-mark) { color: var(--text); opacity: 0.55; flex-shrink: 0; }
      `}</style>
    </main>
  );
}
