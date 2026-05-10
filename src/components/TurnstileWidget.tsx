'use client';

/**
 * Cloudflare Turnstile widget wrapper.
 *
 * Loads the challenges.cloudflare.com script once, renders a managed or
 * compact widget, and calls `onVerify(token)` when a token is issued.
 *
 * If NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, renders nothing and calls
 * onVerify('dev-skip') immediately so local dev doesn't stall.
 */
import { useEffect, useRef } from 'react';

type TurnstileRenderOpts = {
  sitekey: string;
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact' | 'invisible';
  appearance?: 'always' | 'execute' | 'interaction-only';
};

type TurnstileApi = {
  render: (el: string | HTMLElement, opts: TurnstileRenderOpts) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// Use a loose cast to avoid collisions with any third-party window augmentations.
function getTurnstile(): TurnstileApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

function getLoadingPromise(): Promise<void> | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __turnstileLoading?: Promise<void> }).__turnstileLoading;
}

function setLoadingPromise(p: Promise<void>) {
  (window as unknown as { __turnstileLoading?: Promise<void> }).__turnstileLoading = p;
}

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (getTurnstile()) return Promise.resolve();
  const existing = getLoadingPromise();
  if (existing) return existing;

  const p = new Promise<void>((resolve, reject) => {
    const existingTag = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existingTag) {
      existingTag.addEventListener('load', () => resolve());
      existingTag.addEventListener('error', () => reject(new Error('Failed to load Turnstile')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Turnstile'));
    document.head.appendChild(s);
  });
  setLoadingPromise(p);
  return p;
}

export default function TurnstileWidget({
  onVerify,
  onExpire,
  theme = 'dark',
  compact = false,
}: {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) {
      onVerify('dev-skip');
      return;
    }
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const api = getTurnstile();
        if (!api) return;
        const id = api.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          size: compact ? 'compact' : 'normal',
          callback: (token) => onVerify(token),
          'expired-callback': () => onExpire?.(),
          'error-callback': () => onExpire?.(),
        });
        widgetIdRef.current = id ?? null;
      })
      .catch((err) => console.error('[Turnstile]', err));
    return () => {
      cancelled = true;
      const api = getTurnstile();
      if (widgetIdRef.current && api) {
        try { api.remove(widgetIdRef.current); } catch { /* noop */ }
      }
    };
  }, [siteKey, theme, compact, onVerify, onExpire]);

  if (!siteKey) return null;
  return <div ref={containerRef} style={{ minHeight: compact ? 60 : 65 }} />;
}

export { TurnstileWidget };
