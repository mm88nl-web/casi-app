import type { ReactNode } from 'react';

type Props = {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function FieldRow({ label, hint, children, className }: Props) {
  return (
    <div className={className}>
      <label
        className="mb-1.5 block font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.15em',
          color: 'var(--casi-text-faint)',
        }}
      >
        {label}
      </label>
      {children}
      {hint ? (
        <div
          className="mt-1.5 font-mono uppercase"
          style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: 'var(--casi-text-faint)',
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export const settingsInputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--casi-bg)',
  border: '1px solid var(--casi-border-2)',
  borderRadius: 0,
  padding: '11px 14px',
  fontFamily: 'var(--font-casi-mono)',
  fontSize: '13px',
  color: 'var(--casi-text)',
  transition: 'border-color 0.15s',
};

export const settingsTextareaStyle: React.CSSProperties = {
  ...settingsInputStyle,
  minHeight: '80px',
  resize: 'vertical',
  fontFamily: 'inherit',
  fontSize: '14px',
  lineHeight: 1.5,
};
