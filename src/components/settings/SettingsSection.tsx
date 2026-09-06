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
 * Studio-redesign section: title + description sit on the page background,
 * the actual controls live inside a rounded chrome card — matches the
 * design_handoff prototype's settings sections (each `#sec-*` block is a
 * heading + description followed by a `border-radius:20px` card). Replaces
 * the earlier v9 flat/divider-only layout; SettingsLayout's own gap between
 * sections now does the vertical separation instead of a border-top.
 */
export default function SettingsSection({ id, title, desc, actions, danger, children }: Props) {
  return (
    <section id={id} style={{ scrollMarginTop: '80px' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '14px',
          marginBottom: '16px',
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: 'var(--H)',
              fontWeight: 800,
              fontVariationSettings: '"opsz" 64',
              fontSize: '26px',
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              marginBottom: '8px',
              color: danger ? '#f87171' : 'var(--text)',
            }}
          >
            {title}
          </h2>
          {desc ? (
            <p
              style={{
                fontFamily: 'var(--S)',
                fontStyle: 'italic',
                fontSize: '15px',
                color: 'var(--text-2)',
                lineHeight: 1.5,
                maxWidth: '560px',
              }}
            >
              {desc}
            </p>
          ) : null}
        </div>
        {actions ? <div style={{ flexShrink: 0 }}>{actions}</div> : null}
      </header>
      <div
        className="casi-card"
        style={{
          padding: '20px 22px',
          borderColor: danger ? 'rgba(239, 68, 68, 0.3)' : undefined,
        }}
      >
        {children}
      </div>
    </section>
  );
}
