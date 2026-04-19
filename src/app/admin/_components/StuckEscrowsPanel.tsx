import { useEffect, useState } from 'react';
import type { Connection } from '@solana/web3.js';
import { EXPLORER_CLUSTER_QUERY } from '@/lib/solana-network';

// On-chain escrow state for a stuck denied booking. 'unknown' = probe in
// flight; 'error' = RPC refused (rare — offer a retry via refresh).
type PdaState = 'unknown' | 'active' | 'pending' | 'closed' | 'error';

type StuckBooking = {
  id: string;
  viewer_name: string | null;
  escrow_pda: string | null;
  viewer_wallet: string | null;
  tx_signature: string | null;
  created_at: string;
  price_value: number;
  price_unit: string;
};

/**
 * Shown on the admin page when there are denied Solana bookings whose escrow
 * PDA is still tracked in the DB (escrow_pda IS NOT NULL). Each row is probed
 * against chain: Active escrows get a "settle on-chain" button the streamer
 * can sign to release funds; Pending escrows can only be recovered by the
 * viewer; closed PDAs are offered as "clear stale row" to tidy the DB.
 *
 * The parent owns the mutation (settleOrClearSolanaEscrow + DB update) so the
 * heavy lifting — wallet signing, error parsing — lives in one place. This
 * component only decides which button to render based on the probe result.
 */
export default function StuckEscrowsPanel({
  bookings,
  connection,
  walletReady,
  onSettle,
}: {
  bookings: StuckBooking[];
  connection: Connection;
  walletReady: boolean;
  onSettle: (booking: StuckBooking) => Promise<void>;
}) {
  const [states, setStates] = useState<Record<string, PdaState>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Probe each PDA independently; one RPC call per row. Re-run when the
  // booking list changes (parent refreshes after a settle, new orphans, etc).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { PublicKey } = await import('@solana/web3.js');
      const next: Record<string, PdaState> = {};
      for (const b of bookings) {
        if (!b.escrow_pda) { next[b.id] = 'closed'; continue; }
        try {
          const info = await connection.getAccountInfo(new PublicKey(b.escrow_pda));
          if (!info) { next[b.id] = 'closed'; continue; }
          // EscrowState layout from programs/casi-escrow/src/lib.rs:
          //   8 discriminator + 32 escrow_id + 32 viewer + 32 streamer +
          //   32 usdc_mint + 8 total + 8 duration + 8 start + 1 escrow_type
          //   = 161 → status (u8 enum: 0=Pending, 1=Active). Settled/Cancelled
          //   close the account so if info is present the status is 0 or 1.
          const statusByte = info.data[161];
          next[b.id] = statusByte === 1 ? 'active' : 'pending';
        } catch (err) {
          console.error('[stuck] PDA probe failed for', b.id, err);
          next[b.id] = 'error';
        }
      }
      if (!cancelled) setStates(next);
    })();
    return () => { cancelled = true; };
  }, [bookings, connection]);

  if (bookings.length === 0) return null;

  return (
    <div style={{
      background: 'rgba(234,179,8,0.04)',
      border: '1px solid rgba(234,179,8,0.2)',
      borderRadius: 10,
      padding: 16,
      marginBottom: 16,
    }}>
      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 10,
        letterSpacing: 1,
        color: '#eab308',
        textTransform: 'uppercase',
        marginBottom: 10,
      }}>
        Stuck Solana escrows · {bookings.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bookings.map(b => {
          const state = states[b.id] ?? 'unknown';
          const isBusy = busyId === b.id;
          return (
            <div key={b.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 6,
            }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--casi-text)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {b.viewer_name || '—'}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>
                ${b.price_value}/{b.price_unit}
              </span>
              {b.tx_signature && (
                <a href={`https://solscan.io/tx/${b.tx_signature}${EXPLORER_CLUSTER_QUERY}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#9945FF', textDecoration: 'none' }}>↗ tx</a>
              )}
              <StateTag state={state} />
              <ActionButton
                state={state}
                walletReady={walletReady}
                isBusy={isBusy}
                onClick={async () => {
                  setBusyId(b.id);
                  try { await onSettle(b); } finally { setBusyId(null); }
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StateTag({ state }: { state: PdaState }) {
  const copy: Record<PdaState, { text: string; color: string }> = {
    unknown: { text: 'checking…', color: 'rgba(255,255,255,0.4)' },
    active:  { text: '● active on-chain', color: '#4ade80' },
    pending: { text: '● pending on-chain', color: '#60a5fa' },
    closed:  { text: '○ closed', color: 'rgba(255,255,255,0.4)' },
    error:   { text: '⚠ rpc error', color: '#f87171' },
  };
  const { text, color } = copy[state];
  return (
    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color, minWidth: 120, textAlign: 'right' }}>
      {text}
    </span>
  );
}

function ActionButton({
  state, walletReady, isBusy, onClick,
}: {
  state: PdaState; walletReady: boolean; isBusy: boolean; onClick: () => void;
}) {
  // Settle_beam needs the streamer's signature, so hide the action until the
  // wallet is connected.
  if (state === 'active' && !walletReady) {
    return <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>connect wallet</span>;
  }

  const label: Record<PdaState, string | null> = {
    unknown: null,
    active:  isBusy ? 'signing…' : 'Settle on-chain',
    pending: null,                 // viewer-only action
    closed:  isBusy ? 'clearing…' : 'Clear row',
    error:   isBusy ? '…' : 'Retry',
  };
  const text = label[state];
  if (!text) {
    if (state === 'pending') {
      return <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>viewer-only</span>;
    }
    return null;
  }

  return (
    <button
      onClick={onClick}
      disabled={isBusy}
      className="act-btn"
      style={{
        fontSize: 10,
        padding: '6px 12px',
        background: state === 'active' ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)',
        border: state === 'active' ? '1px solid rgba(74,222,128,0.2)' : '1px solid rgba(255,255,255,0.1)',
        color: state === 'active' ? '#4ade80' : 'var(--casi-text-muted)',
        opacity: isBusy ? 0.5 : 1,
        cursor: isBusy ? 'wait' : 'pointer',
      }}
    >
      {text}
    </button>
  );
}
