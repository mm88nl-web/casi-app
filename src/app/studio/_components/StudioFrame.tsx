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
    <main className="casi-studio-chrome min-h-screen">
      {/* Studio chrome is always Casi's own fixed cream/green identity —
          never the signed-in streamer's own skin (see the design_handoff
          README's "App chrome deliberately does NOT follow the skin").
          html/body otherwise paint whatever --paper the streamer's skin
          (or DevTweaksPanel in dev) last set, which flashes through before
          this chrome-pinned <main> repaints cream — same FOUC fix the
          landing page uses, scoped here via --chrome-paper. */}
      <style jsx global>{`
        html, body { background: var(--chrome-paper); }
      `}</style>
      <NavBar
        chips={
          // Prototype's header is three things: logo, a plain Settings
          // link, the wallet pill -- no gear glyph, no separate sign-out
          // control. Sign-out isn't dropped, just de-duplicated: it's
          // already a real control inside /studio/settings (see
          // SignOutButton there), so having a second copy of it in every
          // studio screen's top bar was redundant, not load-bearing.
          <Link href="/studio/settings" title="Profile, payouts, appearance" style={settingsLinkStyle}>
            Settings
          </Link>
        }
        right={<WalletPill />}
      />

      <div
        className="mx-auto flex flex-col"
        // /studio/live needs more horizontal room for the 3-col Layers ·
        // Canvas · Properties grid; everywhere else stays at 1280.
        style={{
          maxWidth: activeMode === 'live' ? '1480px' : '1280px',
          padding: '28px var(--pad) 80px',
          gap: '20px',
        }}
      >
        {/* Live-status bar — dark-green rounded strip matching the design
            handoff's "this stream" bar (Casi Live Preview.dc.html isStudio
            block). Real behaviour unchanged: the single onToggleLive
            handler still drives Go-live / End-stream (which opens
            EndStreamDialog on /studio); no "Pause new requests" control
            exists in the real app so it isn't reproduced here. */}
        <div
          className="flex flex-wrap items-center"
          style={{
            gap: '14px',
            background: 'var(--chrome-ink)',
            color: 'var(--chrome-paper)',
            borderRadius: 'var(--radius-panel)',
            padding: '14px 18px',
          }}
        >
          <span
            aria-hidden
            style={{
              width: '9px',
              height: '9px',
              borderRadius: '999px',
              background: isLive ? 'var(--chrome-accent)' : 'var(--chrome-ink-soft)',
              flexShrink: 0,
              animation: isLive ? 'tally 2.4s ease-in-out infinite' : 'none',
            }}
          />
          <span style={{ fontFamily: 'var(--H)', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.01em' }}>
            {isLive ? 'Live' : 'Offline'}
          </span>
          <span style={{ width: '1px', height: '20px', background: 'var(--chrome-ink-soft)' }} />
          <h1
            style={{
              fontFamily: 'var(--S)',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '17px',
              color: 'var(--chrome-on-ink-2)',
              margin: 0,
            }}
          >
            @{slug}
          </h1>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onToggleLive}
            disabled={togglingLive}
            title={isLive ? 'End stream' : 'Go live'}
            style={{
              padding: '10px 18px',
              fontFamily: 'var(--B)',
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              border: isLive ? '1px solid var(--chrome-ink-soft)' : 'none',
              borderRadius: 'var(--radius-pill)',
              background: isLive ? 'transparent' : 'var(--chrome-paper)',
              color: isLive ? 'var(--chrome-paper)' : 'var(--chrome-ink)',
              cursor: togglingLive ? 'wait' : 'pointer',
              opacity: togglingLive ? 0.6 : 1,
              transition: 'background .14s, border-color .14s',
            }}
          >
            {isLive ? 'End stream' : 'Go live'}
          </button>
        </div>

        {/* Header — real page identity + mode switch. Not in the single-
            screen prototype (which has no dashboard/live split), styled to
            match its Archivo + pill-tab language. */}
        <header
          className="flex flex-wrap items-end justify-between"
          style={{ gap: '16px' }}
        >
          <h2
            style={{
              fontFamily: 'var(--H)',
              fontWeight: 800,
              fontVariationSettings: '"opsz" 64',
              fontSize: 'clamp(26px, 3.6vw, 38px)',
              letterSpacing: '-0.03em',
              lineHeight: 1,
              color: 'var(--text)',
              margin: 0,
            }}
          >
            Welcome back
          </h2>

          {/* Mode tabs — pill segmented control, matches the prototype's
              Waiting/Layers tab treatment. */}
          <div
            className="flex items-center"
            style={{
              gap: '4px',
              background: 'var(--surf-2)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-pill)',
              padding: '4px',
            }}
          >
            <ModeTab href="/studio" active={activeMode === 'dashboard'} count={pendingCount}>
              Dashboard
            </ModeTab>
            <ModeTab href="/studio/live" active={activeMode === 'live'}>
              Live
            </ModeTab>
          </div>
        </header>

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

// Prototype's "Settings" nav link: plain italic Newsreader text, no
// border/background -- same quiet-secondary-link treatment as /search's
// "Log in" link (src/app/search/page.tsx .login-link).
const settingsLinkStyle: CSSProperties = {
  fontFamily: 'var(--S)',
  fontStyle: 'italic',
  fontSize: '16px',
  color: 'var(--chrome-text-2)',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

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
        padding: '9px 18px',
        fontFamily: 'var(--H)',
        fontWeight: 700,
        fontSize: '15px',
        letterSpacing: '-0.01em',
        borderRadius: 'var(--radius-pill)',
        color: active ? 'var(--on-ink)' : 'var(--text-2)',
        background: active ? 'var(--ink)' : 'transparent',
        textDecoration: 'none',
        transition: 'color .14s, background .14s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      {children}
      {count && count > 0 ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '20px',
            height: '20px',
            padding: '0 6px',
            borderRadius: 'var(--radius-pill)',
            background: active ? 'var(--on-ink)' : 'var(--ink)',
            color: active ? 'var(--ink)' : 'var(--on-ink)',
            fontFamily: 'var(--M)',
            fontSize: '10px',
            fontWeight: 700,
          }}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
