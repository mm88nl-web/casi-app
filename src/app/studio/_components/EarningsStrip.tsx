'use client';

import { useEffect, useRef, useState } from 'react';
import CasiLogo from '@/components/CasiLogo';

type Props = {
  slug: string;
  earnedToday: string;
  earnedMonth: string;
  pendingCount: number;
};

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'accent2' }) {
  const color =
    tone === 'accent' ? 'var(--casi-accent)' : tone === 'accent2' ? 'var(--casi-accent2)' : 'var(--casi-text)';
  return (
    <div
      className="flex flex-col justify-center gap-1.5"
      style={{
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '14px',
        padding: '16px 18px',
        minHeight: '78px',
      }}
    >
      <div
        className="font-mono uppercase"
        style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--casi-text-faint)' }}
      >
        {label}
      </div>
      <div
        className="font-mono"
        style={{
          fontSize: '22px',
          fontWeight: 500,
          letterSpacing: '-0.5px',
          lineHeight: 1,
          color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LinkTile({ slug }: { slug: string }) {
  const fullUrl = `https://www.casi.gg/overlay?s=${slug}`;
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API refused; user can select the text manually.
    }
  };

  return (
    <div
      className="flex items-center gap-3"
      style={{
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '14px',
        padding: '16px 18px',
        minHeight: '78px',
      }}
    >
      <CasiLogo size={28} />
      <div className="flex-1 min-w-0">
        <div
          className="font-mono uppercase"
          style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--casi-text-faint)' }}
        >
          Your viewer link
        </div>
        <div
          className="font-mono truncate"
          style={{ fontSize: '14px', color: 'var(--casi-text)', marginTop: '2px' }}
          title={fullUrl}
        >
          <span style={{ color: 'var(--casi-text-dim)' }}>www.casi.gg/overlay?s=</span>
          <span style={{ color: 'var(--casi-accent)', fontWeight: 500 }}>{slug}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="whitespace-nowrap font-bold"
        style={{
          padding: '8px 14px',
          borderRadius: '8px',
          background: 'var(--casi-accent)',
          color: '#050505',
          fontFamily: 'var(--font-casi-sans)',
          fontWeight: 800,
          fontSize: '12px',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export default function EarningsStrip({ slug, earnedToday, earnedMonth, pendingCount }: Props) {
  return (
    <div
      className="grid gap-3.5"
      style={{ gridTemplateColumns: 'minmax(0, 1.6fr) repeat(3, minmax(0, 1fr))' }}
    >
      <LinkTile slug={slug} />
      <StatTile label="Earned today" value={earnedToday} tone="accent" />
      <StatTile label="This month" value={earnedMonth} />
      <StatTile label="Bookings waiting" value={String(pendingCount)} tone="accent2" />
    </div>
  );
}
