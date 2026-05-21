'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'casi-studio-welcomed';

type Props = {
  profileId: string;
};

export default function StudioWelcome({ profileId }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const dismissed = window.localStorage.getItem(`${STORAGE_KEY}:${profileId}`);
      if (!dismissed) setVisible(true);
    } catch {
      // localStorage unavailable — skip welcome silently
    }
  }, [profileId]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(`${STORAGE_KEY}:${profileId}`, String(Date.now()));
    } catch { /* noop */ }
  };

  if (!visible) return null;

  return (
    <div className="casi-studio-welcome">
      <style>{`
        /* Apothecary palette scoped to this banner so it always reads as
           the onboarding surface regardless of the streamer's chosen skin. */
        .casi-studio-welcome {
          --sw-paper:  #f5e1d2;
          --sw-surf:   #ede0cf;
          --sw-line:   rgba(34, 26, 20, 0.12);
          --sw-ink:    #294b3c;
          --sw-accent: #c04830;
          --sw-type:   #221a14;
          --sw-type2:  #6a574b;
          --sw-type3:  #8a7a5a;

          position: relative;
          background: var(--sw-surf);
          border: 1px solid var(--sw-line);
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
          color: var(--sw-accent);
          margin-bottom: 6px;
        }
        .casi-studio-welcome-title {
          font-family: var(--H);
          font-weight: 800;
          font-size: 22px;
          letter-spacing: -0.025em;
          line-height: 1.15;
          color: var(--sw-type);
        }
        .casi-studio-welcome-sub {
          font-size: 13.5px;
          line-height: 1.55;
          color: var(--sw-type2);
          max-width: 640px;
          margin-top: 8px;
        }
        .casi-studio-welcome-dismiss {
          flex-shrink: 0;
          background: transparent;
          border: 1px solid var(--sw-line);
          color: var(--sw-type3);
          font-family: var(--M);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          padding: 7px 12px;
          cursor: pointer;
          transition: color 0.14s, border-color 0.14s;
        }
        .casi-studio-welcome-dismiss:hover {
          color: var(--sw-ink);
          border-color: var(--sw-ink);
        }
        .casi-studio-welcome-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        @media (min-width: 640px) {
          .casi-studio-welcome-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1100px) {
          .casi-studio-welcome-grid { grid-template-columns: repeat(4, 1fr); }
        }
        .casi-studio-welcome-card {
          background: var(--sw-paper);
          border: 1px solid var(--sw-line);
          padding: 16px 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .casi-studio-welcome-num {
          font-family: var(--H);
          font-weight: 800;
          font-size: 22px;
          color: var(--sw-accent);
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .casi-studio-welcome-h {
          font-family: var(--H);
          font-weight: 700;
          font-size: 15px;
          letter-spacing: -0.015em;
          color: var(--sw-type);
        }
        .casi-studio-welcome-p {
          font-size: 12.5px;
          line-height: 1.55;
          color: var(--sw-type2);
        }
        .casi-studio-welcome-p a {
          color: var(--sw-ink);
          text-decoration: none;
          border-bottom: 1px solid rgba(41, 75, 60, 0.25);
        }
        .casi-studio-welcome-p a:hover { border-bottom-color: var(--sw-ink); }
        .casi-studio-welcome-foot {
          font-family: var(--M);
          font-size: 10.5px;
          letter-spacing: 0.04em;
          color: var(--sw-type3);
          border-top: 1px dashed var(--sw-line);
          padding-top: 14px;
        }
      `}</style>

      <div className="casi-studio-welcome-head">
        <div>
          <div className="casi-studio-welcome-eyebrow">First time here</div>
          <h2 className="casi-studio-welcome-title">Welcome to your studio.</h2>
          <p className="casi-studio-welcome-sub">
            Four small steps before viewers can book your stream. Each takes a couple of minutes.
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

        <div className="casi-studio-welcome-card">
          <span className="casi-studio-welcome-num">4</span>
          <h3 className="casi-studio-welcome-h">Make yourself at home!</h3>
          <p className="casi-studio-welcome-p">
            Write a bio, set an avatar, and pick a skin in{' '}
            <Link href="/studio/settings">Settings</Link>. Viewers land on your streamer page before they ever open OBS — make it yours.
          </p>
        </div>
      </div>

      <div className="casi-studio-welcome-foot">
        Pricing is yours · Approval is yours · 0% protocol cut on every booking
      </div>
    </div>
  );
}
