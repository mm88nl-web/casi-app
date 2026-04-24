'use client';

import type { ReactNode } from 'react';

export type PayMethod = 'card' | 'usdc';

type Option = {
  id: PayMethod;
  logo: ReactNode;
  title: ReactNode;
  description: string;
};

const OPTIONS: Option[] = [
  {
    id: 'card',
    logo: (
      <div
        className="flex items-center justify-center font-bold"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          background: '#635BFF',
          color: '#fff',
          fontFamily: 'var(--font-casi-sans)',
          fontSize: '9px',
          letterSpacing: '-0.3px',
        }}
      >
        stripe
      </div>
    ),
    title: 'Card',
    description: 'Visa · Mastercard · Amex',
  },
  {
    id: 'usdc',
    logo: (
      <div
        className="flex items-center justify-center font-mono font-semibold"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          background: 'linear-gradient(135deg, #9945FF, #14F195)',
          color: '#0a0a0a',
          fontSize: '16px',
        }}
      >
        ◎
      </div>
    ),
    title: 'USDC',
    description: 'Solana · on-chain',
  },
];

type Props = {
  selected: PayMethod;
  onSelect: (method: PayMethod) => void;
  usdcAmountLabel: string;
};

export default function PayRailPicker({ selected, onSelect, usdcAmountLabel }: Props) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {OPTIONS.map((opt) => {
          const sel = opt.id === selected;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className="flex items-center gap-2.5 transition-colors"
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: sel ? 'rgba(var(--casi-accent-rgb), 0.05)' : 'var(--casi-bg)',
                border: `1px solid ${sel ? 'var(--casi-accent)' : 'var(--casi-border-2)'}`,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {opt.logo}
              <div>
                <div
                  className="font-semibold"
                  style={{ fontSize: '14px', color: 'var(--casi-text)' }}
                >
                  {opt.title}
                </div>
                <div
                  className="font-mono uppercase"
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.1em',
                    color: 'var(--casi-text-dim)',
                    marginTop: '1px',
                  }}
                >
                  {opt.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selected === 'card' ? (
        <div
          className="flex items-center gap-2.5 font-mono"
          style={{
            padding: '12px 14px',
            background:
              'linear-gradient(90deg, rgba(99,91,255,0.08), rgba(99,91,255,0.02))',
            border: '1px solid rgba(99,91,255,0.35)',
            borderRadius: '10px',
            fontSize: '11px',
            letterSpacing: '0.04em',
            color: 'var(--casi-text-dim)',
            lineHeight: 1.5,
          }}
        >
          <span aria-hidden style={{ opacity: 0.7 }}>
            🔒
          </span>
          <span>Secured by Stripe · card entered on the next step · Casi never sees your card</span>
        </div>
      ) : (
        <div
          className="flex flex-col gap-2"
          style={{
            padding: '14px 16px',
            background: 'var(--casi-bg)',
            border: '1px solid var(--casi-border-2)',
            borderRadius: '10px',
          }}
        >
          <UsdcRow label="From" value="7vK…9Qs · Devnet" />
          <UsdcRow label="Balance" value="42.50 USDC" />
          <UsdcRow label="Held in escrow" value={usdcAmountLabel} emphasize />
          <p
            className="font-mono"
            style={{
              marginTop: '4px',
              fontSize: '10px',
              letterSpacing: '0.04em',
              color: 'var(--casi-text-faint)',
              lineHeight: 1.5,
            }}
          >
            Funds go to an on-chain escrow contract. Released to the streamer minute-by-minute —
            refundable until approved.
          </p>
        </div>
      )}
    </div>
  );
}

function UsdcRow({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span
        className="font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.16em',
          color: 'var(--casi-text-dim)',
        }}
      >
        {label}
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: '13px',
          color: emphasize ? 'var(--casi-accent)' : 'var(--casi-text)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
