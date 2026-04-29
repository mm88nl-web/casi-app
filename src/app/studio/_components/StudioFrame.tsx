'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import Nav from '@/components/Nav';
import WalletPill from '@/components/WalletPill';

type StudioFrameProps = {
  /** Streamer handle, e.g. "@droptv" — rendered with leading "@" inside. */
  username: string;
  isLive: boolean | null;
  /** Toggling-live state — disables the End/Go-live button while in flight. */
  togglingLive?: boolean;
  onToggleLive?: () => void;
  /** Which dashboard mode is active. Tabs render as <Link> so reload + bookmark work. */
  activeMode: 'dashboard' | 'live';
  /** Pending count badge on the Dashboard tab. Hidden when 0. */
  pendingCount?: number;
  /** Inline error banner — string with a Dismiss handler. */
  error?: string | null;
  onDismissError?: () => void;
  children: ReactNode;
};

/**
 * Shared layout for /studio and /studio/live: top nav, welcome header
 * with go-live toggle, and the mode tabs that switch between the two
 * routes. Both pages render their own content below.
 */
export default function StudioFrame({
  username,
  isLive,
  togglingLive = false,
  onToggleLive,
  activeMode,
  pendingCount = 0,
  error,
  onDismissError,
  children,
}: StudioFrameProps) {
  const slug = username || 'streamer';

  return (
    <main
      className="min-h-screen"
      style={{ background: 'var(--casi-bg)', color: 'var(--casi-text)' }}
    >
      <Nav
        right={
          <>
            <Link
              href="/admin"
              title="Classic studio (current production)"
              className="font-mono uppercase"
              style={navChipStyle()}
            >
              ↩ Classic
            </Link>
            <span
              className="font-mono uppercase"
              style={navChipStyle({ active: true })}
            >
              Studio beta
            </span>
            <Link
              href="/studio/settings"
              title="Profile, payouts, appearance, OBS sources, session key"
              className="font-mono uppercase"
              style={navChipStyle()}
            >
              ⚙ Settings
            </Link>
            <WalletPill />
          </>
        }
      />

      <div
        className="mx-auto flex flex-col"
        style={{ maxWidth: '1200px', padding: '32px 32px 72px', gap: '24px' }}
      >
        {/* Control header — welcome + live status + go/end toggle */}
        <header
          className="flex flex-wrap items-center justify-between"
          style={{
            gap: '16px',
            paddingBottom: '20px',
            borderBottom: '1px solid var(--casi-border)',
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--font-casi-display), var(--font-casi-sans), sans-serif',
              fontWeight: 800,
              fontSize: '28px',
              letterSpacing: '0.5px',
              lineHeight: 1.1,
              color: 'var(--casi-text)',
            }}
          >
            Welcome back, <span style={{ color: 'var(--casi-accent)' }}>@{slug}</span>
          </h1>
          <div className="flex items-center" style={{ gap: '10px' }}>
            {isLive ? (
              <span
                className="flex items-center"
                style={{ gap: '7px', fontSize: '12.5px', color: 'var(--casi-accent)' }}
              >
                <span
                  aria-hidden
                  className="casi-live-dot"
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--casi-accent)',
                  }}
                />
                Live now
                <style>{`
                  .casi-live-dot { animation: casi-live-blink 2s ease-in-out infinite; }
                  @keyframes casi-live-blink {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.25; }
                  }
                `}</style>
              </span>
            ) : null}
            <button
              type="button"
              onClick={onToggleLive}
              disabled={togglingLive}
              title={isLive ? 'End stream' : 'Go live'}
              style={{
                padding: '8px 16px',
                borderRadius: '7px',
                fontSize: '12px',
                fontWeight: 600,
                border: '1px solid var(--casi-border-2)',
                background: 'transparent',
                color: 'var(--casi-text-mid)',
                cursor: togglingLive ? 'wait' : 'pointer',
                opacity: togglingLive ? 0.5 : 1,
                fontFamily: 'inherit',
                transition: 'border-color .14s, color .14s',
              }}
            >
              {isLive ? 'End stream' : 'Go live'}
            </button>
          </div>
        </header>

        {/* Mode tabs — real route links so reload/bookmark land on the right surface */}
        <div className="flex" style={{ gap: '0', borderBottom: '1px solid var(--casi-border)' }}>
          <ModeTab href="/studio" active={activeMode === 'dashboard'} count={pendingCount}>
            Dashboard
          </ModeTab>
          <ModeTab href="/studio/live" active={activeMode === 'live'}>
            Live
          </ModeTab>
        </div>

        {error ? (
          <div
            className="flex items-center justify-between"
            style={{
              padding: '12px 16px',
              gap: '12px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              borderRadius: '10px',
              fontSize: '13px',
            }}
            role="alert"
          >
            <span>{error}</span>
            {onDismissError ? (
              <button
                type="button"
                onClick={onDismissError}
                aria-label="Dismiss"
                className="font-mono uppercase"
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: 'transparent',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  fontSize: '10px',
                  letterSpacing: '0.14em',
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
            ) : null}
          </div>
        ) : null}

        {children}
      </div>
    </main>
  );
}

function navChipStyle({ active = false }: { active?: boolean } = {}): React.CSSProperties {
  return {
    fontSize: '11px',
    fontWeight: 500,
    color: active ? 'var(--casi-accent)' : 'var(--casi-text-dim)',
    background: active ? 'rgba(var(--casi-accent-rgb), 0.06)' : 'transparent',
    border: `1px solid ${active ? 'rgba(var(--casi-accent-rgb), 0.2)' : 'var(--casi-border)'}`,
    padding: '5px 11px',
    borderRadius: '6px',
    textDecoration: 'none',
    transition: 'color .14s',
    fontFamily: 'inherit',
  };
}

function ModeTab({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      style={{
        padding: '10px 20px 12px',
        fontSize: '14px',
        fontWeight: 600,
        color: active ? 'var(--casi-text)' : 'var(--casi-text-mid)',
        borderBottom: `2px solid ${active ? 'var(--casi-accent)' : 'transparent'}`,
        marginBottom: '-1px',
        background: 'none',
        textDecoration: 'none',
        transition: 'color .14s',
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {children}
      {count && count > 0 ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '18px',
            height: '18px',
            borderRadius: '5px',
            marginLeft: '7px',
            background: 'rgba(var(--casi-accent-rgb), 0.12)',
            color: 'var(--casi-accent)',
            fontFamily: 'var(--font-casi-mono), monospace',
            fontSize: '10px',
          }}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
