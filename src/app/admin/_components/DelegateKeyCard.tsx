import { useEffect, useState, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Settings card for the server-held session-key delegate.
 *
 * The delegate lets the server sign `start_beam_delegated` on the streamer's
 * behalf so Approve clicks don't pop a wallet. It's a two-phase install:
 *   (1) server generates + stores the encrypted secret (POST install)
 *   (2) streamer signs `set_delegate` on-chain so the program knows the
 *       session key is authorized (onInstalled callback)
 *
 * If phase (2) fails after phase (1) succeeded, the card shows a
 * `needs-finalize` state with a retry button — we NEVER re-generate a session
 * key silently, because a streamer could end up with an orphan secret in the
 * DB that doesn't match what's on-chain.
 *
 * Install / rotate / revoke / finalize all require the streamer wallet to be
 * connected AND match the solana_wallet saved on their profile. If it's not,
 * the card disables mutations and tells them to connect — rather than failing
 * halfway through the two-phase install.
 *
 * The secret key NEVER reaches this component.
 */

type BaseInstalled = {
  sessionPubkey: string;
  expiresAt:     number;          // unix seconds
  rotatedAt?:    string | null;
  createdAt?:    string | null;
  revokedAt?:    string | null;
};

type Status =
  | { kind: 'loading' }
  | { kind: 'absent' }
  | ({ kind: 'healthy' | 'expired' | 'revoked' | 'needs-finalize' } & BaseInstalled);

/** 7 days — matches the hobby-cron cadence for /api/cron/solana-reconciler.
 *  Anything shorter forces rotation noise; anything longer and we risk a
 *  mid-stream expiry. The on-chain cap is 180 days — this is a UI default,
 *  not a program constraint. */
const DEFAULT_LIFETIME_SECS = 7 * 24 * 60 * 60;

export default function DelegateKeyCard({
  supabase,
  walletReady,
  onInstalled,
}: {
  supabase: SupabaseClient;
  /** True iff the streamer's wallet is connected AND matches the
   *  `solana_wallet` saved on their profile. When false, the card disables
   *  install/rotate/finalize and tells the user to connect instead. */
  walletReady: boolean;
  /** Sign `set_delegate` on-chain. Must throw on failure so the card can
   *  transition to the `needs-finalize` state and offer a retry. Returning
   *  a Solscan URL is optional — if provided it's rendered as a success
   *  confirmation. */
  onInstalled?: (sessionPubkey: string, expiresAt: number) => Promise<void | { solscanUrl?: string }>;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [busy, setBusy]     = useState<'install' | 'finalize' | 'revoke' | null>(null);
  const [err, setErr]       = useState<string | null>(null);
  const [okLink, setOkLink] = useState<string | null>(null);

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
      const kind: BaseInstalled & { kind: Status['kind'] } = {
        kind:          j.revoked ? 'revoked' : j.expired ? 'expired' : 'healthy',
        sessionPubkey: j.sessionPubkey,
        expiresAt:     j.expiresAt,
        rotatedAt:     j.rotatedAt,
        createdAt:     j.createdAt,
        revokedAt:     j.revokedAt,
      };
      setStatus(kind as Status);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
      setStatus({ kind: 'absent' });
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const install = async () => {
    if (!walletReady) {
      setErr('Connect + save your Solana wallet first.');
      return;
    }
    setBusy('install'); setErr(null); setOkLink(null);
    let dbRow: { sessionPubkey: string; expiresAt: number } | null = null;
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
      dbRow = { sessionPubkey: j.sessionPubkey, expiresAt: j.expiresAt };

      if (onInstalled) {
        const maybe = await onInstalled(dbRow.sessionPubkey, dbRow.expiresAt);
        if (maybe && typeof maybe === 'object' && 'solscanUrl' in maybe && maybe.solscanUrl) {
          setOkLink(maybe.solscanUrl);
        }
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Install failed';
      setErr(msg);
      // If the DB write succeeded but the on-chain step failed, pop into
      // `needs-finalize` immediately so the streamer sees the retry button
      // without waiting for the next `load()` cycle.
      if (dbRow) {
        setStatus({
          kind: 'needs-finalize',
          sessionPubkey: dbRow.sessionPubkey,
          expiresAt:     dbRow.expiresAt,
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const finalize = async () => {
    if (status.kind !== 'needs-finalize' && status.kind !== 'healthy') return;
    if (!walletReady) { setErr('Connect + save your Solana wallet first.'); return; }
    if (!onInstalled) return;
    setBusy('finalize'); setErr(null); setOkLink(null);
    try {
      const { sessionPubkey, expiresAt } = status;
      const maybe = await onInstalled(sessionPubkey, expiresAt);
      if (maybe && typeof maybe === 'object' && 'solscanUrl' in maybe && maybe.solscanUrl) {
        setOkLink(maybe.solscanUrl);
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Finalize failed');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    if (!confirm('Revoke the current session key? You can always install a new one.')) return;
    setBusy('revoke'); setErr(null); setOkLink(null);
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
  const primaryLabel =
    busy === 'install'  ? 'Generating…'
    : status.kind === 'healthy'         ? 'Rotate'
    : status.kind === 'needs-finalize'  ? 'Finalize →'
    : status.kind === 'absent'          ? 'Install →'
                                        : 'Reinstall →';
  const primaryAction = status.kind === 'needs-finalize' ? finalize : install;
  const primaryBusy   = busy === 'install' || busy === 'finalize';
  const showRevoke    = status.kind === 'healthy' || status.kind === 'needs-finalize';

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
              onClick={primaryAction}
              disabled={busy !== null || !walletReady}
              title={!walletReady ? 'Connect + save your Solana wallet first' : undefined}
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
                cursor: busy ? 'wait' : walletReady ? 'pointer' : 'not-allowed',
                opacity: walletReady ? 1 : 0.5,
                whiteSpace: 'nowrap',
              }}>
              {primaryBusy ? (busy === 'finalize' ? 'Signing…' : 'Generating…') : primaryLabel}
            </button>
          )}
          {showRevoke && (
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
        color: err ? '#ef4444' : okLink ? '#4ade80' : 'var(--casi-text-muted)',
        marginTop: 5,
      }}>
        {err
          ? `✕ ${err}`
          : okLink
            ? <>✓ Delegate registered on-chain — <a href={okLink} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>view tx</a></>
            : !walletReady
              ? 'Connect + save your Solana wallet above to install a session key.'
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
    case 'needs-finalize':
      return {
        headline: '◎ Finalize on-chain',
        sub: `${shortPk(s.sessionPubkey)} · generated, not yet registered`,
        accent: '#eab308',
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
