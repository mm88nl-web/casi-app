'use client';

import type { SlotShape } from '@/components/SlotCard';

const ALL_SHAPES: { id: SlotShape; label: string }[] = [
  { id: 'rect',     label: 'Rectangle' },
  { id: 'circle',   label: 'Circle'    },
  { id: 'custom',   label: 'Custom'    },
  { id: 'banner',   label: 'Banner'    },
  { id: 'backdrop', label: 'Backdrop'  },
];

type ShapeButtonGroupProps = {
  value: SlotShape;
  onChange: (shape: SlotShape) => void;
  /** Subset of shapes to expose. Defaults to all six. */
  shapes?: SlotShape[];
  /** Disable the entire group. */
  disabled?: boolean;
};

/**
 * Horizontal shape toggle used in /studio/live's slot control panel and
 * the viewer booking config. Tracks which shape is selected; caller owns
 * the state.
 */
export default function ShapeButtonGroup({
  value,
  onChange,
  shapes,
  disabled = false,
}: ShapeButtonGroupProps) {
  const items = shapes
    ? ALL_SHAPES.filter(s => shapes.includes(s.id))
    : ALL_SHAPES;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
      {items.map(item => {
        const on = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            disabled={disabled}
            aria-pressed={on}
            style={{
              padding: '5px 11px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 500,
              border: `1px solid ${on ? 'rgba(var(--casi-accent-rgb), 0.35)' : 'var(--casi-border-2)'}`,
              background: on ? 'rgba(var(--casi-accent-rgb), 0.09)' : 'transparent',
              color: on ? 'var(--casi-accent)' : 'var(--casi-text-dim)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              fontFamily: 'inherit',
              transition: 'all .13s',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
