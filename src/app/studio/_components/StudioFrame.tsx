'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { NavBar } from '@/components/v9';
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
    <main className="min-h-screen" style={{ background: 'var(--paper)', color: 'var(--text)' }}>
      <NavBar
        chips={
          <>
            <Link href="/admin" title="Classic studio (current production)" style={chipStyle()}>
              ↩ Classic
            </Link>
            <span style={chipStyle({ active: true })}>Studio beta</span>
            <Link href="/studio/settings" title="Profile, payouts, appearance" style={chipStyle()}>
              ⚙ Settings
            </Link>
          </>
        }
        right={<WalletPill />}
      />

      <div
        className="mx-auto flex flex-col"
        style={{ maxWidth: '1280px', padding: '36px var(--pad) 80px', gap: '24px' }}
      >
        {/* Control header — v9 .ctrl-header pattern */}
        <header
          className="flex flex-wrap items-end justify-between"
          style={{
            gap: '20px',
            paddingBottom: '24px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--H)',
              fontWeight: 800,
              fontVariationSettings: '"opsz" 64',
              fontSize: 'clamp(32px, 4.4vw, 48px)',
              letterSpacing: '-0.035em',
              lineHeight: 1,
              color: 'var(--text)',
            }}
          >
            Welcome back,{' '}
            <em
              style={{
                fontFamily: 'var(--S)',
                fontWeight: 400,
                fontStyle: 'italic',
                color: 'var(--ink)',
                fontSize: '0.95em',
                letterSpacing: '-0.01em',
              }}
            >
              @{slug}
            </em>
          </h1>
          <div className="flex items-center" style={{ gap: '14px' }}>
            {isLive ? (
              <span
                className="flex items-center"
                style={{
                  gap: '8px',
                  fontFamily: 'var(--M)',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--ink)',
                  padding: '7px 12px',
                  border: '1px solid var(--ink)',
                }}
              >
                <span
                  aria-hidden
                  className="casi-v9-live-dot"
                  style={{ width: '6px', height: '6px', borderRadius: '50%' }}
                />
                Live now
              </span>
            ) : null}
            <button
              type="button"
              onClick={onToggleLive}
              disabled={togglingLive}
              title={isLive ? 'End stream' : 'Go live'}
              style={{
                padding: '9px 16px',
                fontFamily: 'var(--M)',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                border: '1px solid var(--line-2)',
                background: 'transparent',
                color: 'var(--text-3)',
                cursor: togglingLive ? 'wait' : 'pointer',
                opacity: togglingLive ? 0.5 : 1,
                transition: 'border-color .14s, color .14s',
              }}
            >
              {isLive ? 'End stream' : 'Go live'}
            </button>
          </div>
        </header>

        {/* Mode tabs — v9 .mode-tabs */}
        <div className="flex" style={{ gap: '0', borderBottom: '1px solid var(--line)' }}>
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
                style={{
                  padding: '5px 11px',
                  fontFamily: 'var(--M)',
                  background: 'transparent',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  fontSize: '10px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
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

function chipStyle({ active = false }: { active?: boolean } = {}): CSSProperties {
  return {
    fontFamily: 'var(--M)',
    fontSize: '10.5px',
    fontWeight: 500,
    letterSpacing: '0.04em',
    color: active ? 'var(--ink)' : 'var(--text-3)',
    background: active ? 'var(--ink-08)' : 'transparent',
    border: `1px solid ${active ? 'color-mix(in oklab, var(--ink) 30%, var(--paper))' : 'var(--line)'}`,
    padding: '7px 12px',
    textDecoration: 'none',
    transition: 'color .14s, border-color .14s',
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
        padding: '14px 22px 16px',
        fontFamily: 'var(--H)',
        fontWeight: 700,
        fontSize: '18px',
        letterSpacing: '-0.02em',
        color: active ? 'var(--text)' : 'var(--text-3)',
        borderBottom: `2px solid ${active ? 'var(--ink)' : 'transparent'}`,
        marginBottom: '-1px',
        background: 'none',
        textDecoration: 'none',
        transition: 'color .14s',
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
            minWidth: '22px',
            height: '22px',
            padding: '0 6px',
            marginLeft: '8px',
            background: 'var(--ink)',
            color: 'var(--on-ink)',
            fontFamily: 'var(--M)',
            fontSize: '10.5px',
            fontWeight: 700,
            verticalAlign: '1px',
          }}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
