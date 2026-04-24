'use client';

import { useMemo, useState } from 'react';

export type FlashLogItem = {
  id: string;
  time: string;
  who: string;
  message: string;
  chip: { kind: 'free' | 'usdc' | 'eur'; label: string };
  pinned?: boolean;
  refunded?: boolean;
};

type Props = {
  items: FlashLogItem[];
  totals: { count: number; eur: string; usdc: string };
};

type FilterKey = 'all' | 'paid' | 'free' | 'pinned' | 'refunded';

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'paid', label: 'Paid' },
  { id: 'free', label: 'Free' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'refunded', label: 'Refunded' },
];

const CHIP_STYLES: Record<FlashLogItem['chip']['kind'], { bg: string; fg: string; border: string }> = {
  free: {
    bg: 'rgba(100, 220, 160, 0.1)',
    fg: '#5ee0a3',
    border: 'rgba(100, 220, 160, 0.25)',
  },
  usdc: {
    bg: 'rgba(153, 69, 255, 0.12)',
    fg: '#b98bff',
    border: 'rgba(153, 69, 255, 0.25)',
  },
  eur: {
    bg: 'rgba(var(--casi-accent-rgb), 0.12)',
    fg: 'var(--casi-accent)',
    border: 'rgba(var(--casi-accent-rgb), 0.25)',
  },
};

export default function FlashesLog({ items, totals }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const counts = useMemo(
    () => ({
      all: items.length,
      paid: items.filter((i) => i.chip.kind !== 'free' && !i.refunded).length,
      free: items.filter((i) => i.chip.kind === 'free').length,
      pinned: items.filter((i) => i.pinned).length,
      refunded: items.filter((i) => i.refunded).length,
    }),
    [items],
  );

  const visible = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'paid') return items.filter((i) => i.chip.kind !== 'free' && !i.refunded);
    if (filter === 'free') return items.filter((i) => i.chip.kind === 'free');
    if (filter === 'pinned') return items.filter((i) => i.pinned);
    return items.filter((i) => i.refunded);
  }, [items, filter]);

  return (
    <section
      className="flex flex-col overflow-hidden"
      style={{
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '18px',
      }}
    >
      <header
        className="flex items-center justify-between"
        style={{ padding: '16px 18px', borderBottom: '1px solid var(--casi-border)' }}
      >
        <h3
          className="font-bold flex items-center gap-2"
          style={{ fontSize: '15px', letterSpacing: '-0.3px', color: 'var(--casi-text)' }}
        >
          <span aria-hidden style={{ color: 'var(--casi-accent)', fontSize: '16px' }}>
            ⚡
          </span>
          Flashes — live log
        </h3>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '10px',
            letterSpacing: '0.13em',
            color: 'var(--casi-text-dim)',
          }}
        >
          Today · <b style={{ color: 'var(--casi-accent)', fontWeight: 500 }}>{totals.count}</b> flashes ·{' '}
          <b style={{ color: 'var(--casi-accent)', fontWeight: 500 }}>{totals.eur}</b> +{' '}
          <b style={{ color: 'var(--casi-accent)', fontWeight: 500 }}>{totals.usdc}</b>
        </span>
      </header>

      <div
        className="flex gap-1"
        style={{
          padding: '8px 12px',
          background: 'var(--casi-bg)',
          borderBottom: '1px solid var(--casi-border)',
        }}
      >
        {FILTERS.map((opt) => {
          const on = filter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className="font-mono uppercase transition-colors"
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '10px',
                letterSpacing: '0.1em',
                color: on ? 'var(--casi-text)' : 'var(--casi-text-dim)',
                background: on ? 'var(--casi-surface)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {opt.label}
              <span style={{ color: 'var(--casi-accent)', marginLeft: '4px' }}>
                {counts[opt.id]}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
        {visible.length === 0 ? (
          <div
            className="font-mono uppercase text-center"
            style={{
              padding: '40px 16px',
              fontSize: '10px',
              letterSpacing: '0.15em',
              color: 'var(--casi-text-faint)',
            }}
          >
            No flashes match
          </div>
        ) : (
          visible.map((flash, idx) => <FlashRow key={flash.id} flash={flash} isLast={idx === visible.length - 1} />)
        )}
      </div>
    </section>
  );
}

function FlashRow({ flash, isLast }: { flash: FlashLogItem; isLast: boolean }) {
  const chip = CHIP_STYLES[flash.chip.kind];
  return (
    <div
      className="grid items-center gap-2.5 transition-colors"
      style={{
        gridTemplateColumns: 'auto auto 1fr auto',
        padding: '10px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--casi-border)',
        opacity: flash.refunded ? 0.45 : 1,
      }}
    >
      <span
        className="font-mono whitespace-nowrap"
        style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--casi-text-faint)' }}
      >
        {flash.time}
      </span>
      <span
        className="font-mono whitespace-nowrap"
        style={{
          padding: '3px 7px',
          borderRadius: '4px',
          background: chip.bg,
          color: chip.fg,
          border: `1px solid ${chip.border}`,
          fontSize: '10px',
          letterSpacing: '0.05em',
        }}
      >
        {flash.chip.label}
      </span>
      <div className="flex items-baseline gap-2 min-w-0" style={{ fontSize: '13px' }}>
        <span
          className="font-bold whitespace-nowrap"
          style={{ color: 'var(--casi-text)', fontFamily: 'var(--font-casi-sans)' }}
        >
          {flash.who}
        </span>
        <span
          className="truncate"
          style={{
            color: 'var(--casi-text-dim)',
            textDecoration: flash.refunded ? 'line-through' : 'none',
          }}
        >
          {flash.message}
        </span>
        {flash.pinned ? (
          <span
            className="font-mono uppercase ml-1 whitespace-nowrap"
            style={{
              fontSize: '9px',
              letterSpacing: '0.12em',
              color: 'var(--casi-accent)',
              padding: '2px 6px',
              border: '1px dashed rgba(var(--casi-accent-rgb), 0.4)',
              borderRadius: '3px',
            }}
          >
            Pinned
          </span>
        ) : null}
      </div>
      <div className="flex gap-1">
        {!flash.refunded ? (
          <>
            <FlashActButton variant="pin">{flash.pinned ? 'Unpin' : 'Pin'}</FlashActButton>
            <FlashActButton variant="refund">Refund</FlashActButton>
            <FlashActButton variant="block">Block</FlashActButton>
          </>
        ) : (
          <span
            className="font-mono uppercase"
            style={{
              padding: '4px 9px',
              borderRadius: '6px',
              border: '1px solid var(--casi-border-2)',
              color: 'var(--casi-text-faint)',
              fontSize: '10px',
              letterSpacing: '0.1em',
            }}
          >
            Refunded
          </span>
        )}
      </div>
    </div>
  );
}

function FlashActButton({
  variant,
  children,
}: {
  variant: 'pin' | 'refund' | 'block';
  children: string;
}) {
  return (
    <button
      type="button"
      data-variant={variant}
      className="flash-act font-mono uppercase transition-colors"
      style={{
        padding: '4px 9px',
        borderRadius: '6px',
        background: 'transparent',
        border: '1px solid var(--casi-border-2)',
        color: 'var(--casi-text-dim)',
        fontSize: '10px',
        letterSpacing: '0.1em',
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
