'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useIsOverlayRoute } from '@/lib/use-is-overlay-route';

const DISMISS_KEY = 'casi-cookie-notice-dismissed-v1';

export function CookieNotice() {
  const [visible, setVisible] = useState(false);
  const isOverlay = useIsOverlayRoute();

  useEffect(() => {
    try {
      if (!localStorage.getItem(DISMISS_KEY)) setVisible(true);
    } catch {
      // localStorage blocked (private mode / iframe). Don't show — we
      // can't persist the dismissal either, so the banner would never
      // go away.
    }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    setVisible(false);
  };

  // OBS browser sources can't click through banners without Interact mode,
  // and the notice copy is meaningless on a stream canvas anyway.
  if (isOverlay) return null;
  if (!visible) return null;

  return (
    <div role="region" aria-label="Cookie notice" style={wrap}>
      <div style={inner}>
        <p style={text}>
          casi uses essential cookies for authentication and your theme preference.
          No tracking, no advertising, no third-party analytics.{' '}
          <Link href="/legal/privacy" style={link}>Privacy policy</Link>
          {' · '}
          <Link href="/legal/imprint" style={link}>Imprint</Link>.
        </p>
        <button onClick={dismiss} style={btn} aria-label="Dismiss cookie notice">
          Got it
        </button>
      </div>
    </div>
  );
}

const wrap = {
  position: 'fixed' as const,
  insetInline: 0,
  bottom: 0,
  zIndex: 9999,
  background: 'var(--surf, #0c0d11)',
  borderTop: '1px solid var(--line, #27272a)',
  padding: '12px 16px',
  boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
};

const inner = {
  maxWidth: 1100,
  margin: '0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap' as const,
};

const text = {
  margin: 0,
  flex: '1 1 320px',
  color: 'var(--text-2, #a1a1aa)',
  fontFamily: 'var(--M, ui-monospace, monospace)',
  fontSize: 12,
  lineHeight: 1.55,
};

const link = {
  color: 'var(--ink, #0DCFB0)',
  textDecoration: 'underline',
};

const btn = {
  flex: '0 0 auto',
  padding: '8px 16px',
  border: '1px solid var(--ink, #0DCFB0)',
  background: 'transparent',
  color: 'var(--ink, #0DCFB0)',
  fontFamily: 'var(--M, ui-monospace, monospace)',
  fontSize: 12,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
  cursor: 'pointer',
  borderRadius: 6,
};
