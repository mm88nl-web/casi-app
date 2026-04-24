'use client';

type BlockChipProps = {
  label: string;
  onRemove: () => void;
};

export function BlockChip({ label, onRemove }: BlockChipProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono"
      style={{
        padding: '6px 10px',
        borderRadius: '999px',
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        color: '#f87171',
        fontSize: '11px',
      }}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="cursor-pointer opacity-50 transition-opacity hover:opacity-100"
        style={{ background: 'transparent', border: 'none', color: 'inherit', padding: 0 }}
      >
        ×
      </button>
    </span>
  );
}

type AddChipProps = {
  onClick: () => void;
  children: string;
};

export function AddChip({ onClick, children }: AddChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer font-mono"
      style={{
        padding: '6px 10px',
        borderRadius: '999px',
        background: 'var(--casi-bg)',
        border: '1px dashed var(--casi-border-2)',
        color: 'var(--casi-text-dim)',
        fontSize: '11px',
      }}
    >
      {children}
    </button>
  );
}
