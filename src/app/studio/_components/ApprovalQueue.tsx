'use client';

import { useMemo, useState } from 'react';

export type QueueItem = {
  id: string;
  kind: 'beam' | 'flash';
  name: string;
  subtitle: string;
  priceLabel: string;
};

type Props = {
  items: QueueItem[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

type FilterKey = 'all' | 'beam' | 'flash';

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'beam', label: 'Beam' },
  { id: 'flash', label: 'Flash' },
];

export default function ApprovalQueue({ items, onApprove, onReject }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const counts = useMemo(
    () => ({
      all: items.length,
      beam: items.filter((i) => i.kind === 'beam').length,
      flash: items.filter((i) => i.kind === 'flash').length,
    }),
    [items],
  );

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );

  return (
    <section
      className="overflow-hidden"
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
          className="font-bold"
          style={{ fontSize: '15px', letterSpacing: '-0.3px', color: 'var(--casi-text)' }}
        >
          Pending approval
        </h3>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '10px',
            letterSpacing: '0.15em',
            color: 'var(--casi-text-faint)',
          }}
        >
          Reject = instant refund · {items.length} waiting
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

      {visible.length === 0 ? (
        <div
          className="font-mono uppercase text-center"
          style={{
            padding: '32px 16px',
            fontSize: '10px',
            letterSpacing: '0.15em',
            color: 'var(--casi-text-faint)',
          }}
        >
          Nothing waiting
        </div>
      ) : (
        visible.map((item, idx) => (
          <div
            key={item.id}
            className="grid items-center gap-2.5"
            style={{
              gridTemplateColumns: 'auto 1fr auto',
              padding: '12px 16px',
              borderBottom: idx === visible.length - 1 ? 'none' : '1px solid var(--casi-border)',
            }}
          >
            <span
              className="text-center font-mono uppercase"
              style={{
                width: '44px',
                padding: '4px 6px',
                borderRadius: '6px',
                background: 'rgba(var(--casi-accent-rgb), 0.1)',
                color: 'var(--casi-accent)',
                fontSize: '9px',
                letterSpacing: '0.1em',
              }}
            >
              {item.kind === 'beam' ? 'Beam' : 'Flash'}
            </span>
            <div>
              <div
                className="font-semibold"
                style={{ fontSize: '13px', color: 'var(--casi-text)', lineHeight: 1.3 }}
              >
                {item.name}
              </div>
              <div
                className="font-mono uppercase"
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  color: 'var(--casi-text-dim)',
                  marginTop: '3px',
                }}
              >
                {item.subtitle}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="mr-1 font-mono font-medium"
                style={{ fontSize: '13px', color: 'var(--casi-accent)' }}
              >
                {item.priceLabel}
              </span>
              <button
                type="button"
                onClick={() => onReject(item.id)}
                className="font-extrabold transition-colors"
                title={`Reject · ${item.priceLabel} refunded`}
                style={{
                  padding: '7px 11px',
                  borderRadius: '7px',
                  background: 'transparent',
                  color: 'var(--casi-text-dim)',
                  border: '1px solid var(--casi-border-2)',
                  fontFamily: 'var(--font-casi-sans)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
              <button
                type="button"
                onClick={() => onApprove(item.id)}
                className="font-extrabold"
                style={{
                  padding: '7px 11px',
                  borderRadius: '7px',
                  background: 'var(--casi-accent)',
                  color: '#050505',
                  border: 'none',
                  fontFamily: 'var(--font-casi-sans)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Approve
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
