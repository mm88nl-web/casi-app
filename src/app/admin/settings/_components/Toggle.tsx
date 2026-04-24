'use client';

type Props = {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
};

export default function Toggle({ on, onChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative shrink-0 rounded-full transition-colors"
      style={{
        width: '40px',
        height: '22px',
        background: on ? 'var(--casi-accent)' : 'var(--casi-border-2)',
        cursor: 'pointer',
        border: 'none',
        padding: 0,
      }}
    >
      <span
        aria-hidden
        className="absolute rounded-full transition-all"
        style={{
          top: '3px',
          left: on ? '21px' : '3px',
          width: '16px',
          height: '16px',
          background: '#fff',
        }}
      />
    </button>
  );
}
