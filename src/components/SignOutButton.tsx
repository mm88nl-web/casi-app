'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

/**
 * Signed-in chrome utility: signs the user out of Supabase and redirects
 * to the landing page. Pure UI — no server route, just a wrapper around
 * supabase.auth.signOut(). Renders as a small mono-caps pill matching
 * the StudioFrame nav chip language.
 *
 * Lands on / (landing) rather than /login because signing out is a
 * deliberate end-of-session move; we shouldn't immediately push the
 * user toward another login. "Use a different account" on /login itself
 * keeps the legacy switch-account flow for the post-OAuth half-signup
 * case.
 */
type Props = {
  /** Override the visible label (e.g. "Sign out", "Exit", ⏻ glyph). */
  label?: string;
  /** Style preset — "chip" for nav-bar pills, "block" for settings sections. */
  variant?: 'chip' | 'block';
};

export default function SignOutButton({ label = 'Sign out', variant = 'chip' }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      /* swallow — even on error we still want to bounce away */
    }
    router.replace('/');
  };

  if (variant === 'block') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        style={{
          padding: '12px 22px',
          fontFamily: 'var(--M)',
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          background: 'transparent',
          border: '1px solid var(--line-2)',
          borderRadius: '6px',
          color: 'var(--text-3)',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.5 : 1,
          transition: 'border-color .14s, color .14s',
        }}
      >
        {busy ? 'Signing out…' : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Sign out — returns to the landing page"
      style={{
        fontFamily: 'var(--M)',
        fontSize: '10.5px',
        fontWeight: 500,
        letterSpacing: '0.04em',
        color: 'var(--text-3)',
        background: 'transparent',
        border: '1px solid var(--line)',
        borderRadius: '6px',
        padding: '7px 12px',
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.5 : 1,
        transition: 'color .14s, border-color .14s',
      }}
    >
      {busy ? '…' : label}
    </button>
  );
}
