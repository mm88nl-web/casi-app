'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Screen = { num: string; name: string; href: string };

const SCREENS: Screen[] = [
  { num: '01', name: 'Landing',       href: '/' },
  { num: '02', name: 'Viewer · book', href: '/overlay' },
  { num: '03', name: 'Studio · dash', href: '/studio' },
  { num: '04', name: 'Studio · live', href: '/studio/live' },
  { num: '05', name: 'Settings',      href: '/studio/settings' },
  { num: '06', name: 'Auth',          href: '/login' },
];

/**
 * Floating screen switcher at the bottom of the viewport — port of v9's `.ss-bar`.
 * Renders only when not in production. Hotkeys 1-6 jump between routes.
 *
 * Toggle off entirely by setting `localStorage.casi-v9-devbar = 'off'`.
 */
export function DevScreenSwitcher() {
  const pathname = usePathname() ?? '/';
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV === 'production') return;
    const stored = window.localStorage.getItem('casi-v9-devbar');
    // Hydration-gated client-only init — initial render is SSR-safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(stored !== 'off');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (/^(input|textarea|select)$/i.test(target.tagName) || target.isContentEditable)
      ) {
        return;
      }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= SCREENS.length) {
        e.preventDefault();
        window.location.href = SCREENS[n - 1].href;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  if (!enabled) return null;

  // best-effort active highlight — exact match for landing, prefix match elsewhere
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <>
      <div className="casi-v9-ss-bar" role="navigation" aria-label="Dev screen switcher">
        <div className="casi-v9-ss-logo">
          <span className="casi-v9-ss-logo-dot" />
          <span className="casi-v9-ss-logo-txt">Casi · v9 dev</span>
        </div>
        {SCREENS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`casi-v9-ss-tab${isActive(s.href) ? ' casi-v9-ss-on' : ''}`}
          >
            <span className="casi-v9-ss-num">{s.num}</span>
            <span className="casi-v9-ss-name">{s.name}</span>
          </Link>
        ))}
        <button
          type="button"
          className="casi-v9-ss-close"
          onClick={() => {
            window.localStorage.setItem('casi-v9-devbar', 'off');
            setEnabled(false);
          }}
          aria-label="Hide dev switcher"
          title="Hide (re-enable via DevTools: localStorage.removeItem('casi-v9-devbar'))"
        >
          ×
        </button>
      </div>
      <style jsx>{`
        .casi-v9-ss-bar {
          position: fixed;
          left: 50%;
          bottom: 20px;
          transform: translateX(-50%);
          z-index: 2147483646;
          display: flex;
          align-items: center;
          gap: 0;
          background: #1a1a1f;
          color: #fff;
          box-shadow:
            0 14px 50px rgba(0, 0, 0, 0.32),
            0 2px 0 rgba(0, 0, 0, 0.4);
          border: 1px solid #2a2a30;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .casi-v9-ss-logo {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          border-right: 1px solid #2a2a30;
        }
        .casi-v9-ss-logo-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #d97757;
        }
        .casi-v9-ss-logo-txt {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #9a9a9f;
        }
        .casi-v9-ss-bar :global(.casi-v9-ss-tab) {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1px;
          padding: 10px 14px;
          background: transparent;
          border-right: 1px solid #2a2a30;
          color: #9a9a9f;
          transition: all 0.14s;
          font-family: inherit;
          text-decoration: none;
        }
        .casi-v9-ss-bar :global(.casi-v9-ss-tab:hover) {
          background: #222228;
          color: #fff;
        }
        .casi-v9-ss-bar :global(.casi-v9-ss-on) {
          background: #d97757;
          color: #fff;
        }
        .casi-v9-ss-bar :global(.casi-v9-ss-num) {
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          opacity: 0.7;
        }
        .casi-v9-ss-bar :global(.casi-v9-ss-on .casi-v9-ss-num) {
          opacity: 0.9;
        }
        .casi-v9-ss-bar :global(.casi-v9-ss-name) {
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: -0.005em;
          line-height: 1.1;
        }
        .casi-v9-ss-close {
          padding: 0 12px;
          align-self: stretch;
          background: transparent;
          color: #5a5a5f;
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          border: none;
        }
        .casi-v9-ss-close:hover {
          color: #fff;
        }
      `}</style>
    </>
  );
}
