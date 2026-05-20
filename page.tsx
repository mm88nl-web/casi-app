'use client';

// ─────────────────────────────────────────────────────────────────────────
// Landing — "Apothecary" treatment
// ─────────────────────────────────────────────────────────────────────────
// Stripped to nav + headline + sentence + 2 CTAs + footer. No marquee
// (read as a scam by an early reviewer), no scene mockup, no manifesto
// band, no how-it-works grid. The page hard-pins its own three-color
// palette (salmon paper · sage ink · terracotta accent) so it always
// looks the same regardless of the visitor's selected skin — this is
// the marketing surface, not their studio. To recolor the landing,
// edit the three values in :root inside the <style jsx> block below.
//
// Real liveCount still comes from the profiles.is_live query. We render
// "12 live" only when count > 0; otherwise the live stamp hides and the
// Log in link sits alone on the right — no fake number.
// ─────────────────────────────────────────────────────────────────────────

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
    return () => {
      cancelled = true;
    };
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
          {showLive ? (
            <>
              <div className="stamp">
                <span className="n">{liveCount}</span> live
              </div>
              <span className="sep" aria-hidden="true"></span>
            </>
          ) : null}
          <Link href="/login" className="login">
            Log in
          </Link>
        </div>
      </header>

      <section className="lede">
        <h1>
          Your stream is space <span className="hl">for rent.</span>
        </h1>
        <div className="orbit">
          <span className="orbit-dots" aria-hidden="true">
            <span>◯</span>
            <span>●</span>
            <span>◯</span>
          </span>
          <p>
            Viewers pay for a spot on screen. Clip, banner, anything.{' '}
            <span className="muted">You decide what airs. Casi takes nothing.</span>
          </p>
        </div>
        <div className="cta-row">
          <Link href="/studio" className="cta">
            Create studio <span className="arrow">→</span>
          </Link>
          <Link href="/search" className="alt-link">
            or find streamer
          </Link>
        </div>
      </section>

      <footer className="foot">
        <div className="foot-left">
          <span>© {new Date().getFullYear()} Casi</span>
          <a
            href="https://github.com/mm88nl-web/casi-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            github
          </a>
        </div>
        <div className="foot-right">
          <Link href="/legal/terms">terms</Link>
          <Link href="/legal/privacy">privacy</Link>
          <Link href="/legal/aup">use</Link>
        </div>
      </footer>

      <div className="seal" aria-hidden="true"></div>

      <style jsx>{`
        /* Landing-scoped palette override. These three values cascade
           through globals.css's color-mix ladder (--text, --line,
           --surf, etc.) without us re-declaring each one. The skin
           Provider doesn't touch this scope because we wrap the whole
           page in .casi-landing rather than the body root. */
        .casi-landing {
          --paper: #f5e1d2;
          --ink: #294b3c;
          --accent: #c04830;

          --type: #221a14;
          --type-2: #6a574b;

          --H: var(--font-casi-display), 'Bricolage Grotesque', system-ui, sans-serif;
          --S: var(--font-casi-serif), 'Instrument Serif', Georgia, serif;
          --M: var(--font-casi-mono), 'JetBrains Mono', ui-monospace, monospace;

          background: var(--paper);
          color: var(--type);
          font-family: var(--H);
          font-size: 16px;
          line-height: 1.5;
          min-height: 100vh;
          display: grid;
          grid-template-rows: auto 1fr auto;
          position: relative;
          overflow-x: hidden;
        }
        /* Recolor the v9 Wordmark to land on the salmon paper, and turn
           its dot terracotta so it ties to the headline highlight + the
           live pulse. The shared v9 mark inherits color via currentColor
           so wrapping it in .mark { color: var(--ink); } is enough. */
        .casi-landing :global(.casi-v9-wordmark) {
          color: var(--type);
          font-family: var(--H);
          font-weight: 800;
          font-size: 22px;
          letter-spacing: -0.035em;
        }
        .casi-landing :global(.casi-v9-wordmark .casi-v9-dot) {
          color: var(--accent);
        }
        .casi-landing :global(.casi-v9-mark) {
          color: var(--ink);
          width: 48px;
          height: 24px;
        }

        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 28px 40px 0;
        }
        @media (max-width: 640px) {
          .top {
            padding: 22px 22px 0;
          }
        }
        .mark {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .top-r {
          display: flex;
          align-items: center;
          gap: 18px;
        }
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
          0% {
            box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 55%, transparent);
          }
          100% {
            box-shadow: 0 0 0 7px color-mix(in oklab, var(--accent) 0%, transparent);
          }
        }
        .stamp .n {
          color: var(--type);
          font-style: normal;
          font-family: var(--H);
          font-weight: 700;
          font-size: 17px;
          margin-right: 2px;
        }
        .top-r .sep {
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
          transition: color 0.14s, border-color 0.14s;
          text-decoration: none;
        }
        .login:hover {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }
        @media (max-width: 540px) {
          .top-r .sep {
            display: none;
          }
          .stamp {
            font-size: 15px;
          }
          .stamp .n {
            font-size: 15px;
          }
          .login {
            font-size: 15px;
          }
        }

        .lede {
          align-self: center;
          padding: 56px 40px 80px;
          max-width: 1200px;
          width: 100%;
          margin: 0 auto;
        }
        @media (max-width: 640px) {
          .lede {
            padding: 40px 22px 56px;
          }
        }
        .lede > * {
          max-width: 980px;
        }

        h1 {
          font-family: var(--H);
          font-weight: 700;
          font-variation-settings: 'opsz' 96;
          /* clamp min lowered to 44px so 'for rent.' fits a 375px viewport
             without the highlight bar overflowing horizontally. */
          font-size: clamp(44px, 8vw, 116px);
          line-height: 0.96;
          letter-spacing: -0.038em;
          color: var(--type);
          text-wrap: balance;
        }
        h1 .hl {
          /* horizontal terracotta bar sits behind the descender line, like
             a printed highlighter swipe. background-clip: padding-box keeps
             the swipe inset from the line-box so it doesn't tile when the
             headline wraps. */
          background-image: linear-gradient(
            transparent 68%,
            var(--accent) 68%,
            var(--accent) 96%,
            transparent 96%
          );
          background-repeat: no-repeat;
          background-size: 100% 100%;
          padding: 0 8px;
          margin: 0 -4px;
          color: var(--type);
        }

        .orbit {
          margin: 36px 0 0;
          display: flex;
          align-items: center;
          gap: 14px;
          max-width: 580px;
        }
        .orbit-dots {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--ink);
          font-family: var(--S);
          font-style: italic;
          font-size: 24px;
          line-height: 1;
        }
        .orbit-dots span:nth-child(2) {
          color: var(--accent);
        }
        .orbit p {
          font-size: 18px;
          color: var(--type);
          line-height: 1.5;
        }
        .orbit p .muted {
          color: var(--type-2);
        }

        .cta-row {
          margin-top: 40px;
          display: flex;
          align-items: center;
          gap: 22px;
          flex-wrap: wrap;
        }
        .cta {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          background: var(--ink);
          color: var(--paper);
          padding: 16px 28px;
          font-family: var(--H);
          font-weight: 600;
          font-size: 16px;
          border: 1.5px solid var(--ink);
          transition: filter 0.14s, transform 0.14s;
          text-decoration: none;
        }
        .cta:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }
        .cta .arrow {
          font-family: var(--S);
          font-style: italic;
          font-size: 22px;
          line-height: 1;
        }
        .alt-link {
          font-family: var(--S);
          font-style: italic;
          font-size: 19px;
          color: var(--type-2);
          border-bottom: 1.5px solid color-mix(in oklab, var(--type) 30%, transparent);
          padding-bottom: 1px;
          transition: color 0.14s, border-color 0.14s;
          text-decoration: none;
        }
        .alt-link:hover {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }

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
          .foot {
            padding: 18px 22px 24px;
          }
        }
        .foot-left,
        .foot-right {
          display: flex;
          align-items: center;
          gap: 18px;
          flex-wrap: wrap;
        }
        .foot a {
          text-decoration: none;
          color: inherit;
          transition: color 0.14s;
        }
        .foot a:hover {
          color: var(--accent);
        }

        /* Faint sage ring in the bottom-right corner — wax-seal mark.
           Pure decoration; pointer-events disabled so it doesn't eat
           clicks on the footer links. */
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
          .seal {
            width: 220px;
            height: 220px;
            border-width: 16px;
            right: -90px;
            bottom: -90px;
          }
        }
      `}</style>
    </main>
  );
}
