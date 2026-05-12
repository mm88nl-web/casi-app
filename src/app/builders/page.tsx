'use client';

import Link from 'next/link';
import { NavBar, Marquee, Footer } from '@/components/v9';

/**
 * /builders — the primitive story.
 *
 * Separated from / (which sells the consumer product to streamers) because
 * the audiences are different: a Solana developer evaluating the escrow
 * program as a reusable building block doesn't care about pricing UIs or
 * OBS scenes, and a streamer landing on /builders shouldn't get an Anchor
 * lecture. Same v9 chrome, different surface area.
 *
 * Page architecture mirrors / for visual rhythm: hero + 3-cell manifesto
 * band + 3-cell deep dive + footer. Trust signals match the landing
 * exactly so a visitor flipping between / and /builders reads consistent
 * stage-honesty (devnet, audit-pending).
 */
export default function BuildersPage() {
  const marqueeText =
    'CASI-ESCROW · TIME-VESTED USDC ON SOLANA · APACHE 2.0 · DEVNET · AUDIT IN SCOPING · ✺ · ON GITHUB · FORK + INTEGRATE · ✺';

  return (
    <main className="casi-v9-landing">
      <Marquee text={marqueeText} />
      <NavBar />

      {/* HERO */}
      <section className="b-hero">
        <div className="b-hero-l">
          <div className="b-eyebrow">
            <span className="b-tag">For builders</span>
            Open primitive.
          </div>
          <h1 className="b-display">
            Time-vested
            <br />
            <em className="ink">USDC escrow</em>
            <br />
            <span className="underscore">on Solana.</span>
          </h1>
          <p className="b-sub">
            <code className="b-code">casi-escrow</code> is an Anchor program that locks USDC in a
            PDA vault and vests it linearly over a configured duration. Pro-rata settle on early
            end, full refund on cancel, permissionless crank after timeout. Apache 2.0. Fork it.
          </p>
          <div className="b-cta-row">
            <a
              href="https://github.com/mm88nl-web/casi-app"
              target="_blank"
              rel="noopener noreferrer"
              className="b-btn"
            >
              View on GitHub
              <span className="b-arr">↗</span>
            </a>
            <Link href="/" className="b-btn-ghost">
              See it in production
            </Link>
            <span className="b-cta-note">Apache 2.0 · ~1.2k LOC Rust</span>
          </div>

          <ul className="b-trust">
            <li className="b-trust-item">
              <span className="b-trust-glyph">{'{ }'}</span>
              <span>Single-file Anchor program · 4 user-facing instructions</span>
            </li>
            <li className="b-trust-item">
              <span className="b-trust-glyph">◉</span>
              <span>Session-key delegation built in · no popup per action</span>
            </li>
            <li className="b-trust-item">
              <span className="b-trust-glyph">⌖</span>
              <span>External audit in scoping · permissionless liveness backstops live today</span>
            </li>
          </ul>
        </div>

        <div className="b-hero-r">
          <div className="b-codeblock">
            <div className="b-codeblock-bar">
              <span className="b-codeblock-dot" style={{ background: '#FF5C2E' }} />
              <span className="b-codeblock-dot" style={{ background: '#F0AC00' }} />
              <span className="b-codeblock-dot" style={{ background: 'var(--ink)' }} />
              <span className="b-codeblock-name">casi-escrow / lib.rs</span>
            </div>
            <pre className="b-codeblock-code">
              <code>
                <span className="b-kw">pub fn</span>{' '}
                <span className="b-fn">initialize_beam</span>(
                <br />
                {'  '}ctx: Context&lt;InitializeBeam&gt;,
                <br />
                {'  '}escrow_id: [u8; 32],
                <br />
                {'  '}amount: u64,
                <br />
                {'  '}duration_secs: u64,
                <br />)
                <br />
                <br />
                <span className="b-kw">pub fn</span>{' '}
                <span className="b-fn">start_beam</span>(ctx)
                <br />
                <span className="b-kw">pub fn</span>{' '}
                <span className="b-fn">settle_beam</span>(ctx)
                <br />
                <span className="b-kw">pub fn</span>{' '}
                <span className="b-fn">cancel_escrow</span>(ctx)
                <br />
                <br />
                <span className="b-cm">// + 4 session-key delegated twins</span>
                <br />
                <span className="b-cm">// + cancel_stale_pending crank</span>
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* MANIFESTO BAND */}
      <div className="b-band">
        <div className="b-band-cell">
          <div className="b-band-n">01 ──── design</div>
          <div className="b-band-stat">4</div>
          <div className="b-band-claim">Instructions, not a framework.</div>
          <p className="b-band-copy">
            initialize → start → settle → cancel. That&apos;s the entire user-facing surface. No
            admin keys, no global config, no upgrade authority hidden behind a multisig. Each
            escrow is independent and self-contained.
          </p>
        </div>

        <div className="b-band-cell">
          <div className="b-band-n">02 ──── trust</div>
          <div className="b-band-rails">
            <div className="b-rail">
              <span className="b-rail-ico">⌬</span>
              <span className="b-rail-name">No admin keys</span>
            </div>
            <div className="b-rail">
              <span className="b-rail-ico">⏱</span>
              <span className="b-rail-name">Crank after 7-day timeout</span>
            </div>
            <div className="b-rail">
              <span className="b-rail-ico">↻</span>
              <span className="b-rail-name">Refund path always open</span>
            </div>
          </div>
          <div className="b-band-claim">Liveness without trust.</div>
          <p className="b-band-copy">
            Funds can&apos;t get stuck. Permissionless cranks let anyone resolve abandoned
            escrows after the configured timeout. No central party required.
          </p>
        </div>

        <div className="b-band-cell">
          <div className="b-band-n">03 ──── delegation</div>
          <div className="b-band-flow">
            <div className="b-flow-row ok">
              <span className="b-flow-num">→</span>set_delegate · once per session
            </div>
            <div className="b-flow-row">
              <span className="b-flow-num">→</span>start_beam_delegated · no popup
            </div>
            <div className="b-flow-row">
              <span className="b-flow-num">→</span>revoke_delegate · instant
            </div>
          </div>
          <div className="b-band-claim">Scoped session keys.</div>
          <p className="b-band-copy">
            A pre-registered session key can call the four delegated instruction twins, and
            nothing else. Compromise gives at most an early settle at the current vested point,
            never a fund withdrawal outside the declared destinations.
          </p>
        </div>
      </div>

      {/* USE CASES */}
      <section className="b-how">
        <div className="b-how-hd">
          <h2 className="b-how-title">
            Beyond streamers. <em>Any time-bounded service.</em>
          </h2>
        </div>
        <div className="b-how-grid">
          <div className="b-how-cell">
            <div className="b-how-n">A · Streaming</div>
            <h3 className="b-how-h">Paid on-stream overlays</h3>
            <p className="b-how-p">
              The reference integration. Viewers fund an escrow per-booking; vesting clock starts
              when the streamer approves; pro-rata refund on early end. Lives at{' '}
              <Link href="/" className="b-how-link">
                casi.gg
              </Link>
              .
            </p>
          </div>
          <div className="b-how-cell">
            <div className="b-how-n">B · Coaching</div>
            <h3 className="b-how-h">Paid 1:1 sessions</h3>
            <p className="b-how-p">
              Client funds upfront; coach starts the meeting; if the call ends early the unvested
              portion auto-refunds. No platform fee, no chargeback risk. Open for forking.
            </p>
          </div>
          <div className="b-how-cell">
            <div className="b-how-n">C · Subscriptions</div>
            <h3 className="b-how-h">Pay-per-minute services</h3>
            <p className="b-how-p">
              Any service where the user pays for duration rather than a fixed deliverable.
              Pause + resume require an additional state machine, but the vesting math is the
              same.
            </p>
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section className="b-roadmap">
        <h2 className="b-roadmap-title">
          Roadmap <em className="ink">· building in the open</em>
        </h2>
        <ol className="b-roadmap-list">
          <li className="b-roadmap-item b-roadmap-done">
            <span className="b-roadmap-tick">✓</span>
            <span className="b-roadmap-text">
              <b>Anchor program feature-complete.</b> 4 user-facing instructions, 4 delegated
              twins, permissionless stale-pending crank, comprehensive integration tests.
            </span>
          </li>
          <li className="b-roadmap-item b-roadmap-done">
            <span className="b-roadmap-tick">✓</span>
            <span className="b-roadmap-text">
              <b>Reference integration live on devnet.</b> The casi.gg consumer product proves
              the primitive at every stage of the booking lifecycle.
            </span>
          </li>
          <li className="b-roadmap-item">
            <span className="b-roadmap-tick">○</span>
            <span className="b-roadmap-text">
              <b>External audit + remediation.</b> Quotes scoped with Sec3 / OtterSec / Neodyme.
              ~$22-25k including a remediation contractor.
            </span>
          </li>
          <li className="b-roadmap-item">
            <span className="b-roadmap-tick">○</span>
            <span className="b-roadmap-text">
              <b>npm package <code className="b-code-inline">@casi/escrow-sdk</code>.</b> Typed
              client wrapper for the IDL, drop-in for any Next.js / React / Node project. Tutorial
              + cookbook recipes for the use cases above.
            </span>
          </li>
          <li className="b-roadmap-item">
            <span className="b-roadmap-tick">○</span>
            <span className="b-roadmap-text">
              <b>Mainnet: capped launch first.</b> Per-booking + per-streamer caps live in the
              application layer so the audited program can be deployed without re-audit when the
              caps relax post-PMF.
            </span>
          </li>
        </ol>
      </section>

      <Footer />

      <style jsx>{`
        :global(.casi-v9-landing) {
          background: var(--paper);
          color: var(--text);
          min-height: 100vh;
        }

        /* HERO */
        .b-hero {
          padding: 72px var(--pad) 56px;
          border-bottom: 1px solid var(--line);
          display: grid;
          grid-template-columns: 1fr;
          gap: 48px;
        }
        @media (min-width: 900px) {
          .b-hero {
            grid-template-columns: 1.3fr 1fr;
            align-items: end;
            gap: 56px;
          }
        }
        .b-eyebrow {
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: var(--M);
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-3);
          margin-bottom: 28px;
        }
        .b-eyebrow::before {
          content: '';
          display: block;
          width: 24px;
          height: 1px;
          background: var(--ink);
        }
        .b-tag {
          padding: 3px 9px;
          border: 1px solid var(--ink);
          color: var(--ink);
          font-size: 9.5px;
          letter-spacing: 0.18em;
        }
        .b-display {
          font-family: var(--H);
          font-weight: 800;
          font-size: clamp(56px, 8.5vw, 132px);
          font-variation-settings: 'opsz' 96;
          line-height: 0.88;
          letter-spacing: -0.045em;
          color: var(--text);
        }
        .b-display :global(.ink) {
          color: var(--ink);
          font-style: italic;
          font-family: var(--S);
          font-weight: 400;
          letter-spacing: -0.015em;
          font-size: 0.92em;
        }
        .b-display :global(.underscore) {
          display: inline-block;
          box-shadow: inset 0 -8px 0 var(--ink);
        }
        .b-sub {
          margin-top: 28px;
          font-size: 17px;
          line-height: 1.55;
          color: var(--text-2);
          max-width: 540px;
        }
        .b-code {
          font-family: var(--M);
          background: var(--ink-08);
          color: var(--ink);
          padding: 1px 7px;
          border-radius: 2px;
          font-size: 0.9em;
        }
        .b-cta-row {
          margin-top: 36px;
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .b-cta-row :global(.b-btn),
        .b-cta-row .b-btn {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          padding: 16px 24px;
          background: var(--ink);
          color: var(--on-ink);
          font-family: var(--M);
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          text-decoration: none;
          border: 1px solid var(--ink);
          transition: transform 0.14s, filter 0.14s;
        }
        .b-cta-row .b-btn:hover,
        .b-cta-row :global(.b-btn:hover) {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }
        .b-cta-row :global(.b-btn-ghost) {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          padding: 16px 24px;
          background: transparent;
          color: var(--text);
          font-family: var(--M);
          font-weight: 600;
          font-size: 12px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          text-decoration: none;
          border: 1px solid var(--line-2);
          transition: border-color 0.14s, color 0.14s;
        }
        .b-cta-row :global(.b-btn-ghost:hover) {
          border-color: var(--ink);
          color: var(--ink);
        }
        .b-arr {
          font-family: var(--M);
          font-size: 13px;
        }
        .b-cta-note {
          font-family: var(--M);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-4);
        }

        /* TRUST */
        .b-trust {
          list-style: none;
          padding: 0;
          margin: 32px 0 0 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 540px;
        }
        .b-trust-item {
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: var(--M);
          font-size: 11.5px;
          letter-spacing: 0.04em;
          color: var(--text-3);
        }
        .b-trust-glyph {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          background: var(--ink-08);
          color: var(--ink);
          font-family: var(--M);
          font-size: 10px;
          font-weight: 700;
          flex-shrink: 0;
        }

        /* CODE BLOCK on hero right */
        .b-codeblock {
          background: var(--surf);
          border: 1px solid var(--line);
          overflow: hidden;
        }
        .b-codeblock-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--line);
          background: var(--surf-2);
        }
        .b-codeblock-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .b-codeblock-name {
          margin-left: 12px;
          font-family: var(--M);
          font-size: 10.5px;
          letter-spacing: 0.08em;
          color: var(--text-3);
        }
        .b-codeblock-code {
          font-family: var(--M);
          font-size: 13.5px;
          line-height: 1.65;
          padding: 24px 22px 28px;
          color: var(--text-2);
          margin: 0;
          overflow-x: auto;
        }
        .b-kw {
          color: var(--ink);
          font-weight: 700;
        }
        .b-fn {
          color: var(--text);
          font-weight: 700;
        }
        .b-cm {
          color: var(--text-4);
          font-style: italic;
        }

        /* MANIFESTO BAND */
        .b-band {
          display: grid;
          grid-template-columns: 1fr;
          border-bottom: 1px solid var(--line);
        }
        @media (min-width: 760px) {
          .b-band {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        .b-band-cell {
          padding: 48px 36px 56px;
          border-right: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .b-band-cell:last-child {
          border-right: none;
        }
        @media (max-width: 760px) {
          .b-band-cell {
            border-right: none;
            border-bottom: 1px solid var(--line);
          }
        }
        .b-band-n {
          font-family: var(--M);
          font-size: 10.5px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-4);
        }
        .b-band-stat {
          font-family: var(--H);
          font-weight: 800;
          font-size: clamp(72px, 9vw, 128px);
          line-height: 0.85;
          letter-spacing: -0.045em;
          color: var(--ink);
        }
        .b-band-claim {
          font-family: var(--H);
          font-weight: 700;
          font-size: 22px;
          letter-spacing: -0.02em;
          line-height: 1.15;
          color: var(--text);
        }
        .b-band-copy {
          font-size: 14.5px;
          line-height: 1.6;
          color: var(--text-2);
          max-width: 340px;
        }
        .b-band-rails {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .b-rail {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: var(--surf);
          border: 1px solid var(--line);
        }
        .b-rail-ico {
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--ink);
          color: var(--on-ink);
          font-size: 14px;
        }
        .b-rail-name {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text);
        }
        .b-band-flow {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .b-flow-row {
          display: flex;
          align-items: center;
          gap: 11px;
          font-size: 13.5px;
          color: var(--text-2);
        }
        .b-flow-row.ok {
          color: var(--text);
        }
        .b-flow-num {
          font-family: var(--M);
          font-size: 11px;
          color: var(--ink);
          font-weight: 700;
          width: 22px;
        }

        /* USE CASES */
        .b-how {
          padding: 72px var(--pad);
          border-bottom: 1px solid var(--line);
        }
        .b-how-hd {
          margin-bottom: 40px;
        }
        .b-how-title {
          font-family: var(--H);
          font-weight: 800;
          font-size: clamp(36px, 4.5vw, 64px);
          line-height: 1;
          letter-spacing: -0.035em;
          color: var(--text);
          max-width: 760px;
        }
        .b-how-title :global(em) {
          font-family: var(--S);
          font-style: italic;
          font-weight: 400;
          color: var(--ink);
        }
        .b-how-grid {
          display: grid;
          grid-template-columns: 1fr;
          border: 1px solid var(--line);
        }
        @media (min-width: 760px) {
          .b-how-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        .b-how-cell {
          padding: 32px 28px;
          border-right: 1px solid var(--line);
        }
        .b-how-cell:last-child {
          border-right: none;
        }
        @media (max-width: 760px) {
          .b-how-cell {
            border-right: none;
            border-bottom: 1px solid var(--line);
          }
        }
        .b-how-n {
          font-family: var(--M);
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink);
          font-weight: 600;
          margin-bottom: 18px;
        }
        .b-how-h {
          font-family: var(--H);
          font-weight: 700;
          font-size: 22px;
          letter-spacing: -0.02em;
          color: var(--text);
          margin-bottom: 10px;
        }
        .b-how-p {
          font-size: 14px;
          line-height: 1.6;
          color: var(--text-2);
          max-width: 320px;
        }
        .b-how-link {
          color: var(--ink);
          text-decoration: none;
          border-bottom: 1px solid var(--ink-22);
        }

        /* ROADMAP */
        .b-roadmap {
          padding: 72px var(--pad);
          border-bottom: 1px solid var(--line);
        }
        .b-roadmap-title {
          font-family: var(--H);
          font-weight: 800;
          font-size: clamp(36px, 4.5vw, 64px);
          line-height: 1;
          letter-spacing: -0.035em;
          color: var(--text);
          margin-bottom: 40px;
        }
        .b-roadmap-title :global(em) {
          font-family: var(--S);
          font-style: italic;
          font-weight: 400;
        }
        .b-roadmap-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 18px;
          max-width: 880px;
        }
        .b-roadmap-item {
          display: flex;
          gap: 16px;
          padding: 18px 22px;
          background: var(--surf);
          border: 1px solid var(--line);
        }
        .b-roadmap-done {
          background: var(--ink-04);
          border-color: var(--ink-22);
        }
        .b-roadmap-tick {
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--ink-08);
          color: var(--ink);
          font-family: var(--M);
          font-size: 14px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .b-roadmap-done .b-roadmap-tick {
          background: var(--ink);
          color: var(--on-ink);
        }
        .b-roadmap-text {
          font-size: 14.5px;
          line-height: 1.55;
          color: var(--text-2);
        }
        .b-roadmap-text b {
          color: var(--text);
        }
        .b-code-inline {
          font-family: var(--M);
          background: var(--ink-08);
          color: var(--ink);
          padding: 1px 6px;
          border-radius: 2px;
          font-size: 0.9em;
        }
      `}</style>
    </main>
  );
}
