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
        className="mb-2 block font-mono uppercase"
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: 'var(--text-2)',
        }}
      >
        {label}
      </label>
      {children}
      {hint ? (
        <div
          className="mt-1.5"
          style={{
            fontFamily: 'var(--S)',
            fontStyle: 'italic',
            fontSize: '13px',
            color: 'var(--text-3)',
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
  background: 'var(--surf-2)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-chip)',
  padding: '13px 15px',
  // Upright Newsreader (not italic) — matches the prototype's editable
  // text fields (Display name, Bio, Handle). Italic Newsreader is reserved
  // for hints/captions/secondary meta, not the value the streamer types.
  fontFamily: 'var(--S)',
  fontSize: '15px',
  color: 'var(--text)',
  transition: 'border-color 0.15s',
};

export const settingsTextareaStyle: React.CSSProperties = {
  ...settingsInputStyle,
  minHeight: '90px',
  resize: 'vertical',
  lineHeight: 1.5,
};
