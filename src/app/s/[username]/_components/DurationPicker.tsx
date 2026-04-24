'use client';

export type Duration = {
  minutes: number;
  priceLabel: string;
};

type Props = {
  options: Duration[];
  selectedMinutes: number;
  onSelect: (minutes: number) => void;
};

export default function DurationPicker({ options, selectedMinutes, onSelect }: Props) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const sel = option.minutes === selectedMinutes;
        return (
          <button
            key={option.minutes}
            type="button"
            onClick={() => onSelect(option.minutes)}
            className="text-center transition-colors font-mono"
            style={{
              padding: '14px 8px',
              background: sel ? 'rgba(var(--casi-accent-rgb), 0.05)' : 'var(--casi-bg)',
              border: `1px solid ${sel ? 'var(--casi-accent)' : 'var(--casi-border-2)'}`,
              borderRadius: '10px',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                fontSize: '18px',
                fontWeight: 500,
                color: sel ? 'var(--casi-accent)' : 'var(--casi-text)',
              }}
            >
              {option.minutes}m
            </div>
            <div
              className="uppercase"
              style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                color: sel ? 'var(--casi-accent)' : 'var(--casi-text-dim)',
                marginTop: '2px',
              }}
            >
              {option.priceLabel}
            </div>
          </button>
        );
      })}
    </div>
  );
}
