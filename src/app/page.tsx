'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { NavBar, Marquee, Footer, WalletButton } from '@/components/v9';

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

  // Marquee + live indicator copy. Live count is real; the "€48K paid out"
  // stat below is mocked per HANDOFF ("all dollar amounts ... mocked") until
  // a public 30-day payouts aggregate ships.
  const liveLabel = liveCount === null ? '— LIVE NOW' : `${liveCount} LIVE NOW`;
  const marqueeText =
    'NOW LIVE · ' +
    (liveCount ?? '—') +
    ' STREAMERS · 0% CASI CUT · BOOK A SLOT IN 4 SECONDS · ✺ · STRIPE & USDC · APPROVED OR REFUNDED · YOU APPROVE EVERY ONE';

  return (
    <main className="casi-v9-landing">
      <Marquee text={marqueeText} />
      <NavBar liveLabel={liveLabel} right={<WalletButton />} />

      {/* HERO ────────────────────────────────────────────────────────── */}
      <section className="l-hero">
        <div>
          <div className="l-eyebrow">
            <span className="tag">For streamers</span>
            Sell space. Keep 100%.
          </div>
          <h1 className="l-display">
            Your stream
            <br />
            is <em className="ink">real estate.</em>
            <br />
            <span className="underscore">Lease it.</span>
          </h1>
          <p className="l-sub">
            Drop one OBS source. Viewers pay to place clips, images, and banners on your screen —
            by the minute or per flash. You approve every one. Casi takes{' '}
            <b style={{ color: 'var(--ink)' }}>zero</b>.
          </p>
          <div className="l-cta-row">
            <Link href="/studio" className="l-btn">
              Open studio
              <span className="l-arr">→</span>
            </Link>
            <Link href="/search" className="l-btn-ghost">
              Watch a live stream
            </Link>
            <span className="l-cta-note">Free · 2 min setup</span>
          </div>
        </div>

        <div className="l-hero-r">
          <div className="l-stat">
            <div className="l-stat-n">
              €48<sup>K</sup>
            </div>
            <div className="l-stat-l">paid out to streamers · last 30 days</div>
          </div>
          <div className="l-scene" aria-hidden="true">
            <div className="l-scene-bg" />
            <div className="l-scene-tag">
              <span className="l-scene-tag-dot" />
              droptv · live
            </div>
            <div className="l-scene-slot">
              <span className="l-scene-icon">✦</span>
              <span className="l-scene-meta">$5/min · beam</span>
            </div>
            <div className="l-scene-hex" />
            <div className="l-scene-banner">
              <div className="l-scene-ticker">
                ▰ STREAMADS_NL · LOGO PLACEMENT · BEAM 10M · ✺ · SPEEDRUN_PETE · &quot;5:30 PB
                INCOMING&quot; ▰
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MANIFESTO BAND ──────────────────────────────────────────────── */}
      <div className="l-band">
        <div className="l-band-cell">
          <div className="l-band-n">01 ──── revenue</div>
          <div className="l-band-stat">0%</div>
          <div className="l-band-claim">We don&apos;t touch your money.</div>
          <p className="l-band-copy">
            Cards go straight to Stripe. USDC sits in open-source on-chain escrow. Casi is software
            — not a bank.
          </p>
        </div>

        <div className="l-band-cell">
          <div className="l-band-n">02 ──── rails</div>
          <div className="l-band-rails">
            <div className="l-rail">
              <span className="l-rail-ico">€</span>
              <span className="l-rail-name">Cards · Stripe</span>
              <span className="l-rail-note">2.9%</span>
            </div>
            <div className="l-rail">
              <span className="l-rail-ico">◎</span>
              <span className="l-rail-name">USDC · Solana</span>
              <span className="l-rail-note">on-chain</span>
            </div>
            <div className="l-rail l-rail-ghost">
              <span className="l-rail-ico l-rail-ico-ghost">♡</span>
              <span className="l-rail-name l-rail-name-ghost">Free tier</span>
              <span className="l-rail-note">opt-in</span>
            </div>
          </div>
          <div className="l-band-claim">Pay any way.</div>
          <p className="l-band-copy">
            Card or USDC, one booking flow. Free tier for streamers who want to grow first.
          </p>
        </div>

        <div className="l-band-cell">
          <div className="l-band-n">03 ──── protection</div>
          <div className="l-band-flow">
            <div className="l-flow-row ok">
              <span className="l-flow-num">→</span>Approved · 4 seconds avg
            </div>
            <div className="l-flow-row">
              <span className="l-flow-num">→</span>Denied · full refund instantly
            </div>
            <div className="l-flow-row">
              <span className="l-flow-num">→</span>Stopped mid-beam · prorated back
            </div>
          </div>
          <div className="l-band-claim">Tap yes — or money back.</div>
          <p className="l-band-copy">
            Nothing goes live without your approval. Every denial triggers an automatic refund.
          </p>
        </div>
      </div>

      {/* HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="l-how">
        <div className="l-how-hd">
          <h2 className="l-how-title">
            Three surfaces. <em>One source.</em>
            <br />
            Zero spreadsheet.
          </h2>
        </div>
        <div className="l-how-grid">
          <div className="l-how-cell">
            <div className="l-how-n">A · Beams</div>
            <div className="l-how-icon">
              <svg width="100%" height="80" viewBox="0 0 200 80" preserveAspectRatio="xMinYMid meet">
                <rect x="2" y="14" width="80" height="52" fill="none" stroke="var(--ink)" strokeWidth="2" />
                <text x="42" y="46" textAnchor="middle" fill="var(--ink)" fontFamily="var(--S)" fontStyle="italic" fontSize="22">
                  ✦
                </text>
                <rect x="92" y="20" width="40" height="40" fill="var(--ink)" opacity="0.18" />
                <polygon points="150,18 184,18 200,40 184,62 150,62 134,40" fill="none" stroke="var(--ink)" strokeWidth="2" opacity="0.6" />
              </svg>
            </div>
            <h3 className="l-how-h">Time-rented slots</h3>
            <p className="l-how-p">
              Hex, circle, banner, rect, rounded — sized and priced however you like. Viewers pay
              per minute. You approve once.
            </p>
          </div>
          <div className="l-how-cell">
            <div className="l-how-n">B · Flashes</div>
            <div className="l-how-icon">
              <svg width="100%" height="80" viewBox="0 0 200 80" preserveAspectRatio="xMinYMid meet">
                <rect x="14" y="20" width="172" height="14" fill="var(--ink)" opacity="0.85" />
                <rect x="14" y="40" width="120" height="14" fill="var(--ink)" opacity="0.4" />
                <rect x="14" y="60" width="80" height="14" fill="var(--ink)" opacity="0.2" />
              </svg>
            </div>
            <h3 className="l-how-h">15-second pop-ups</h3>
            <p className="l-how-p">
              Like a paid superchat that lives on the stream itself. Text, image, link.
              Auto-expires. Refundable in one tap.
            </p>
          </div>
          <div className="l-how-cell">
            <div className="l-how-n">C · Backdrops</div>
            <div className="l-how-icon">
              <svg width="100%" height="80" viewBox="0 0 200 80" preserveAspectRatio="xMinYMid meet">
                <rect x="2" y="6" width="196" height="68" fill="var(--ink)" opacity="0.12" />
                <rect x="2" y="6" width="196" height="68" fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="4 6" />
                <text x="100" y="46" textAnchor="middle" fill="var(--ink)" fontFamily="var(--M)" fontSize="11" letterSpacing="3">
                  FULL-BLEED
                </text>
              </svg>
            </div>
            <h3 className="l-how-h">Full-bleed sponsor skin</h3>
            <p className="l-how-p">
              Sponsors pay to skin your entire scene background. The most premium surface — usually
              booked weeks ahead.
            </p>
          </div>
        </div>
      </section>

      <Footer />

      <style jsx>{`
        .casi-v9-landing {
          background: var(--paper);
          color: var(--text);
          min-height: 100vh;
        }

        /* HERO */
        .l-hero {
          position: relative;
          padding: 80px var(--pad) 60px;
          border-bottom: 1px solid var(--line);
          display: grid;
          grid-template-columns: 1fr;
          gap: 48px;
          overflow: hidden;
        }
        @media (min-width: 900px) {
          .l-hero {
            grid-template-columns: 1.4fr 1fr;
            align-items: end;
            gap: 56px;
            padding: 88px var(--pad) 72px;
          }
        }
        .l-eyebrow {
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: var(--M);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-3);
          margin-bottom: 28px;
        }
        .l-eyebrow::before {
          content: '';
          display: block;
          width: 24px;
          height: 1px;
          background: var(--ink);
        }
        .l-eyebrow :global(.tag) {
          padding: 3px 9px;
          border: 1px solid var(--ink);
          color: var(--ink);
          font-size: 9.5px;
          letter-spacing: 0.18em;
        }
        .l-display {
          font-family: var(--H);
          font-weight: 800;
          font-size: clamp(64px, 10vw, 168px);
          font-variation-settings: 'opsz' 96;
          line-height: 0.86;
          letter-spacing: -0.045em;
          color: var(--text);
          text-wrap: balance;
        }
        .l-display :global(.ink) {
          color: var(--ink);
          font-style: italic;
          font-family: var(--S);
          font-weight: 400;
          letter-spacing: -0.015em;
          font-size: 0.92em;
          line-height: 0.85;
        }
        .l-display :global(.underscore) {
          border-bottom: 6px solid var(--ink);
          padding-bottom: 0.04em;
        }
        .l-sub {
          margin-top: 32px;
          font-size: 18px;
          line-height: 1.55;
          color: var(--text-2);
          max-width: 520px;
        }
        .l-cta-row {
          margin-top: 40px;
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .l-cta-row :global(.l-btn) {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          padding: 18px 26px;
          background: var(--ink);
          color: var(--on-ink);
          font-family: var(--M);
          font-weight: 700;
          font-size: 12.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          border: 1px solid var(--ink);
          transition: transform 0.14s, filter 0.14s;
        }
        .l-cta-row :global(.l-btn:hover) {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }
        .l-cta-row :global(.l-btn-ghost) {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          padding: 18px 26px;
          background: transparent;
          color: var(--text);
          font-family: var(--M);
          font-weight: 600;
          font-size: 12.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          border: 1px solid var(--line-2);
          transition: border-color 0.14s, color 0.14s;
        }
        .l-cta-row :global(.l-btn-ghost:hover) {
          border-color: var(--ink);
          color: var(--ink);
        }
        .l-arr {
          font-family: var(--M);
          font-size: 14px;
          line-height: 1;
        }
        .l-cta-note {
          font-family: var(--M);
          font-size: 10.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-4);
          margin-left: 4px;
        }

        /* HERO RIGHT */
        .l-hero-r {
          display: flex;
          flex-direction: column;
          gap: 24px;
          align-items: flex-start;
        }
        .l-stat {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding-top: 22px;
          border-top: 1px solid var(--line);
          width: 100%;
        }
        .l-stat-n {
          font-family: var(--H);
          font-weight: 800;
          font-size: clamp(56px, 8vw, 108px);
          font-variation-settings: 'opsz' 96;
          line-height: 0.85;
          letter-spacing: -0.04em;
          color: var(--ink);
          display: flex;
          align-items: flex-start;
          gap: 6px;
        }
        .l-stat-n sup {
          font-size: 0.4em;
          color: var(--text-3);
          margin-top: 0.6em;
          font-weight: 600;
        }
        .l-stat-l {
          font-family: var(--M);
          font-size: 10.5px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-3);
        }

        /* SCENE PREVIEW */
        .l-scene {
          width: 100%;
          aspect-ratio: 16 / 9;
          position: relative;
          background: var(--paper);
          border: 1px solid var(--ink-22);
          overflow: hidden;
        }
        .l-scene::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: repeating-linear-gradient(
            0deg,
            transparent 0 1px,
            color-mix(in oklab, var(--paper) 90%, black) 1px 2px
          );
          opacity: 0.4;
        }
        .l-scene-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 60% 50% at 30% 40%, var(--ink-08) 0%, transparent 70%),
            linear-gradient(160deg, var(--ink-04), var(--paper) 70%);
        }
        .l-scene-slot {
          position: absolute;
          left: 5%;
          top: 8%;
          width: 34%;
          height: 50%;
          z-index: 2;
          border: 2px solid var(--ink);
          background: var(--ink-08);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          animation: scenePulse 2.6s ease-in-out infinite;
        }
        @keyframes scenePulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 var(--ink-22), inset 0 0 0 0 var(--ink-08);
          }
          50% {
            box-shadow: 0 0 24px var(--ink-22), inset 0 0 24px var(--ink-08);
          }
        }
        .l-scene-slot::after {
          content: 'LIVE';
          position: absolute;
          top: 6px;
          right: 6px;
          background: var(--ink);
          color: var(--on-ink);
          font-family: var(--M);
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.18em;
          padding: 2px 6px;
        }
        .l-scene-icon {
          font-family: var(--S);
          font-size: 36px;
          color: var(--ink);
          font-style: italic;
        }
        .l-scene-meta {
          font-family: var(--M);
          font-size: 9px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--ink-70);
        }
        .l-scene-hex {
          position: absolute;
          right: 7%;
          top: 11%;
          width: 22%;
          aspect-ratio: 1;
          z-index: 2;
          clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
          background: var(--ink-04);
          outline: 2px solid var(--ink-22);
          outline-offset: -2px;
        }
        .l-scene-banner {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 11%;
          z-index: 3;
          background: var(--ink-08);
          border-top: 1px solid var(--ink-22);
          display: flex;
          align-items: center;
          overflow: hidden;
        }
        .l-scene-ticker {
          white-space: nowrap;
          padding-left: 100%;
          font-family: var(--M);
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.12em;
          color: var(--ink-70);
          animation: sceneScroll 16s linear infinite;
        }
        @keyframes sceneScroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-100%);
          }
        }
        .l-scene-tag {
          position: absolute;
          top: 14px;
          left: 14px;
          z-index: 4;
          font-family: var(--M);
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-3);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .l-scene-tag-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--ink);
        }

        /* MANIFESTO BAND */
        .l-band {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0;
          border-bottom: 1px solid var(--line);
        }
        @media (min-width: 760px) {
          .l-band {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        .l-band-cell {
          padding: 48px 36px 56px;
          border-right: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          gap: 18px;
          position: relative;
          overflow: hidden;
        }
        .l-band-cell:last-child {
          border-right: none;
        }
        @media (max-width: 760px) {
          .l-band-cell {
            border-right: none;
            border-bottom: 1px solid var(--line);
          }
        }
        .l-band-n {
          font-family: var(--M);
          font-size: 10.5px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-4);
        }
        .l-band-stat {
          font-family: var(--H);
          font-weight: 800;
          font-variation-settings: 'opsz' 96;
          font-size: clamp(72px, 9vw, 128px);
          line-height: 0.85;
          letter-spacing: -0.045em;
          color: var(--ink);
        }
        .l-band-claim {
          font-family: var(--H);
          font-weight: 700;
          font-size: 22px;
          letter-spacing: -0.02em;
          line-height: 1.15;
          color: var(--text);
        }
        .l-band-copy {
          font-size: 14.5px;
          line-height: 1.6;
          color: var(--text-2);
          max-width: 340px;
        }
        .l-band-rails {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .l-rail {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: var(--surf);
          border: 1px solid var(--line);
        }
        .l-rail-ghost {
          background: transparent;
          border-color: var(--line);
        }
        .l-rail-ico {
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--M);
          font-size: 13px;
          font-weight: 600;
          background: var(--ink);
          color: var(--on-ink);
        }
        .l-rail-ico-ghost {
          background: transparent;
          color: var(--text-3);
          border: 1px solid var(--line);
        }
        .l-rail-name {
          font-size: 13.5px;
          font-weight: 600;
          flex: 1;
          color: var(--text);
        }
        .l-rail-name-ghost {
          color: var(--text-3);
        }
        .l-rail-note {
          font-family: var(--M);
          font-size: 10px;
          color: var(--text-4);
          letter-spacing: 0.06em;
        }
        .l-band-flow {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .l-flow-row {
          display: flex;
          align-items: center;
          gap: 11px;
          font-size: 13.5px;
          color: var(--text-2);
        }
        .l-flow-num {
          font-family: var(--M);
          font-size: 11px;
          color: var(--ink);
          font-weight: 700;
          width: 22px;
          flex-shrink: 0;
        }
        .l-flow-row.ok {
          color: var(--text);
        }
        .l-flow-row.ok .l-flow-num {
          color: var(--ink);
        }

        /* HOW IT WORKS */
        .l-how {
          padding: 80px var(--pad);
          border-bottom: 1px solid var(--line);
        }
        .l-how-hd {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 24px;
          margin-bottom: 48px;
        }
        .l-how-title {
          font-family: var(--H);
          font-weight: 800;
          font-variation-settings: 'opsz' 64;
          font-size: clamp(40px, 5vw, 72px);
          line-height: 0.95;
          letter-spacing: -0.035em;
          max-width: 760px;
          color: var(--text);
        }
        .l-how-title :global(em) {
          font-family: var(--S);
          font-style: italic;
          font-weight: 400;
          color: var(--ink);
          font-size: 1em;
          letter-spacing: -0.01em;
        }
        .l-how-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0;
          border: 1px solid var(--line);
        }
        @media (min-width: 760px) {
          .l-how-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        .l-how-cell {
          padding: 32px 28px;
          border-right: 1px solid var(--line);
          position: relative;
        }
        .l-how-cell:last-child {
          border-right: none;
        }
        @media (max-width: 760px) {
          .l-how-cell {
            border-right: none;
            border-bottom: 1px solid var(--line);
          }
        }
        .l-how-n {
          font-family: var(--M);
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink);
          font-weight: 600;
          margin-bottom: 18px;
        }
        .l-how-icon {
          height: 96px;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          margin-bottom: 14px;
        }
        .l-how-h {
          font-family: var(--H);
          font-weight: 700;
          font-size: 24px;
          letter-spacing: -0.02em;
          color: var(--text);
          margin-bottom: 10px;
        }
        .l-how-p {
          font-size: 14px;
          line-height: 1.6;
          color: var(--text-2);
          max-width: 320px;
        }
      `}</style>
    </main>
  );
}
