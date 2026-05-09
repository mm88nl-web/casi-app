'use client';

import UsdcIcon from '@/components/icons/UsdcIcon';
import { EXPLORER_CLUSTER_QUERY } from '@/lib/solana-network';

export type TxRow = {
  kind: 'beam' | 'flash';
  id: string;
  status: string;
  payment_method: string | null;
  amount_cents: number | null;
  message: string | null;
  duration_minutes: number | string | null;
  tx_signature: string | null;
  created_at: string;
};

type Props = {
  rows: TxRow[];
  /** Streamer handle for the section header. */
  username: string;
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function statusLabel(row: TxRow): { text: string; color: string } {
  // Beams have richer states (active/queued/expired/etc) than flashes
  // (approved/denied) — collapse to a small set of viewer-meaningful labels.
  if (row.status === 'active') return { text: 'live', color: '#4ade80' };
  if (row.status === 'approved_queued') return { text: 'queued', color: '#facc15' };
  if (row.status === 'pending') return { text: 'pending', color: 'var(--casi-text-muted)' };
  if (row.status === 'expired') return { text: 'aired', color: 'var(--casi-text-mid)' };
  if (row.status === 'approved') return { text: 'aired', color: 'var(--casi-text-mid)' };
  if (row.status === 'denied') return { text: 'denied · refunded', color: '#f87171' };
  if (row.status === 'cancelled') return { text: 'cancelled', color: 'var(--casi-text-muted)' };
  return { text: row.status, color: 'var(--casi-text-muted)' };
}

/** Buckets totals by currency rail, formatted for display. Skips free-tier
 *  rows (zero amount). Stripe rows are EUR or USD depending on the row's
 *  rail; we don't have per-row currency on the booking shape so we group
 *  all Stripe under "card" and let the viewer's app history reconcile. */
function spendTotals(rows: TxRow[]): { usdc: number; card: number } {
  let usdc = 0;
  let card = 0;
  for (const r of rows) {
    if (!r.amount_cents) continue;
    // Don't count refunded/cancelled/denied — viewer didn't actually spend.
    if (r.status === 'denied' || r.status === 'cancelled') continue;
    if (r.payment_method === 'solana') usdc += r.amount_cents;
    else if (r.payment_method === 'stripe') card += r.amount_cents;
  }
  return { usdc: usdc / 100, card: card / 100 };
}

export default function MyTransactionsSection({ rows, username }: Props) {
  if (!rows.length) return null;

  const { usdc, card } = spendTotals(rows);
  const totalParts: string[] = [];
  if (usdc > 0) totalParts.push(`${usdc.toFixed(2)} USDC`);
  if (card > 0) totalParts.push(`€${card.toFixed(2)}`);

  return (
    <div className="my-tx" style={{ marginTop: 16 }}>
      <style>{`
        .my-tx-head {
          display: flex; align-items: baseline; justify-content: space-between;
          margin-bottom: 10px;
          font-family: var(--M, var(--font-casi-mono), monospace);
          font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase;
          color: var(--casi-text-muted);
        }
        .my-tx-list {
          display: flex; flex-direction: column;
          background: var(--casi-surface);
          border: 1px solid var(--casi-border);
          border-radius: 0;
          overflow: hidden;
        }
        .my-tx-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--casi-border);
          font-size: 12.5px;
        }
        .my-tx-row:last-of-type { border-bottom: none; }
        .my-tx-row:hover { background: rgba(255,255,255,0.01); }
        .my-tx-time {
          font-family: var(--M, var(--font-casi-mono), monospace);
          font-size: 10px; color: var(--casi-text-faint);
          flex-shrink: 0; width: 48px;
        }
        .my-tx-kind {
          font-family: var(--M, var(--font-casi-mono), monospace);
          font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--casi-text-mid);
          flex-shrink: 0; width: 44px;
        }
        .my-tx-msg {
          flex: 1; min-width: 0;
          color: var(--casi-text-mid);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .my-tx-amt {
          font-family: var(--M, var(--font-casi-mono), monospace);
          font-size: 11px; font-weight: 600;
          padding: 2px 8px;
          display: inline-flex; align-items: center; gap: 5px;
          flex-shrink: 0;
        }
        .my-tx-amt.u { color: #c4a0ff; background: rgba(153,69,255,0.10); }
        .my-tx-amt.e { color: var(--casi-accent); background: rgba(var(--casi-accent-rgb), 0.07); }
        .my-tx-amt.f { color: var(--casi-text-dim); background: var(--casi-surface-2); }
        .my-tx-status {
          font-family: var(--M, var(--font-casi-mono), monospace);
          font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase;
          flex-shrink: 0;
        }
        .my-tx-link {
          font-family: var(--M, var(--font-casi-mono), monospace);
          font-size: 10px; color: #9945FF;
          text-decoration: none;
          flex-shrink: 0;
        }
        .my-tx-link:hover { opacity: 0.7; }
        .my-tx-foot {
          padding: 10px 14px;
          border-top: 1px solid var(--casi-border);
          background: rgba(255,255,255,0.01);
          font-size: 12px;
          color: var(--casi-text-mid);
          display: flex; justify-content: space-between;
        }
      `}</style>

      <div className="my-tx-head">
        <span>Your activity · @{username}</span>
        <span>{rows.length}</span>
      </div>

      <div className="my-tx-list">
        {rows.map((r) => {
          const status = statusLabel(r);
          const railClass = r.payment_method === 'solana' ? 'u'
            : r.payment_method === 'stripe' ? 'e'
            : 'f';
          const amt = !r.amount_cents
            ? 'free'
            : r.payment_method === 'solana'
              ? `${(r.amount_cents / 100).toFixed(2)}`
              : `€${(r.amount_cents / 100).toFixed(2)}`;
          return (
            <div key={`${r.kind}-${r.id}`} className="my-tx-row">
              <span className="my-tx-time">{fmtTime(r.created_at)}</span>
              <span className="my-tx-kind">{r.kind === 'beam' ? '★ beam' : '⚡ flash'}</span>
              <span className="my-tx-msg" title={r.message ?? ''}>
                {r.kind === 'beam' && r.duration_minutes
                  ? `${r.duration_minutes}m · ${r.message || '—'}`
                  : (r.message || '—')}
              </span>
              <span className={`my-tx-amt ${railClass}`}>
                {r.payment_method === 'solana' ? <UsdcIcon size={10} mono="currentColor" /> : null}
                {amt}
              </span>
              <span className="my-tx-status" style={{ color: status.color }}>{status.text}</span>
              {r.tx_signature ? (
                <a
                  className="my-tx-link"
                  href={`https://solscan.io/tx/${r.tx_signature}${EXPLORER_CLUSTER_QUERY}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Verify on Solscan"
                >
                  ↗
                </a>
              ) : null}
            </div>
          );
        })}

        <div className="my-tx-foot">
          <span>You&apos;ve sent</span>
          <strong style={{ fontFamily: 'var(--M, var(--font-casi-mono), monospace)', fontWeight: 600, color: 'var(--ink, var(--casi-accent))' }}>
            {totalParts.length ? totalParts.join(' + ') : '—'}
          </strong>
        </div>
      </div>
    </div>
  );
}
