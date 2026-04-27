'use client';

import { useEffect, useRef, useState } from 'react';

type EarningsBarProps = {
  /** Public viewer-facing URL the streamer shares (e.g. casi.gg/overlay?s=foo). */
  viewerLink: string;
  /** Today's EUR earnings — pre-formatted (e.g. "€48"). */
  todayEur: string;
  /** Today's USDC earnings — pre-formatted (e.g. "12"). */
  todayUsdc: string;
  /** Pending count — bookings + flashes awaiting approval. */
  pending: number | string;
};

/**
 * Compact unified earnings strip across the top of the studio dashboard.
 * v7 collapses the v3 4-stat layout into "viewer-link + Copy" + 3 numeric
 * tiles. EUR uses --casi-accent (teal in Casi Dark), USDC uses Solana
 * green-teal #14F195, Pending reuses --casi-accent.
 */
export default function EarningsBar({ viewerLink, todayEur, todayUsdc, pending }: EarningsBarProps) {
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
  // Matches the prototype's `<em>droptv</em>` treatment.
  const eqIdx = viewerLink.lastIndexOf('=');
  const urlBase = eqIdx >= 0 ? viewerLink.slice(0, eqIdx + 1) : viewerLink;
  const urlSlug = eqIdx >= 0 ? viewerLink.slice(eqIdx + 1) : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '10px',
        overflow: 'hidden',
      }}
      className="casi-earnings-bar"
    >
      <style>{`
        @media (max-width: 700px) {
          .casi-earnings-bar { flex-direction: column; }
          .casi-earnings-bar > div { border-right: none !important; border-bottom: 1px solid var(--casi-border); }
          .casi-earnings-bar > div:last-child { border-bottom: none; }
        }
      `}</style>

      {/* Viewer link + copy */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '18px 22px',
          borderRight: '1px solid var(--casi-border)',
          flex: '1.8',
          minWidth: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10.5px', color: 'var(--casi-text-mid)', marginBottom: '5px' }}>
            Viewer link
          </div>
          <div
            style={{
              fontFamily: 'var(--font-casi-mono), monospace',
              fontSize: '12px',
              color: 'var(--casi-text-mid)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={viewerLink}
          >
            {urlBase}
            <span style={{ color: 'var(--casi-accent)', fontStyle: 'normal' }}>{urlSlug}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          style={{
            padding: '8px 14px',
            borderRadius: '7px',
            background: 'var(--casi-accent)',
            color: 'var(--casi-bg)',
            fontSize: '12px',
            fontWeight: 700,
            flexShrink: 0,
            border: 'none',
            cursor: 'pointer',
            transition: 'opacity .14s',
            fontFamily: 'var(--font-casi-sans), sans-serif',
          }}
          aria-label={copied ? 'Copied' : 'Copy viewer link'}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <Stat label="Today · EUR" value={todayEur} color="var(--casi-accent)" />
      <Stat label="Today · USDC" value={todayUsdc} color="#14F195" />
      <Stat label="Pending" value={String(pending)} color="var(--casi-accent)" last />
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  last = false,
}: {
  label: string;
  value: string;
  color: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '18px 22px',
        borderRight: last ? 'none' : '1px solid var(--casi-border)',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: '10.5px', color: 'var(--casi-text-mid)', marginBottom: '5px' }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-casi-display), var(--font-casi-sans), sans-serif',
          fontWeight: 700,
          fontSize: '24px',
          letterSpacing: '-0.5px',
          lineHeight: 1,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}
