'use client';

import { EXPLORER_CLUSTER_QUERY, IS_MAINNET } from '@/lib/solana-network';
import UsdcIcon from '@/components/icons/UsdcIcon';
import { formatSlotPrice } from '@/lib/slot-pricing';
import { formatTime } from './time';

export type TxStatus = 'idle' | 'booking' | 'streaming' | 'waiting' | 'error';

/** Live SOL→USDC quote state for the "pay with SOL" toggle — see
 *  src/lib/jupiter-swap.ts. solRequired is UI SOL (not lamports), and
 *  already includes the one-time USDC-wallet-creation cost (needsSetup)
 *  when applicable — it's the real total that gets debited, not just the
 *  swapped amount. */
export type SwapQuoteState = {
  loading: boolean;
  solRequired: number | null;
  needsSetup: boolean;
  error: string | null;
};

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
  /** Viewer's SOL balance — drives both the pay-with-SOL toggle's
   *  availability (implicitly, via the parent knowing whether to bother)
   *  and the "insufficient" check once that path is selected. */
  solBalance: number | null;
  /** True once the viewer has opted into paying with SOL instead of USDC
   *  (only offered when USDC alone doesn't cover the booking). */
  paySol: boolean;
  onTogglePaySol: (v: boolean) => void;
  /** Live quote for the SOL amount the swap would need — null until the
   *  parent starts fetching one (i.e. before paySol is ever toggled on). */
  swapQuote: SwapQuoteState | null;
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
  slot, duration, estimatedCost, username, recipientWallet, usdcBalance, solBalance,
  paySol, onTogglePaySol, swapQuote,
  txStatus, txError, txId, submitting, onConfirm, onCancel,
}: Props) {
  const usdcShort = usdcBalance !== null && usdcBalance < parseFloat(estimatedCost);
  // Only offer the SOL-swap path while nothing's in flight — flipping
  // payment method under an in-progress submit would race the pre-flight
  // logic in submitSolanaBooking.
  const canOfferSwap = usdcShort && (txStatus === 'idle' || txStatus === 'error');
  const hasInsufficient = paySol
    ? !swapQuote?.solRequired || (solBalance !== null && solBalance < swapQuote.solRequired)
    : usdcShort && (txStatus === 'idle' || txStatus === 'error');
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
          {usdcBalance !== null && !paySol && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0' }}>
              <span style={{ fontFamily: 'var(--S)', fontSize: 15, color: 'var(--text-3)' }}>Your balance</span>
              <span style={{ fontFamily: 'var(--M)', fontSize: 14, fontVariantNumeric: 'tabular-nums', color: hasInsufficient ? '#f87171' : 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <UsdcIcon size={11} />
                {usdcBalance.toFixed(2)}{hasInsufficient ? ' — insufficient' : ''}
              </span>
            </div>
          )}

          {/* Not enough USDC — offer swapping SOL for it in the same
              signature. Reads as reassurance, not a fee disclosure: the
              added cost is a trivial network fee, most of which comes back
              as unused USDC anyway. See docs/pay-with-sol-design-brief.md. */}
          {canOfferSwap && (
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0',
                fontFamily: 'var(--S)', fontStyle: 'italic', fontSize: 14, color: 'var(--text-3)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={paySol}
                onChange={(e) => onTogglePaySol(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: 'var(--ink)', flexShrink: 0 }}
              />
              Not enough USDC — pay with SOL instead (swapped automatically, one signature)
            </label>
          )}

          {paySol && (
            <div style={{ padding: '9px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--S)', fontSize: 15, color: 'var(--text-3)' }}>Paying with</span>
                <span style={{ fontFamily: 'var(--M)', fontSize: 14, fontVariantNumeric: 'tabular-nums', color: hasInsufficient ? '#f87171' : 'var(--text)' }}>
                  {swapQuote?.loading
                    ? 'getting quote…'
                    : swapQuote?.error
                      ? swapQuote.error
                      : swapQuote?.solRequired
                        ? `≈ ${swapQuote.solRequired.toFixed(4)} SOL${solBalance !== null && solBalance < swapQuote.solRequired ? ' — insufficient' : ''}`
                        : '—'}
                </span>
              </div>
              {/* This total already has the one-time wallet-setup cost
                  folded in when it applies — surfaced explicitly rather
                  than left as an unexplained gap between this number and a
                  naive price/rate conversion, which is disproportionately
                  the case for a $ smaller booking on a first-ever SOL→USDC
                  swap (a flat ~0.002 SOL setup cost is a small fraction of
                  a $50 booking but a large one of a $1 flash). */}
              {!swapQuote?.loading && !swapQuote?.error && swapQuote?.needsSetup && (
                <div style={{ fontFamily: 'var(--S)', fontStyle: 'italic', fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>
                  Includes a one-time ~0.002 SOL cost to open your USDC wallet — first USDC swap only.
                </div>
              )}
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
