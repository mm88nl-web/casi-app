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
 * v9 flat section. Vertical-only border-top divider between sections, no
 * card wrapper. First section drops the divider. The h2 picks up the
 * dashboard's Bricolage display token (`var(--H)`) so streamers don't
 * see a font-family flip when bouncing between /studio and
 * /studio/settings.
 */
export default function SettingsSection({ id, title, desc, actions, danger, children }: Props) {
  return (
    <section
      id={id}
      className="casi-st-sec"
      style={{
        padding: '32px 0 36px',
        borderTop: `1px solid ${danger ? 'rgba(239, 68, 68, 0.2)' : 'var(--line, var(--casi-border))'}`,
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
              fontFamily: 'var(--H), var(--font-casi-display), var(--font-casi-sans), sans-serif',
              fontWeight: 800,
              fontSize: '22px',
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              marginBottom: '6px',
              color: danger ? '#f87171' : 'var(--text, var(--casi-text))',
            }}
          >
            {title}
          </h2>
          {desc ? (
            <p
              style={{
                fontFamily: 'var(--B), var(--font-casi-sans), sans-serif',
                fontSize: '13px',
                color: 'var(--text-3, var(--casi-text-mid))',
                lineHeight: 1.6,
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
