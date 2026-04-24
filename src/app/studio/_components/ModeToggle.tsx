'use client';

export type StudioMode = 'monitor' | 'setup';

type Props = {
  mode: StudioMode;
  onChange: (next: StudioMode) => void;
  pendingCount: number;
};

type Option = {
  id: StudioMode;
  icon: string;
  label: string;
};

const OPTIONS: Option[] = [
  { id: 'monitor', icon: '◉', label: 'Dashboard' },
  { id: 'setup', icon: '⚙', label: 'Live' },
];

export default function ModeToggle({ mode, onChange, pendingCount }: Props) {
  const hint = mode === 'monitor' ? "Live · what's happening now" : 'Slots · prices · approvals';
  return (
    <div className="flex items-center justify-between gap-5">
      <div
        className="inline-flex gap-0.5"
        style={{
          background: 'var(--casi-surface)',
          border: '1px solid var(--casi-border)',
          borderRadius: '12px',
          padding: '4px',
        }}
      >
        {OPTIONS.map((opt) => {
          const active = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className="inline-flex items-center gap-2 font-bold transition-colors"
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                background: active ? 'var(--casi-accent)' : 'transparent',
                color: active ? '#0a0a0a' : 'var(--casi-text-dim)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-casi-sans)',
                fontSize: '13px',
                letterSpacing: '-0.1px',
              }}
            >
              <span
                aria-hidden
                className="font-mono"
                style={{ width: '14px', fontSize: '11px' }}
              >
                {opt.icon}
              </span>
              {opt.label}
              {opt.id === 'monitor' && pendingCount > 0 ? (
                <span
                  className="font-mono"
                  style={{
                    padding: '2px 6px',
                    borderRadius: '999px',
                    background: active ? 'rgba(0, 0, 0, 0.25)' : 'rgba(var(--casi-accent-rgb), 0.15)',
                    color: active ? '#0a0a0a' : 'var(--casi-accent)',
                    fontSize: '10px',
                    letterSpacing: '0.1em',
                  }}
                >
                  {pendingCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <span
        className="font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.15em',
          color: 'var(--casi-text-faint)',
        }}
      >
        {hint}
      </span>
    </div>
  );
}
