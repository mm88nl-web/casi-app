'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

export type RailItem = {
  id: string;
  label: string;
  icon: string;
};

export type RailGroup = {
  title: string;
  items: RailItem[];
};

type Props = {
  rail: RailGroup[];
  children: ReactNode;
};

function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState<string>(ids[0] ?? '');

  useEffect(() => {
    if (ids.length === 0) return;

    const observed = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);

    if (observed.length === 0) return;

    const visibility = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set(entry.target.id, entry.intersectionRatio);
        }
        let bestId = ids[0];
        let bestRatio = -1;
        for (const id of ids) {
          const ratio = visibility.get(id) ?? 0;
          if (ratio > bestRatio) {
            bestId = id;
            bestRatio = ratio;
          }
        }
        setActive(bestId);
      },
      { rootMargin: '-80px 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    observed.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function SettingsLayout({ rail, children }: Props) {
  const ids = useMemo(() => rail.flatMap((g) => g.items.map((i) => i.id)), [rail]);
  const active = useActiveSection(ids);

  return (
    <div
      className="mx-auto grid items-start gap-7"
      style={{
        maxWidth: '1200px',
        padding: '28px 32px 80px',
        gridTemplateColumns: 'minmax(0, 220px) minmax(0, 1fr)',
      }}
    >
      <aside
        className="sticky flex flex-col gap-0.5"
        style={{ top: '20px' }}
      >
        {rail.map((group) => (
          <div key={group.title}>
            <div
              className="font-mono uppercase"
              style={{
                fontSize: '9px',
                letterSpacing: '0.18em',
                color: 'var(--casi-text-faint)',
                padding: '14px 12px 6px',
              }}
            >
              {group.title}
            </div>
            {group.items.map((item) => {
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className="flex items-center gap-2.5 transition-colors"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    background: isActive
                      ? 'rgba(var(--casi-accent-rgb), 0.08)'
                      : 'transparent',
                    color: isActive ? 'var(--casi-accent)' : 'var(--casi-text-dim)',
                    border: `1px solid ${isActive ? 'rgba(var(--casi-accent-rgb), 0.2)' : 'transparent'}`,
                    textAlign: 'left',
                  }}
                >
                  <span
                    aria-hidden
                    className="font-mono"
                    style={{
                      width: '20px',
                      fontSize: '14px',
                      opacity: 0.7,
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
}
