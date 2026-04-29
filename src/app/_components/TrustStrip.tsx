import type { ReactNode } from 'react';

/**
 * v7 trust band — full-bleed horizontal row with three trust items
 * separated by vertical borders. Replaces the v3 card-grid layout.
 *
 *  01 · revenue         02 · payment rails       03 · protection
 *  0%                   [Stripe / USDC / Free]   [Approved chip + lines]
 *  We don't touch …     Pay any way              Tap yes — or money …
 *
 * Stacks vertically below 680px.
 */
export default function TrustStrip() {
  return (
    <section className="casi-trust-band">
      <style>{`
        .casi-trust-band {
          display: flex; align-items: stretch;
          border-top: 1px solid var(--casi-border);
          border-bottom: 1px solid var(--casi-border);
        }
        @media (max-width: 680px) {
          .casi-trust-band { flex-direction: column; }
        }
        .casi-trust-item {
          flex: 1;
          padding: 44px 40px;
          display: flex; flex-direction: column; gap: 16px;
          border-right: 1px solid var(--casi-border);
        }
        .casi-trust-item:last-child { border-right: none; }
        @media (max-width: 680px) {
          .casi-trust-item { border-right: none; border-bottom: 1px solid var(--casi-border); }
          .casi-trust-item:last-child { border-bottom: none; }
        }
        .casi-trust-n {
          font-family: var(--font-casi-mono), monospace;
          font-size: 9.5px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--casi-text-faint);
        }
        .casi-trust-stat {
          font-family: var(--font-casi-display), var(--font-casi-sans), sans-serif;
          font-weight: 800;
          font-size: clamp(48px, 5vw, 72px);
          letter-spacing: -3px;
          line-height: 0.88;
          color: var(--casi-accent);
        }
        .casi-trust-claim {
          font-family: var(--font-casi-display), var(--font-casi-sans), sans-serif;
          font-weight: 700;
          font-size: 17px;
          letter-spacing: -0.3px;
          color: var(--casi-text);
        }
        .casi-trust-copy {
          font-size: 13px;
          line-height: 1.7;
          color: var(--casi-text-mid);
        }
      `}</style>

      <TrustItem num="01 · revenue" claim="We don't touch your money"
        copy="Cards go straight to Stripe. USDC sits in open-source on-chain escrow. Casi is software — not a bank."
        visual={<div className="casi-trust-stat">0%</div>}
      />

      <TrustItem num="02 · payment rails" claim="Pay any way"
        copy="Card or USDC, one booking flow. Free tier for streamers who want to grow first."
        visual={<PaymentRails />}
      />

      <TrustItem num="03 · protection" claim="Tap yes — or the money comes back"
        copy="Nothing goes live without the streamer's approval. Every denial triggers an automatic refund."
        visual={<ProtectionVisual />}
      />
    </section>
  );
}

function TrustItem({
  num,
  visual,
  claim,
  copy,
}: {
  num: string;
  visual: ReactNode;
  claim: string;
  copy: ReactNode;
}) {
  return (
    <div className="casi-trust-item">
      <div className="casi-trust-n">{num}</div>
      {visual}
      <div>
        <div className="casi-trust-claim" style={{ marginBottom: '8px' }}>{claim}</div>
        <p className="casi-trust-copy">{copy}</p>
      </div>
    </div>
  );
}

function PaymentRails() {
  return (
    <>
      <style>{`
        .casi-rail-wrap { display: flex; flex-direction: column; gap: 8px; }
        .casi-rail {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 8px;
        }
        .casi-rail-ico {
          width: 24px; height: 24px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-casi-mono), monospace; font-size: 12px;
          flex-shrink: 0;
        }
        .casi-rail-name { font-size: 13px; font-weight: 600; flex: 1; }
        .casi-rail-note { font-family: var(--font-casi-mono), monospace; font-size: 9.5px; color: var(--casi-text-dim); }
      `}</style>
      <div className="casi-rail-wrap">
        <div
          className="casi-rail"
          style={{
            background: 'rgba(var(--casi-accent-rgb), 0.05)',
            border: '1px solid rgba(var(--casi-accent-rgb), 0.16)',
          }}
        >
          <span
            className="casi-rail-ico"
            style={{
              background: 'rgba(var(--casi-accent-rgb), 0.1)',
              color: 'var(--casi-accent)',
            }}
          >
            $
          </span>
          <span className="casi-rail-name">Cards via Stripe</span>
          <span className="casi-rail-note">2.9%</span>
        </div>
        <div
          className="casi-rail"
          style={{
            background: 'rgba(var(--casi-accent-rgb), 0.05)',
            border: '1px solid rgba(var(--casi-accent-rgb), 0.15)',
          }}
        >
          <span
            className="casi-rail-ico"
            style={{
              background: 'rgba(var(--casi-accent-rgb), 0.1)',
              color: 'var(--casi-accent)',
            }}
          >
            ◎
          </span>
          <span className="casi-rail-name">USDC on Solana</span>
          <span className="casi-rail-note">on-chain</span>
        </div>
        <div
          className="casi-rail"
          style={{
            background: 'transparent',
            border: '1px solid var(--casi-border)',
          }}
        >
          <span className="casi-rail-ico" style={{ color: 'var(--casi-text-dim)' }}>♡</span>
          <span className="casi-rail-name" style={{ color: 'var(--casi-text-dim)' }}>Free tier</span>
          <span className="casi-rail-note">opt-in</span>
        </div>
      </div>
    </>
  );
}

function ProtectionVisual() {
  return (
    <>
      <style>{`
        .casi-appr-stack { display: flex; flex-direction: column; gap: 10px; }
        .casi-appr-chip {
          display: inline-flex; align-items: center; gap: 8px; align-self: flex-start;
          padding: 8px 14px; border-radius: 6px;
          font-size: 12px;
          color: var(--casi-accent);
          background: rgba(var(--casi-accent-rgb), 0.07);
          border: 1px solid rgba(var(--casi-accent-rgb), 0.18);
        }
        .casi-appr-chip-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--casi-accent); flex-shrink: 0;
        }
        .casi-appr-line {
          display: flex; align-items: center; gap: 10px;
          font-size: 12px; color: var(--casi-text-mid);
        }
        .casi-appr-line::before {
          content: ''; display: block; width: 14px; height: 1px;
          background: var(--casi-text-dim); flex-shrink: 0;
        }
      `}</style>
      <div className="casi-appr-stack">
        <div className="casi-appr-chip">
          <span className="casi-appr-chip-dot" />
          Approved · 4 seconds
        </div>
        <div className="casi-appr-line">Denied → full refund instantly</div>
        <div className="casi-appr-line">Stopped mid-beam → prorated back</div>
      </div>
    </>
  );
}
