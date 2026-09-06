'use client';

import { EXPLORER_CLUSTER_QUERY, IS_MAINNET } from '@/lib/solana-network';
import UsdcIcon from '@/components/icons/UsdcIcon';
import { formatSlotPrice } from '@/lib/slot-pricing';
import { formatTime } from './time';

export type TxStatus = 'idle' | 'booking' | 'streaming' | 'waiting' | 'error';

type Props = {
  slot: {
    price_value: number | string;
    price_unit: string;
    prices?: Record<string, number | string | null | undefined> | null;
  };
  duration: number;
  estimatedCost: string;
  username: string;
  recipientWallet: string | null;
  usdcBalance: number | null;
  txStatus: TxStatus;
  txError: string | null;
  txId: string | null;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Matches the design-source prototype's confirm-modal exactly (dark-ink
 * header band with the big total, cream receipt body, single full-width
 * pill CTA + dismiss ×) instead of the old mono-everywhere/uppercase
 * dashboard box with a separate Cancel button. Same underlying tx-status
 * data as before — this is a re-skin, not a behavior change.
 */
export default function SolanaConfirmModal({
  slot, duration, estimatedCost, username, recipientWallet, usdcBalance,
  txStatus, txError, txId, submitting, onConfirm, onCancel,
}: Props) {
  const hasInsufficient = usdcBalance !== null
    && usdcBalance < parseFloat(estimatedCost)
    && (txStatus === 'idle' || txStatus === 'error');
  const inProgress = submitting && txStatus !== 'idle' && txStatus !== 'error';
  const stepIcon = (active: boolean, done: boolean) => (done ? '✓' : active ? '⟳' : '○');
  const shortWallet = recipientWallet
    ? `${recipientWallet.slice(0, 4)}…${recipientWallet.slice(-4)}`
    : null;
  const solscanUrl = txId
    ? `https://solscan.io/tx/${txId}${EXPLORER_CLUSTER_QUERY}`
    : null;
  const rateLabel = formatSlotPrice(slot, { prefer: 'usdc' }).label;
  const ctaLabel = inProgress ? 'Signing…' : hasInsufficient ? 'Not enough to cover it' : txStatus === 'error' ? 'Retry →' : 'Confirm & sign →';

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={() => { if (!inProgress) onCancel(); }}
    >
      <style>{`@keyframes scm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surf)', border: '1px solid var(--line)', borderRadius: 'var(--radius-panel)', width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 40px 90px -30px rgba(0,0,0,0.5)' }}
      >
        {/* Header band — ink-filled, big total, matches the prototype's
            modalOpen header exactly. */}
        <div style={{ background: 'var(--ink)', color: 'var(--on-ink)', padding: '22px 26px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontFamily: 'var(--B)', fontWeight: 600, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-ink)', opacity: 0.75 }}>
              Slot · @{username}{IS_MAINNET ? '' : ' (devnet)'}
            </span>
            <button
              type="button"
              onClick={onCancel}
              disabled={inProgress}
              aria-label="Close"
              style={{ background: 'none', border: 'none', fontFamily: 'var(--S)', fontSize: 22, color: 'var(--on-ink)', opacity: 0.75, cursor: inProgress ? 'not-allowed' : 'pointer', lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 16 }}>
            <span style={{ fontFamily: 'var(--H)', fontWeight: 700, fontSize: 48, lineHeight: 0.9, letterSpacing: '-0.03em' }}>
              {estimatedCost}
            </span>
            <span style={{ fontFamily: 'var(--B)', fontWeight: 600, fontSize: 16, paddingBottom: 5, opacity: 0.75 }}>USDC</span>
          </div>
          <div style={{ fontFamily: 'var(--S)', fontStyle: 'italic', fontSize: 15.5, opacity: 0.75, marginTop: 8 }}>
            {formatTime(Math.round(duration * 60))} at {rateLabel}
          </div>
        </div>

        <div style={{ padding: '20px 26px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0' }}>
            <span style={{ fontFamily: 'var(--S)', fontSize: 15, color: 'var(--text-3)' }}>@{username} receives</span>
            <span style={{ fontFamily: 'var(--M)', fontSize: 14, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
              {estimatedCost} <span style={{ color: 'var(--text-4)' }}>· 100%</span>
            </span>
          </div>
          <div style={{ height: 1, background: 'var(--line)' }} />
          {usdcBalance !== null && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0' }}>
              <span style={{ fontFamily: 'var(--S)', fontSize: 15, color: 'var(--text-3)' }}>Your balance</span>
              <span style={{ fontFamily: 'var(--M)', fontSize: 14, fontVariantNumeric: 'tabular-nums', color: hasInsufficient ? '#f87171' : 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <UsdcIcon size={11} />
                {usdcBalance.toFixed(2)}{hasInsufficient ? ' — insufficient' : ''}
              </span>
            </div>
          )}

          {(inProgress || txStatus === 'waiting') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surf-2)', borderRadius: 'var(--radius-card)', padding: '14px 16px', marginTop: 14 }}>
              {[
                { label: 'Booking created', active: txStatus === 'booking', done: txStatus !== 'booking' },
                { label: 'Funding CASI escrow…', active: txStatus === 'streaming', done: txStatus === 'waiting' },
                { label: 'Waiting for streamer approval', active: txStatus === 'waiting', done: false },
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, fontFamily: 'var(--B)', fontWeight: 500, fontSize: 15, color: step.done || step.active ? 'var(--ink)' : 'var(--text-4)' }}>
                  <span style={{ width: 16, textAlign: 'center', display: 'inline-block', fontFamily: 'var(--M)', animation: step.active ? 'scm-spin 1s linear infinite' : 'none' }}>
                    {stepIcon(step.active, step.done)}
                  </span>
                  {step.label}
                  {step.active && i === 2 && solscanUrl && (
                    <a href={solscanUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', fontFamily: 'var(--M)', fontSize: 11, color: 'var(--ink)', textDecoration: 'none', opacity: 0.8 }}>
                      ↗ verify tx
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {txStatus === 'error' && txError && (
            <div style={{ background: 'rgba(192,72,48,0.08)', border: '1px solid rgba(192,72,48,0.24)', borderRadius: 'var(--radius-card)', padding: '12px 16px', marginTop: 14, fontFamily: 'var(--S)', fontSize: 15, lineHeight: 1.4, color: '#c0562c' }}>
              {txError} <span onClick={onConfirm} style={{ fontStyle: 'italic', borderBottom: '1px solid rgba(192,72,48,0.5)', cursor: 'pointer' }}>try again</span>
            </div>
          )}

          {!inProgress && txStatus !== 'waiting' && shortWallet && (
            <div style={{ fontFamily: 'var(--S)', fontStyle: 'italic', fontSize: 13, lineHeight: 1.6, color: 'var(--text-4)', marginTop: 14 }}>
              Funds held in CASI on-chain escrow and vest over the beam duration — unused USDC returns if ended early.
              {' '}<span style={{ color: '#facc15' }}>Verify recipient {shortWallet} in your wallet popup.</span>
            </div>
          )}

          <button
            type="button"
            onClick={onConfirm}
            disabled={inProgress || hasInsufficient}
            style={{
              width: '100%', height: 56, marginTop: 18, border: 'none', borderRadius: 'var(--radius-pill)',
              background: inProgress || hasInsufficient ? 'var(--surf-2)' : 'var(--ink)',
              color: inProgress || hasInsufficient ? 'var(--text-4)' : 'var(--on-ink)',
              fontFamily: 'var(--B)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em',
              cursor: inProgress || hasInsufficient ? 'not-allowed' : 'pointer',
            }}
          >
            {ctaLabel}
          </button>
          <div style={{ fontFamily: 'var(--S)', fontStyle: 'italic', fontSize: 15, color: 'var(--text-3)', textAlign: 'center', marginTop: 12 }}>
            Escrowed, released by the minute.
          </div>
        </div>
      </div>
    </div>
  );
}
