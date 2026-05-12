'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * First-time studio welcome banner.
 *
 * Dismissible. Stores the dismissal in localStorage so it shows once per
 * device per streamer. Renders nothing on the server / first paint to
 * avoid hydration flicker; the effect decides whether to mount based on
 * the localStorage flag.
 *
 * The three cards summarize the moves a brand-new streamer needs to make:
 *   1. Add the two OBS browser sources (Backdrop + Beams) to a scene.
 *   2. Open the canvas editor at /studio/live, drop slots, set prices.
 *   3. (Optional but recommended) Install the session-key delegate so
 *      approves and kicks don't pop a wallet every time.
 *
 * The session-key card also names the cranker so streamers understand
 * why approves are free: CASI funds a shared keypair that pays the
 * Solana fees for the delegated start_beam / settle_beam instructions.
 * If we don't name it, the "no popup" UX feels like magic; once they
 * read why, they trust it more.
 */

const STORAGE_KEY = 'casi-studio-welcomed';

type Props = {
  /** Used to scope the dismissal per-streamer; clearing cookies +
   *  switching to a different account shows the welcome again. */
  profileId: string;
};

export default function StudioWelcome({ profileId }: Props) {
  // Start hidden — flip to visible only after the effect confirms the
  // streamer hasn't dismissed it yet. Avoids a flash on hydration.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const dismissed = window.localStorage.getItem(`${STORAGE_KEY}:${profileId}`);
      if (!dismissed) setVisible(true);
    } catch {
      // localStorage can fail in private browsing / iframe contexts —
      // in that case just don't show the welcome, no biggie.
    }
  }, [profileId]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(`${STORAGE_KEY}:${profileId}`, String(Date.now()));
    } catch {
      /* noop */
    }
  };

  if (!visible) return null;

  return (
    <div className="casi-studio-welcome">
      <style>{`
        .casi-studio-welcome {
          position: relative;
          background: var(--surf);
          border: 1px solid var(--ink-22);
          padding: 22px 26px 26px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .casi-studio-welcome-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }
        .casi-studio-welcome-eyebrow {
          font-family: var(--M);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink);
          margin-bottom: 6px;
        }
        .casi-studio-welcome-title {
          font-family: var(--H);
          font-weight: 800;
          font-size: 22px;
          letter-spacing: -0.025em;
          line-height: 1.15;
          color: var(--text);
        }
        .casi-studio-welcome-sub {
          font-size: 13.5px;
          line-height: 1.55;
          color: var(--text-2);
          max-width: 640px;
          margin-top: 8px;
        }
        .casi-studio-welcome-dismiss {
          flex-shrink: 0;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--text-3);
          font-family: var(--M);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          padding: 7px 12px;
          cursor: pointer;
          transition: color 0.14s, border-color 0.14s;
        }
        .casi-studio-welcome-dismiss:hover {
          color: var(--ink);
          border-color: var(--ink);
        }
        .casi-studio-welcome-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        @media (min-width: 760px) {
          .casi-studio-welcome-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        .casi-studio-welcome-card {
          background: var(--paper);
          border: 1px solid var(--line);
          padding: 16px 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .casi-studio-welcome-num {
          font-family: var(--H);
          font-weight: 800;
          font-size: 22px;
          color: var(--ink);
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .casi-studio-welcome-h {
          font-family: var(--H);
          font-weight: 700;
          font-size: 15px;
          letter-spacing: -0.015em;
          color: var(--text);
        }
        .casi-studio-welcome-p {
          font-size: 12.5px;
          line-height: 1.55;
          color: var(--text-2);
        }
        .casi-studio-welcome-p a {
          color: var(--ink);
          text-decoration: none;
          border-bottom: 1px solid var(--ink-22);
        }
        .casi-studio-welcome-p a:hover {
          border-bottom-color: var(--ink);
        }
        .casi-studio-welcome-foot {
          font-family: var(--M);
          font-size: 10.5px;
          letter-spacing: 0.04em;
          color: var(--text-3);
          padding-top: 4px;
          border-top: 1px dashed var(--line);
          padding-top: 14px;
        }
      `}</style>

      <div className="casi-studio-welcome-head">
        <div>
          <div className="casi-studio-welcome-eyebrow">First time here</div>
          <h2 className="casi-studio-welcome-title">Welcome to your studio.</h2>
          <p className="casi-studio-welcome-sub">
            Three small setup steps before viewers can book your stream. Each takes a couple of minutes.
          </p>
        </div>
        <button type="button" className="casi-studio-welcome-dismiss" onClick={dismiss} aria-label="Don't show this welcome again">
          Don&apos;t show again
        </button>
      </div>

      <div className="casi-studio-welcome-grid">
        <div className="casi-studio-welcome-card">
          <span className="casi-studio-welcome-num">1</span>
          <h3 className="casi-studio-welcome-h">Drop CASI into OBS</h3>
          <p className="casi-studio-welcome-p">
            Add two Browser Sources to your OBS scene — Backdrop behind everything, Beams on top. URLs to copy live in{' '}
            <Link href="/studio/settings#obs-sources">Settings → OBS sources</Link>.
          </p>
        </div>

        <div className="casi-studio-welcome-card">
          <span className="casi-studio-welcome-num">2</span>
          <h3 className="casi-studio-welcome-h">Set up your slots</h3>
          <p className="casi-studio-welcome-p">
            On the <Link href="/studio/live">Live tab</Link>, place hex / circle / rect / banner shapes anywhere on your scene and set a price per minute. That&apos;s what viewers will book.
          </p>
        </div>

        <div className="casi-studio-welcome-card">
          <span className="casi-studio-welcome-num">3</span>
          <h3 className="casi-studio-welcome-h">Turn on instant approve</h3>
          <p className="casi-studio-welcome-p">
            One quick wallet signature now, and approving a booking is one tap from then on. No popup every time. CASI covers the Solana fees, not you.{' '}
            <Link href="/studio/settings#session-key">Set it up</Link>.
          </p>
        </div>
      </div>

      <div className="casi-studio-welcome-foot">
        Pricing is yours · Approval is yours · 0% protocol cut on every booking
      </div>
    </div>
  );
}
