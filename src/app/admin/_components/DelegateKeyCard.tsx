import { useEffect, useState, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Settings card for the server-held session-key delegate.
 *
 * The delegate is an ephemeral on-chain key the server holds encrypted at
 * rest. It can only sign `start_beam_delegated` — so when a streamer clicks
 * Approve on a pending booking, the server can flip the escrow Pending →
 * Active without the streamer's wallet prompting. It cannot move funds and
 * cannot settle (the on-chain program enforces the scope).
 *
 * States we render:
 *   - loading    — status probe in flight
 *   - absent     — no delegate installed, offer "Install"
 *   - healthy    — installed, not expired, not revoked
 *   - expired    — past `expires_at`, same "rotate" action as absent
 *   - revoked    — admin manually killed it; same "rotate" action
 *
 * Install / rotate / revoke all round-trip through the server routes under
 * /api/solana/delegates — the secret key never reaches this component.
 */

type Status =
  | { kind: 'loading' }
  | { kind: 'absent' }
  | {
      kind: 'healthy' | 'expired' | 'revoked';
      sessionPubkey: string;
      expiresAt:     number;          // unix seconds
      rotatedAt?:    string | null;
      createdAt?:    string | null;
      revokedAt?:    string | null;
    };

/** 7 days — matches the hobby-cron cadence for /api/cron/solana-reconciler.
 *  Anything shorter forces rotation noise; anything longer and we risk a
 *  mid-stream expiry. The on-chain cap is 180 days — this is a UI default,
 *  not a program constraint. */
const DEFAULT_LIFETIME_SECS = 7 * 24 * 60 * 60;

export default function DelegateKeyCard({
  supabase,
  onInstalled,
}: {
  supabase: SupabaseClient;
  /** Fired after a successful install/rotate so the parent can, e.g.,
   *  prompt the streamer to sign the on-chain `set_delegate` tx. */
  onInstalled?: (sessionPubkey: string, expiresAt: number) => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [busy, setBusy]     = useState<'install' | 'revoke' | null>(null);
  const [err, setErr]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setStatus({ kind: 'absent' }); return; }
    try {
      const res = await fetch('/api/solana/delegates/status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const j = await res.json();
      if (!j.installed) { setStatus({ kind: 'absent' }); return; }
      const kind: 'healthy' | 'expired' | 'revoked' =
        j.revoked ? 'revoked' : j.expired ? 'expired' : 'healthy';
      setStatus({
        kind,
        sessionPubkey: j.sessionPubkey,
        expiresAt:     j.expiresAt,
        rotatedAt:     j.rotatedAt,
        createdAt:     j.createdAt,
        revokedAt:     j.revokedAt,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
      setStatus({ kind: 'absent' });
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const install = async () => {
    setBusy('install'); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/solana/delegates/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ lifetimeSecs: DEFAULT_LIFETIME_SECS }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Install failed');
      // Server has the session key; now the streamer must sign `set_delegate`
      // on-chain so the Anchor program recognizes the delegate PDA. Without
      // this step the server-side crank has no authority and every Approve
      // falls back to a wallet pop-up. Awaited so signing errors (user
      // rejection, network blip) surface in the card's error state — the
      // stale DB row gets overwritten on the next Install click.
      if (onInstalled) await onInstalled(j.sessionPubkey, j.expiresAt);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Install failed');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    if (!confirm('Revoke the current session key? You can always install a new one.')) return;
    setBusy('revoke'); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/solana/delegates/revoke', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Revoke failed');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setBusy(null);
    }
  };

  // ── presentation ─────────────────────────────────────────────────────────

  const { headline, sub, accent } = describe(status);

  return (
    <div>
      <label className="pe-lbl">
        Session key
        <span style={{ letterSpacing: 0, textTransform: 'none', opacity: 0.6 }}>
          {' — '}server starts beams without wallet pop-ups
        </span>
      </label>
      <div style={{
        background: 'var(--casi-bg)',
        border: '1px solid var(--casi-border)',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: accent,
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {headline}
          </div>
          <div style={{
            fontFamily: "'DM Mono',monospace",
            fontSize: 10,
            color: 'var(--casi-text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {sub}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {status.kind !== 'loading' && (
            <button
              type="button"
              onClick={install}
              disabled={busy !== null}
              style={{
                background: status.kind === 'healthy' ? 'rgba(255,255,255,0.04)' : 'var(--casi-accent)',
                border: status.kind === 'healthy' ? '1px solid var(--casi-border)' : 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontFamily: "'Syne',sans-serif",
                fontWeight: 800,
                fontSize: 11,
                textTransform: 'uppercase',
                color: status.kind === 'healthy' ? 'var(--casi-text)' : 'var(--casi-bg)',
                cursor: busy ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}>
              {busy === 'install'
                ? 'Generating…'
                : status.kind === 'healthy' ? 'Rotate'
                : status.kind === 'absent'  ? 'Install →'
                : 'Reinstall →'}
            </button>
          )}
          {status.kind === 'healthy' && (
            <button
              type="button"
              onClick={revoke}
              disabled={busy !== null}
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                padding: '8px 14px',
                fontFamily: "'Syne',sans-serif",
                fontWeight: 800,
                fontSize: 11,
                textTransform: 'uppercase',
                color: '#ef4444',
                cursor: busy ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}>
              {busy === 'revoke' ? 'Revoking…' : 'Revoke'}
            </button>
          )}
        </div>
      </div>
      <div style={{
        fontFamily: "'DM Mono',monospace",
        fontSize: 9,
        color: err ? '#ef4444' : 'var(--casi-text-muted)',
        marginTop: 5,
      }}>
        {err
          ? `✕ ${err}`
          : 'Scoped: can only approve pending beams. Cannot move funds or settle escrows.'}
      </div>
    </div>
  );
}

function describe(s: Status): { headline: string; sub: string; accent: string } {
  switch (s.kind) {
    case 'loading':
      return { headline: 'Loading…', sub: '', accent: 'var(--casi-text-muted)' };
    case 'absent':
      return {
        headline: 'No session key installed',
        sub: 'Streamers must sign each approval manually',
        accent: 'var(--casi-text)',
      };
    case 'expired':
      return {
        headline: '◎ Expired',
        sub: `${shortPk(s.sessionPubkey)} · expired ${fmtRelative(s.expiresAt * 1000)}`,
        accent: '#eab308',
      };
    case 'revoked':
      return {
        headline: '◎ Revoked',
        sub: `${shortPk(s.sessionPubkey)} · revoked ${s.revokedAt ? fmtRelative(Date.parse(s.revokedAt)) : 'recently'}`,
        accent: '#eab308',
      };
    case 'healthy':
      return {
        headline: `◎ ${shortPk(s.sessionPubkey)}`,
        sub: `Active · expires ${fmtRelative(s.expiresAt * 1000)}`,
        accent: '#9945FF',
      };
  }
}

function shortPk(pk: string): string {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

/** "in 6 days" / "3 hours ago" — coarse, localized. */
function fmtRelative(ms: number): string {
  const diff = ms - Date.now();
  const abs  = Math.abs(diff);
  const sign = diff >= 0 ? 'in ' : '';
  const ago  = diff >= 0 ? '' : ' ago';
  const mins = Math.round(abs / 60_000);
  if (mins < 60)       return `${sign}${mins}m${ago}`;
  const hrs  = Math.round(mins / 60);
  if (hrs  < 48)       return `${sign}${hrs}h${ago}`;
  const days = Math.round(hrs / 24);
  return `${sign}${days}d${ago}`;
}
