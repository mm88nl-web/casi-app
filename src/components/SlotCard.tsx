'use client';

import type { ReactNode } from 'react';

export type SlotShape = 'rect' | 'rounded' | 'circle' | 'hex' | 'banner' | 'backdrop';
export type SlotState = 'idle' | 'selected' | 'in-use';

type SlotCardProps = {
  shape: SlotShape;
  /** Human label e.g. "Hex slot" or "Banner". */
  label: string;
  /** Pre-formatted price e.g. "$3/min" or "2 USDC/flash". */
  price: string;
  state?: SlotState;
  /** Optional right-side tag e.g. "1 waiting". */
  queueTag?: ReactNode;
  /** Optional explicit icon glyph; defaults to a shape-appropriate symbol. */
  icon?: ReactNode;
  onClick?: () => void;
};

const DEFAULT_GLYPH: Record<SlotShape, string> = {
  rect: '▶',
  rounded: '▢',
  circle: '●',
  hex: '✦',
  banner: '▰▰▰',
  backdrop: '🖼',
};

/**
 * Viewer-side slot row used in the booking surface (`/overlay`,
 * `/s/[username]`). The visual shape of the icon mirrors the on-stream
 * slot — hex slots render with a hex clip-path icon, banners with a long
 * pill, etc. The state prop drives selection / occupied styling; clicking
 * an idle card flips state to `selected` upstream.
 */
export default function SlotCard({
  shape,
  label,
  price,
  state = 'idle',
  queueTag,
  icon,
  onClick,
}: SlotCardProps) {
  const occupied = state === 'in-use';
  const selected = state === 'selected';

  // Shape icon: bespoke per-shape clip-path / dimensions, otherwise a
  // generic 44x44 accent-tinted square.
  const iconStyle = ((): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: '44px',
      height: '44px',
      borderRadius: '8px',
      flexShrink: 0,
      border: '1.5px solid rgba(var(--casi-accent-rgb), 0.25)',
      background: 'rgba(var(--casi-accent-rgb), 0.04)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '14px',
      color: 'var(--casi-accent)',
    };
    if (occupied) {
      base.borderColor = 'rgba(20, 241, 149, 0.4)';
      base.background = 'rgba(20, 241, 149, 0.05)';
      base.color = '#14F195';
    }
    if (shape === 'hex') {
      base.clipPath = 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)';
      base.border = 'none';
      base.background = occupied ? 'rgba(20, 241, 149, 0.07)' : 'rgba(var(--casi-accent-rgb), 0.07)';
    } else if (shape === 'circle') {
      base.borderRadius = '50%';
    } else if (shape === 'banner') {
      base.width = '80px';
      base.height = '24px';
      base.borderRadius = '4px';
      base.fontSize = '8px';
      base.letterSpacing = '1px';
    } else if (shape === 'rounded') {
      base.borderRadius = '12px';
    }
    return base;
  })();

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 16px',
    borderRadius: '10px',
    background: selected ? 'rgba(var(--casi-accent-rgb), 0.06)' : 'var(--casi-surface-2)',
    border: `1px solid ${selected ? 'var(--casi-accent)' : 'var(--casi-border)'}`,
    cursor: occupied ? 'not-allowed' : (onClick ? 'pointer' : 'default'),
    opacity: occupied ? 0.55 : 1,
    textAlign: 'left',
    width: '100%',
    transition: 'border-color .16s, background .16s',
    fontFamily: 'inherit',
    color: 'inherit',
  };

  const inner = (
    <>
      <span style={iconStyle}>{icon ?? DEFAULT_GLYPH[shape]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '-0.05px', marginBottom: '2px' }}>
          {label}
          {occupied ? <span style={{ color: 'var(--casi-text-mid)', fontWeight: 400 }}> · In use</span> : null}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-casi-mono), monospace',
            fontSize: '12px',
            color: occupied ? '#14F195' : 'var(--casi-accent)',
          }}
        >
          {price}
        </div>
      </div>
      {queueTag ? (
        <span
          style={{
            fontFamily: 'var(--font-casi-mono), monospace',
            fontSize: '9.5px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--casi-text-dim)',
            flexShrink: 0,
          }}
        >
          {queueTag}
        </span>
      ) : null}
    </>
  );

  if (occupied || !onClick) {
    return <div style={cardStyle}>{inner}</div>;
  }

  return (
    <button type="button" onClick={onClick} style={cardStyle}>
      {inner}
    </button>
  );
}
