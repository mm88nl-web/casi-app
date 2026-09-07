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
        gridTemplateColumns: '200px minmax(0, 1fr)',
        gap: '36px',
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '32px 32px 80px',
        alignItems: 'start',
      }}
    >
      <style>{`
        @media (max-width: 760px) {
          /* Was a bare 1fr — a grid track sized as plain 1fr (unlike
             the desktop rule's minmax(0, 1fr) two lines up) carries an
             IMPLICIT automatic minimum equal to its content's min-content
             size, not 0. Any wide child forced the whole track — and with
             it the whole page — wider than the viewport instead of
             shrinking to fit, which is exactly why this page kept needing
             horizontal scroll through several rounds of unrelated padding
             fixes: this was the actual structural cause the whole time.
             Confirmed live: the Skin picker's swatch grid
             (repeat(auto-fill, minmax(150px, 1fr))) was the specific
             child wide enough to trigger it, cutting its third column off
             past the screen edge. minmax(0, 1fr) matches the desktop
             rule's own safety property, just at 100% width instead of
             the second of two columns. */
          .casi-st-layout { grid-template-columns: minmax(0, 1fr) !important; padding: 20px 16px 60px !important; }
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
          gap: '22px',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--H)',
              fontWeight: 800,
              fontVariationSettings: '"opsz" 64',
              fontSize: '32px',
              letterSpacing: '-0.03em',
              color: 'var(--text)',
            }}
          >
            Settings
          </div>
        </div>
        {rail.map(group => (
          <div key={group.title}>
            <div
              className="font-mono uppercase"
              style={{
                fontFamily: 'var(--M)',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                color: 'var(--text-3)',
                padding: '0 12px 8px',
              }}
            >
              {group.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-row)',
                      fontFamily: 'var(--B)',
                      fontSize: '15px',
                      fontWeight: 500,
                      letterSpacing: '-0.01em',
                      color: isActive ? 'var(--on-ink)' : 'var(--text-2)',
                      background: isActive ? 'var(--ink)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'color .13s, background .13s',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>{children}</div>
    </div>
  );
}
