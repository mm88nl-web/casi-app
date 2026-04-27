import type { ReactNode } from 'react';

type Props = {
  id?: string;
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  danger?: boolean;
  children: ReactNode;
};

/**
 * v7 flat section. Vertical-only border-top divider between sections,
 * no card wrapper. First section drops the divider. 16px title (smaller
 * than v3's 18px), 12.5px description capped at 440px.
 */
export default function SettingsSection({ id, title, desc, actions, danger, children }: Props) {
  return (
    <section
      id={id}
      className="casi-st-sec"
      style={{
        padding: '32px 0 36px',
        borderTop: `1px solid ${danger ? 'rgba(239, 68, 68, 0.2)' : 'var(--casi-border)'}`,
      }}
    >
      <style>{`
        .casi-st-sec:first-child { border-top: none !important; padding-top: 0 !important; }
      `}</style>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '14px',
          marginBottom: '22px',
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-casi-display), var(--font-casi-sans), sans-serif',
              fontWeight: 700,
              fontSize: '16px',
              letterSpacing: '-0.3px',
              marginBottom: '4px',
              color: danger ? '#f87171' : 'var(--casi-text)',
            }}
          >
            {title}
          </h2>
          {desc ? (
            <p
              style={{
                fontSize: '12.5px',
                color: 'var(--casi-text-mid)',
                lineHeight: 1.65,
                maxWidth: '440px',
              }}
            >
              {desc}
            </p>
          ) : null}
        </div>
        {actions ? <div style={{ flexShrink: 0 }}>{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
