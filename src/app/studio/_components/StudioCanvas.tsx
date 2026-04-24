'use client';

import CasiLogo from '@/components/CasiLogo';

export type CanvasSlotState = 'selected' | 'active' | 'off' | 'idle';

export type CanvasSlot = {
  id: string;
  tag: string;
  price: string;
  state: CanvasSlotState;
  // percentage-based positioning; any combo of top/right/bottom/left
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  width: string;
  height: string;
};

type Props = {
  slots: CanvasSlot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function stateColors(state: CanvasSlotState) {
  switch (state) {
    case 'selected':
      return {
        border: 'var(--casi-accent)',
        borderStyle: 'solid',
        bg: 'rgba(var(--casi-accent-rgb), 0.18)',
        tag: 'var(--casi-accent)',
        price: 'var(--casi-text)',
        shadow: '0 0 0 3px rgba(var(--casi-accent-rgb), 0.15)',
      };
    case 'active':
      return {
        border: 'var(--casi-accent2)',
        borderStyle: 'solid',
        bg: 'rgba(var(--casi-accent2-rgb), 0.18)',
        tag: 'var(--casi-accent2)',
        price: 'var(--casi-text)',
        shadow: 'none',
      };
    case 'off':
      return {
        border: 'rgba(255, 255, 255, 0.15)',
        borderStyle: 'dashed',
        bg: 'rgba(255, 255, 255, 0.03)',
        tag: 'var(--casi-text-faint)',
        price: 'var(--casi-text-faint)',
        shadow: 'none',
      };
    default:
      return {
        border: 'rgba(var(--casi-accent-rgb), 0.55)',
        borderStyle: 'dashed',
        bg: 'rgba(var(--casi-accent-rgb), 0.05)',
        tag: 'var(--casi-accent)',
        price: 'var(--casi-text)',
        shadow: 'none',
      };
  }
}

export default function StudioCanvas({ slots, selectedId, onSelect }: Props) {
  return (
    <section
      className="flex flex-col gap-3.5"
      style={{
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '18px',
        padding: '18px',
      }}
    >
      <header className="flex items-center justify-between">
        <h3
          className="font-bold"
          style={{ fontSize: '15px', letterSpacing: '-0.3px', color: 'var(--casi-text)' }}
        >
          Your ad slots
        </h3>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '10px',
            letterSpacing: '0.15em',
            color: 'var(--casi-text-faint)',
          }}
        >
          Click a slot to edit
        </span>
      </header>

      <div
        className="relative overflow-hidden"
        style={{
          aspectRatio: '16/9',
          borderRadius: '12px',
          border: '1px solid var(--casi-border-2)',
          background:
            'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.02) 0 12px, transparent 12px 24px), linear-gradient(180deg, #1a1d24 0%, #0e1015 60%, #08090d 100%)',
        }}
      >
        <span
          className="absolute font-mono uppercase"
          style={{
            top: '12px',
            left: '12px',
            fontSize: '9px',
            letterSpacing: '0.15em',
            color: 'var(--casi-text-faint)',
          }}
        >
          LIVE PREVIEW · what viewers see
        </span>

        {/* Mock gameplay area */}
        <div
          aria-hidden
          className="absolute"
          style={{
            inset: '20% 30% 20% 12%',
            borderRadius: '6px',
            background:
              'radial-gradient(circle at 30% 40%, rgba(var(--casi-accent2-rgb), 0.4), transparent 50%), radial-gradient(circle at 70% 60%, rgba(var(--casi-accent-rgb), 0.35), transparent 55%), linear-gradient(135deg, #2a1f3a 0%, #141827 100%)',
            opacity: 0.55,
          }}
        />

        <div
          aria-hidden
          className="absolute"
          style={{ bottom: '10px', right: '10px', opacity: 0.45, pointerEvents: 'none', zIndex: 1 }}
        >
          <CasiLogo size={44} color="#ffffff" opacity={1} />
        </div>

        {slots.map((slot) => {
          const isSelected = slot.id === selectedId;
          const effectiveState = isSelected ? 'selected' : slot.state;
          const c = stateColors(effectiveState);
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => onSelect(slot.id)}
              className="absolute flex flex-col justify-between transition-colors"
              style={{
                top: slot.top,
                right: slot.right,
                bottom: slot.bottom,
                left: slot.left,
                width: slot.width,
                height: slot.height,
                border: `2px ${c.borderStyle} ${c.border}`,
                background: c.bg,
                borderRadius: '8px',
                cursor: 'pointer',
                padding: '8px 10px',
                boxShadow: c.shadow,
              }}
            >
              <span
                className="font-mono uppercase font-medium"
                style={{ fontSize: '10px', letterSpacing: '0.15em', color: c.tag, textAlign: 'left' }}
              >
                {slot.tag}
              </span>
              <span
                className="font-mono self-end"
                style={{ fontSize: '11px', color: c.price }}
              >
                {slot.price}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
