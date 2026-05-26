'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { IS_MAINNET } from '@/lib/solana-network';

const DISMISS_KEY = 'casi-dev-banner-dismissed';

/**
 * Thin yellow strip across every page while the app runs on Solana devnet.
 * - Hidden entirely on mainnet (IS_MAINNET from env).
 * - Hidden on OBS sources (/obs and /overlay?mode=obs) so it doesn't show up
 *   in streamer scenes.
 * - Dismissible per-device via localStorage. "What's dev mode?" expands an
 *   inline paragraph instead of linking out — one-click, no context loss.
 */
export default function DevBanner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(true); // assume dismissed until hydrated
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // private-mode Safari — banner just reappears next session.
    }
  };

  if (IS_MAINNET) return null;
  if (dismissed) return null;
  if (pathname?.startsWith('/obs')) return null;
  if (pathname?.startsWith('/overlay') && searchParams?.get('mode') === 'obs') return null;

  return (
    <div
      role="status"
      style={{
        position: 'relative',
        zIndex: 50,
        background: 'rgba(234, 179, 8, 0.08)',
        borderBottom: '1px solid rgba(234, 179, 8, 0.3)',
        color: '#eab308',
      }}
    >
      <div
        className="mx-auto flex flex-wrap items-center gap-3 font-mono uppercase"
        style={{
          maxWidth: '1400px',
          padding: '8px 20px',
          fontSize: '10px',
          letterSpacing: '0.14em',
        }}
      >
        <span
          aria-hidden
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#eab308',
            boxShadow: '0 0 8px rgba(234, 179, 8, 0.6)',
            flexShrink: 0,
          }}
        />
        <strong style={{ color: '#eab308', fontWeight: 700 }}>Dev preview</strong>
        <Separator />
        <span>Running on Solana devnet</span>
        <Separator />
        <span>Stripe live · Solana on devnet</span>
        <Separator />
        <span className="hidden sm:inline">Smart contract audit in progress</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="underline"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#eab308',
            textUnderlineOffset: '3px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            letterSpacing: 'inherit',
            textTransform: 'inherit',
            padding: 0,
          }}
        >
          What&apos;s dev mode?
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss dev preview banner"
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: 'none',
            color: 'rgba(234, 179, 8, 0.7)',
            cursor: 'pointer',
            fontSize: '14px',
            lineHeight: 1,
            padding: '0 4px',
          }}
        >
          ✕
        </button>
      </div>
      {expanded ? (
        <div
          className="mx-auto"
          style={{
            maxWidth: '1400px',
            padding: '0 20px 12px',
            fontSize: '12px',
            lineHeight: 1.5,
            color: 'rgba(234, 179, 8, 0.85)',
          }}
        >
          Casi runs on Solana&apos;s devnet while the smart contract goes through audit. USDC
          balances shown are test tokens — crypto payments are not yet real. Stripe card payments
          are live and use real money. When the Solana program launches on mainnet this banner
          disappears.
        </div>
      ) : null}
    </div>
  );
}

function Separator() {
  return (
    <span
      aria-hidden
      style={{ color: 'rgba(234, 179, 8, 0.35)', padding: '0 2px' }}
    >
      ·
    </span>
  );
}
