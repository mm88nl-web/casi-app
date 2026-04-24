import type { ReactNode } from 'react';

type Props = {
  id?: string;
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  danger?: boolean;
  children: ReactNode;
};

export default function SettingsSection({ id, title, desc, actions, danger, children }: Props) {
  return (
    <section
      id={id}
      className="rounded-2xl p-6"
      style={{
        background: 'var(--casi-surface)',
        border: `1px solid ${danger ? 'rgba(239, 68, 68, 0.2)' : 'var(--casi-border)'}`,
      }}
    >
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2
            className="font-semibold"
            style={{
              fontSize: '18px',
              letterSpacing: '-0.3px',
              color: danger ? '#f87171' : 'var(--casi-text)',
            }}
          >
            {title}
          </h2>
          {desc ? (
            <p
              className="mt-1 max-w-[520px] leading-[1.5]"
              style={{ fontSize: '13px', color: 'var(--casi-text-dim)' }}
            >
              {desc}
            </p>
          ) : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
