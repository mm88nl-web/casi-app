'use client';
import { SHAPE_PRESETS } from '@/lib/shapes';

export default function ShapePresetsPanel({
  selectedPath,
  onSelect,
}: {
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6, fontFamily: 'var(--M)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        Pick a shape
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
        {SHAPE_PRESETS.map((preset) => {
          const active = selectedPath === preset.path;
          return (
            <button
              key={preset.id}
              type="button"
              title={preset.label}
              onClick={() => onSelect(preset.path)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '7px 4px 5px',
                borderRadius: 6,
                border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
                background: active ? 'rgba(var(--ink-rgb,13,207,176), 0.1)' : 'transparent',
                cursor: 'pointer',
                color: active ? 'var(--ink)' : 'var(--text-3)',
                transition: 'all .12s',
              }}
            >
              <svg viewBox="0 0 1 1" width={26} height={26} style={{ fill: 'currentColor', display: 'block' }}>
                <path d={preset.path} />
              </svg>
              <span style={{ fontSize: 8.5, fontFamily: 'var(--M)', letterSpacing: '-0.01em', lineHeight: 1 }}>
                {preset.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
