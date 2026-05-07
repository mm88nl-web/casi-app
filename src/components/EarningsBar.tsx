'use client';

import { useEffect, useRef, useState } from 'react';

type EarningsBarProps = {
  /** Public viewer-facing URL the streamer shares (e.g. casi.gg/overlay?s=foo). */
  viewerLink: string;
  /** Today's earnings in the streamer's chosen display currency, pre-formatted
   *  (e.g. "€48", "$12", "5 USDC", or "—" when zero). */
  today: string;
  /** Pending count — bookings + flashes awaiting approval. */
  pending: number | string;
};

/**
 * v9 earn-line — viewer-link + Today + Pending in a single sharp strip
 * (var(--surf) bg, --line border, no rounded corners). Mono uppercase
 * eyebrow labels with letter-spacing, Bricolage 800 numerics, ink slab
 * Copy button. Matches v9's `.earn-line` lattice.
 */
export default function EarningsBar({ viewerLink, today, pending }: EarningsBarProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(viewerLink);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can fail in insecure context — silent.
    }
  };

  // Render the URL with the username segment highlighted (after the last '=').
  const eqIdx = viewerLink.lastIndexOf('=');
  const urlBase = eqIdx >= 0 ? viewerLink.slice(0, eqIdx + 1) : viewerLink;
  const urlSlug = eqIdx >= 0 ? viewerLink.slice(eqIdx + 1) : '';

  return (
    <div className="casi-v9-earn-line">
      <style>{`
        .casi-v9-earn-line {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr);
          gap: 0;
          background: var(--surf);
          border: 1px solid var(--line);
        }
        @media (max-width: 760px) {
          .casi-v9-earn-line { grid-template-columns: 1fr; }
        }
        .casi-v9-earn-line > .earn-seg {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 18px 22px;
          border-right: 1px solid var(--line);
          min-width: 0;
        }
        .casi-v9-earn-line > .earn-seg:last-child { border-right: none; }
        @media (max-width: 760px) {
          .casi-v9-earn-line > .earn-seg {
            border-right: none;
            border-bottom: 1px solid var(--line);
          }
          .casi-v9-earn-line > .earn-seg:last-child { border-bottom: none; }
        }
        .casi-v9-earn-line .earn-seg.link {
          flex-direction: row;
          align-items: center;
          gap: 14px;
        }
        .casi-v9-earn-line .earn-seg-lbl {
          font-family: var(--M);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-4);
          margin-bottom: 6px;
          font-weight: 500;
        }
        .casi-v9-earn-line .earn-seg-val {
          font-family: var(--H);
          font-weight: 800;
          font-variation-settings: 'opsz' 48;
          font-size: 32px;
          letter-spacing: -0.035em;
          line-height: 1;
          color: var(--text);
          font-variant-numeric: tabular-nums;
        }
        .casi-v9-earn-line .earn-seg-val.ink { color: var(--ink); }
        .casi-v9-earn-line .earn-url {
          font-family: var(--M);
          font-size: 13px;
          color: var(--text-3);
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: 0.02em;
        }
        .casi-v9-earn-line .earn-url em {
          color: var(--ink);
          font-style: normal;
          font-weight: 600;
        }
        .casi-v9-earn-line .earn-copy-btn {
          padding: 9px 14px;
          background: var(--ink);
          color: var(--on-ink);
          border: none;
          font-family: var(--M);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          flex-shrink: 0;
          cursor: pointer;
          transition: filter 0.14s;
        }
        .casi-v9-earn-line .earn-copy-btn:hover { filter: brightness(1.1); }
      `}</style>

      <div className="earn-seg link">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="earn-seg-lbl">Viewer link</div>
          <div className="earn-url" title={viewerLink}>
            {urlBase}
            <em>{urlSlug}</em>
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="earn-copy-btn"
          aria-label={copied ? 'Copied' : 'Copy viewer link'}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="earn-seg">
        <div className="earn-seg-lbl">Today</div>
        <div className="earn-seg-val ink">{today}</div>
      </div>
      <div className="earn-seg">
        <div className="earn-seg-lbl">Pending</div>
        <div className="earn-seg-val ink">{String(pending)}</div>
      </div>
    </div>
  );
}
