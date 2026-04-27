'use client';

import Link from 'next/link';
import SearchDropdown from '@/components/SearchDropdown';

/**
 * v7 split-door hero. Two equal-width panels — viewer-side on the left
 * (eyebrow + headline + body + search + browse hint), streamer-side on
 * the right (eyebrow + headline + body + create-studio CTA + faint
 * mock-stream watermark in the background). Backed by a warm bottom-
 * right radial gradient so the streamer panel reads as "where the
 * stream lives".
 */
export default function LandingSplitDoor() {
  return (
    <section
      className="casi-l-hero"
      style={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: 'calc(100vh - 54px - 56px)',
      }}
    >
      <style>{`
        .casi-l-hero {
          display: grid;
          grid-template-columns: 1fr 1fr;
          background:
            radial-gradient(ellipse 80% 90% at 85% 80%, rgba(var(--casi-accent-rgb), 0.05) 0%, rgba(var(--casi-accent-rgb), 0.02) 30%, var(--casi-bg) 65%);
        }
        @media (max-width: 860px) {
          .casi-l-hero { grid-template-columns: 1fr; }
        }
        .casi-l-panel {
          display: flex; flex-direction: column; justify-content: center;
          padding: 80px 60px;
          position: relative; z-index: 2;
        }
        .casi-l-panel[data-side="left"] {
          border-right: 1px solid rgba(255,255,255,0.05);
        }
        @media (max-width: 860px) {
          .casi-l-panel { padding: 52px 28px; }
          .casi-l-panel[data-side="left"] {
            border-right: none;
            border-bottom: 1px solid rgba(255,255,255,0.05);
          }
        }
        .casi-l-eyebrow {
          font-size: 11px; font-weight: 500;
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 28px;
        }
        .casi-l-eyebrow::before {
          content: ''; display: block; width: 20px; height: 1px;
          background: currentColor;
        }
        .casi-l-headline {
          font-family: var(--font-casi-display), var(--font-casi-sans), sans-serif;
          font-weight: 800;
          font-size: clamp(52px, 6vw, 92px);
          line-height: 0.88;
          letter-spacing: -0.5px;
          margin-bottom: 30px;
          color: var(--casi-text);
          text-wrap: balance;
        }
        .casi-l-outline {
          -webkit-text-stroke: 1.5px rgba(232, 234, 237, 0.55);
          color: transparent;
        }
        .casi-l-outline-accent {
          -webkit-text-stroke: 1.5px rgba(var(--casi-accent-rgb), 0.5);
          color: transparent;
        }
        .casi-l-body {
          font-size: 15px; line-height: 1.7;
          color: var(--casi-text-mid);
          max-width: 380px; margin-bottom: 40px;
        }
        .casi-l-browse {
          font-size: 12px; color: var(--casi-text-dim);
          margin-top: 12px;
        }
        .casi-l-cta-row {
          display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
        }
        .casi-l-cta {
          display: inline-flex; align-items: center; gap: 12px;
          padding: 16px 32px; border-radius: 10px;
          background: var(--casi-accent);
          color: var(--casi-bg);
          font-family: var(--font-casi-sans), sans-serif;
          font-weight: 700; font-size: 16px;
          letter-spacing: 0.2px; white-space: nowrap;
          text-decoration: none;
          transition: opacity .15s, transform .15s;
        }
        .casi-l-cta:hover { opacity: 0.9; transform: translateY(-2px); }
        .casi-l-cta-arr { transition: transform .15s; }
        .casi-l-cta:hover .casi-l-cta-arr { transform: translateX(4px); }
        .casi-l-cta-note {
          font-size: 12px; color: var(--casi-text-dim);
        }
        .casi-l-mock {
          position: absolute; right: -40px; bottom: -40px;
          width: 55%; aspect-ratio: 16/9;
          border-radius: 10px;
          background: var(--casi-bg);
          border: 1px solid rgba(var(--casi-accent-rgb), 0.1);
          overflow: hidden;
          opacity: 0.35;
          pointer-events: none;
          z-index: 0;
        }
        .casi-l-mock-beam {
          position: absolute; left: 6%; top: 8%;
          width: 30%; height: 44%;
          border-radius: 6px;
          border: 1.5px solid var(--casi-accent);
          background: rgba(var(--casi-accent-rgb), 0.05);
          box-shadow: 0 0 14px rgba(var(--casi-accent-rgb), 0.15);
        }
        .casi-l-mock-banner {
          position: absolute; bottom: 0; left: 0; right: 0; height: 10%;
          background: rgba(var(--casi-accent-rgb), 0.06);
          border-top: 1px solid rgba(var(--casi-accent-rgb), 0.15);
        }
      `}</style>

      {/* LEFT — viewer */}
      <div className="casi-l-panel" data-side="left">
        <p className="casi-l-eyebrow font-mono uppercase" style={{ color: 'var(--casi-accent)' }}>
          For viewers
        </p>
        <h1 className="casi-l-headline">
          Book screen time
          <br />
          on a <span className="casi-l-outline">live stream.</span>
        </h1>
        <p className="casi-l-body">
          Find a streamer. Pick a slot. Pay by the minute — card or USDC. Your image or video goes
          live the moment they approve it.
        </p>
        <div style={{ position: 'relative', zIndex: 2, maxWidth: '400px' }}>
          <SearchDropdown />
        </div>
        <p className="casi-l-browse font-mono">Browse · no account needed</p>
      </div>

      {/* RIGHT — streamer */}
      <div className="casi-l-panel" data-side="right">
        {/* Mock-stream watermark in the bg */}
        <div className="casi-l-mock" aria-hidden>
          <div className="casi-l-mock-beam" />
          <div className="casi-l-mock-banner" />
        </div>

        <p className="casi-l-eyebrow font-mono uppercase" style={{ color: 'var(--casi-accent)' }}>
          For streamers
        </p>
        <h2 className="casi-l-headline">
          Sell slots on
          <br />
          <span className="casi-l-outline-accent">your stream.</span>
        </h2>
        <p className="casi-l-body">
          One browser source in OBS. Viewers pay to place images, clips, or banners on your screen
          by the minute. You approve every one. You keep 100%.
        </p>
        <div className="casi-l-cta-row" style={{ position: 'relative', zIndex: 2 }}>
          <Link href="/signup" className="casi-l-cta">
            Create your studio <span className="casi-l-cta-arr">→</span>
          </Link>
          <span className="casi-l-cta-note">Free · 2 min setup</span>
        </div>
      </div>
    </section>
  );
}
