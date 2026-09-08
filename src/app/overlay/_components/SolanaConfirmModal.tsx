'use client';

import { EXPLORER_CLUSTER_QUERY, IS_MAINNET } from '@/lib/solana-network';
import UsdcIcon from '@/components/icons/UsdcIcon';
import { formatSlotPrice } from '@/lib/slot-pricing';
import { formatTime } from './time';

export type TxStatus = 'idle' | 'booking' | 'streaming' | 'waiting' | 'error';

/** Live SOL→USDC quote state for the "pay with SOL" toggle — see
 *  src/lib/jupiter-swap.ts. Both amounts are UI SOL (not lamports).
 *  `swapOnlySol` is what the swap transaction actually converts (plus the
 *  one-time USDC-wallet-creation cost when `needsSetup`). `solRequired` is
 *  bigger and is the real "balance the wallet needs on hand" figure used
 *  for the insufficient-funds check — swapOnlySol, plus the swap tx's own
 *  network-fee margin, plus a reserve for the SEPARATE booking transaction
 *  that follows this swap (not spent by the swap at all, but the whole
 *  two-step flow fails partway through without it — see the matching
 *  comment on MIN_SOL_FOR_BOOKING_LAMPORTS in overlay/page.tsx). */
export type SwapQuoteState = {
  loading: boolean;
  solRequired: number | null;
  swapOnlySol: number | null;
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
  /** True right after the swap step has landed and the viewer is back here
   *  for the second, plain-USDC confirm. Without this, that second confirm
   *  is visually identical to an ordinary single-step USDC payment — two
   *  "one step" screens back to back instead of one visibly two-step flow.
   *  Drives the "Step 1 of 2" / "Step 2 of 2" badge below. */
  justSwapped: boolean;
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
  paySol, onTogglePaySol, swapQuote, justSwapped,
  txStatus, txError, txId, submitting, onConfirm, onCancel,
}: Props) {
  const usdcShort = usdcBalance !== null && usdcBalance < parseFloat(estimatedCost);
  // Offered any time nothing's in flight — not just when USDC is short.
  // Originally gated on usdcShort only, but that hid the option entirely
  // for a viewer who wants to pay with SOL by choice even with enough USDC
  // on hand, and (worse) could hide it outright during the brief window
  // right after connecting a fresh wallet where usdcBalance is still null
  // rather than a real 0. Flipping payment method under an in-progress
  // submit would still race submitSolanaBooking's pre-flight, hence the
  // txStatus guard.
  const canOfferSwap = txStatus === 'idle' || txStatus === 'error';
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
  const ctaLabel = inProgress
    ? 'Signing…'
    : hasInsufficient
      ? 'Not enough to cover it'
      : txStatus === 'error'
        ? 'Retry →'
        // Step 1's tap only signs the swap, not the booking — say so,
        // rather than reusing "Confirm & sign" for a button that doesn't
        // actually confirm the booking yet.
        : paySol ? 'Swap & continue →' : 'Confirm & sign →';

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
          {/* Paying with SOL is two separate signatures (swap, then the
              actual escrow deposit) — this badge is the only thing telling
              the viewer they're on a multi-step flow instead of looking at
              two back-to-back, visually-identical single-step screens. */}
          {(paySol || justSwapped) && (
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
                padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.16)',
                fontFamily: 'var(--B)', fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase',
              }}
            >
              {justSwapped ? '✓ Step 1 done · Step 2 of 2 — fund escrow' : 'Step 1 of 2 · Swap SOL → USDC'}
            </div>
          )}
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

          {/* Offer swapping SOL for USDC — available whether or not USDC is
              actually short, since a viewer might simply prefer to pay in
              SOL. Reads as reassurance, not a fee disclosure: the added cost
              is a trivial network fee, most of which comes back as unused
              USDC anyway (any real one-time wallet-setup cost is broken out
              separately below, once known). Two signatures, not one — a
              combined swap+deposit transaction doesn't fit Solana's legacy
              size limit even in the best case (measured live, see the
              design brief) — the "Step 1 of 2" badge above communicates
              that once checked; this label sets the expectation up front.
              See docs/pay-with-sol-design-brief.md. */}
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
              {usdcShort ? 'Not enough USDC — pay with SOL instead' : 'Pay with SOL instead'} (auto-swapped via Jupiter, two quick signatures)
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
                      : swapQuote?.swapOnlySol
                        ? `≈ ${swapQuote.swapOnlySol.toFixed(4)} SOL`
                        : '—'}
                </span>
              </div>
              {/* This is the number that actually gets converted — kept
                  separate from the wallet's TOTAL balance requirement
                  (solRequired, used for the insufficient-funds check below
                  and shown in the breakdown here) because that total also
                  includes SOL the swap never touches: its own network-fee
                  margin, a one-time USDC-wallet-creation cost on a first
                  swap, and a reserve for the separate booking transaction
                  that follows right after. Folding all of that into one
                  "Paying with" figure would overstate what's actually being
                  traded away — but hiding it entirely is exactly the kind
                  of surprise-fee outcome this line is here to prevent. */}
              {!swapQuote?.loading && !swapQuote?.error && swapQuote?.solRequired != null && (
                <div style={{ fontFamily: 'var(--S)', fontStyle: 'italic', fontSize: 12, color: 'var(--text-4)', marginTop: 4, lineHeight: 1.5 }}>
                  Your wallet needs ≈ {swapQuote.solRequired.toFixed(4)} SOL on hand in total
                  {solBalance !== null && solBalance < swapQuote.solRequired ? <span style={{ color: '#f87171' }}> — insufficient</span> : null}
                  : the swap above, a small network-fee margin{swapQuote.needsSetup ? ', a one-time ~0.002 SOL cost to open your USDC wallet' : ''}, and ~0.015 SOL reserved for the booking step right after (not spent by this swap, just has to be present).
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
