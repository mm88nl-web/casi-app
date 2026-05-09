'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

export type RailItem = {
  id: string;
  label: string;
  /** Optional icon glyph. v7 layout doesn't render it; kept for callers
   *  that still want an icon column in their own layouts. */
  icon?: string;
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
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);

    if (observed.length === 0) return;

    const visibility = new Map<string, number>();
    const observer = new IntersectionObserver(
      entries => {
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

    observed.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * v7 settings layout. 160px sticky left rail with text-only links,
 * scrollable content column on the right. Active section shown by an
 * accent "·" prefix (no pill, no border, no icon). Stacks to single
 * column below 760px (rail hides).
 */
export default function SettingsLayout({ rail, children }: Props) {
  const ids = useMemo(() => rail.flatMap(g => g.items.map(i => i.id)), [rail]);
  const active = useActiveSection(ids);

  return (
    <div
      className="casi-st-layout"
      style={{
        display: 'grid',
        gridTemplateColumns: '160px minmax(0, 1fr)',
        gap: '40px',
        maxWidth: '980px',
        margin: '0 auto',
        padding: '36px 32px 80px',
        alignItems: 'start',
      }}
    >
      <style>{`
        @media (max-width: 760px) {
          .casi-st-layout { grid-template-columns: 1fr !important; padding: 20px 16px 60px !important; }
          .casi-st-rail { display: none !important; }
        }
      `}</style>

      <aside
        className="casi-st-rail"
        style={{
          position: 'sticky',
          top: '84px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {rail.map(group => (
          <div key={group.title}>
            <div
              className="font-mono uppercase"
              style={{
                fontFamily: 'var(--M), var(--font-casi-mono), monospace',
                fontSize: '9.5px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                color: 'var(--text-4, var(--casi-text-faint))',
                padding: '0 8px 6px',
              }}
            >
              {group.title}
            </div>
            {group.items.map(item => {
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className="casi-st-btn"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 8px',
                    borderRadius: 0,
                    fontSize: '13px',
                    fontWeight: 500,
                    color: isActive ? 'var(--text, var(--casi-text))' : 'var(--text-3, var(--casi-text-dim))',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'color .13s, background .13s',
                    fontFamily: 'inherit',
                  }}
                >
                  {isActive ? (
                    <span
                      aria-hidden
                      style={{
                        color: 'var(--ink, var(--casi-accent))',
                        fontSize: '18px',
                        marginRight: '4px',
                        lineHeight: 0,
                        verticalAlign: 'middle',
                      }}
                    >
                      ·
                    </span>
                  ) : null}
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}
