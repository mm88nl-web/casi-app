"use client";
/**
 * SendFlashSection
 *
 * Viewer-facing form to send a Flash (one-time paid chat message).
 * Supports three rails via PaymentManager:
 *   - stripe  — always available if the streamer has a connected Stripe account
 *   - solana  — gated on NEXT_PUBLIC_CASI_SOLANA_ENABLED (devnet-only indefinitely)
 *   - free    — gated on profile.allow_free_flashes; 1/minute rate-limited server-side
 *
 * Extracted from overlay/page.tsx as part of the Phase-1 tidy-up — the page
 * used to carry the whole form inline (~300 lines).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { createClient } from '@/utils/supabase/client';
import { sendFlash, SOLANA_ENABLED, type PaymentMethod } from '@/lib/payment-manager';
import { useStoredPhantomConnectSession } from '@/lib/phantom-connect';
import { useWalletBalances } from '@/lib/wallet-balances';
import { rememberFlashToken } from '@/app/overlay/_components/viewerStorage';
import { EXPLORER_CLUSTER_QUERY, USDC_MINT, SOLANA_RPC, WALLET_ADAPTER_CLUSTER } from '@/lib/solana-network';
import { TurnstileWidget } from '@/components/TurnstileWidget';
import EmbeddedCheckoutModal from '@/components/EmbeddedCheckoutModal';
import StripeIcon from '@/components/icons/StripeIcon';
import UsdcIcon from '@/components/icons/UsdcIcon';
import { fiatSymbol, formatFiat } from '@/lib/currency';

/** Mirrors SolanaConfirmModal's SwapQuoteState (overlay/_components) — same
 *  shape, kept local rather than shared since this component's UI doesn't
 *  reuse that modal at all, just the same underlying numbers. */
type FlashSwapQuoteState = {
  loading: boolean;
  solRequired: number | null;
  swapOnlySol: number | null;
  needsSetup: boolean;
  error: string | null;
};

// Minimal shape of the streamer profile we actually read.
interface StreamerProfileLite {
  solana_wallet?: string | null;
  allow_free_flashes?: boolean | null;
  /** Stripe Connect default_currency (lowercase ISO-4217). Drives the fiat
   *  symbol on the amount input + submit button. null means Stripe isn't
   *  connected — the fiat option won't render, so this never gets used. */
  settlement_currency?: string | null;
}

// Matching the old `myFlash` shape returned by Supabase realtime.
interface MyFlashRow {
  id: string;
  status: 'pending' | 'approved' | 'denied';
  viewer_name?: string;
  tx_signature?: string | null;
}

interface Props {
  profileId: string;
  username: string;
  viewerName: string;
  showNotif: (text: string, type: string) => void;
  profile: StreamerProfileLite;
  /**
   * Render the composer body directly, skipping the collapsed "Send a Flash"
   * summary card + open/close header. Used by ChatPanel when tip-mode is
   * active so the flash composer sits inline with the chat input.
   */
  embedded?: boolean;
  /** Fires after a successful send — caller can collapse tip-mode, clear UI, etc. */
  onSent?: () => void;
}

const AMOUNT_PRESETS = [2, 5, 10, 20];

export default function SendFlashSection({
  profileId, username, viewerName, showNotif, profile, embedded = false, onSent,
}: Props) {
  // Collapsed by default in both modes — embedded FlashPanel uses a small
  // toggle bar to expand, standalone mode uses its own summary card.
  // Starting open only ever made sense in a dedicated send-flash surface;
  // inside the chat box the feed is primary and composing is a side
  // action, so same default makes sense.
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('5');
  const [submitting, setSubmitting] = useState(false);
  const [myFlash, setMyFlash] = useState<MyFlashRow | null>(null);
  // A pending flash chip can hog the UI indefinitely if the streamer goes
  // offline before moderating — these refs let the viewer manually dismiss
  // the status chips without fighting the realtime subscription (which would
  // otherwise keep replacing a locally-cleared myFlash).
  const [dismissedFlashId, setDismissedFlashId] = useState<string | null>(null);
  const [dismissedOnChainTx, setDismissedOnChainTx] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');
  const [onChainStatus, setOnChainStatus] = useState<null | 'locking' | 'locked'>(null);
  const [onChainTx, setOnChainTx] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Stripe Embedded Checkout — replaces the old redirect-to-checkout_url
  // flow (see EmbeddedCheckoutModal.tsx). null = modal hidden.
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  // Pay-with-SOL — mirrors overlay/page.tsx::submitSolanaBooking's paySol
  // branch, adapted to this component's own (much simpler) form shape. See
  // that file's PendingBooking['swap_target'] and stashFlashSwapRestore doc
  // comments for why this needed its own mobile-restore mechanism rather
  // than reusing the beam booking's swap_ctx restore directly.
  const [paySol, setPaySol] = useState(false);
  const [swapQuote, setSwapQuote] = useState<FlashSwapQuoteState | null>(null);
  // True right after the swap step lands and paySol flips back to false —
  // without this, the follow-up Send tap looks identical to an ordinary
  // single-step USDC flash, with nothing telling the viewer they're on
  // step 2 of a flow they already approved once.
  const [justSwapped, setJustSwapped] = useState(false);
  const onTurnstileVerify = useCallback((t: string) => setTurnstileToken(t), []);
  const onTurnstileExpire = useCallback(() => setTurnstileToken(null), []);
  const supabase = useRef(createClient()).current;

  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions, sendTransaction, connected } = useWallet();
  // Phantom Connect deeplink session — viewer connected via the encrypted
  // mobile path won't have a wallet-adapter publicKey/signTransaction but
  // they DO have a session pubkey. Treat that as connected.
  const pcSession = useStoredPhantomConnectSession();
  const effectivePublicKey = publicKey ?? (pcSession ? new PublicKey(pcSession.walletPublicKey) : null);
  const isWalletConnected = connected || !!pcSession;
  // Shared module-level store (see wallet-balances.ts) — same numbers the
  // top nav / booking form already show, no extra RPC subscription.
  const { sol: solBalance, usdc: usdcBalance } = useWalletBalances();

  const freeAllowed   = !!profile?.allow_free_flashes;
  const solanaAllowed = SOLANA_ENABLED && !!profile?.solana_wallet;

  // If the current selection becomes unavailable (e.g. toggle off), fall back to stripe.
  useEffect(() => {
    if (paymentMethod === 'solana' && !solanaAllowed) setPaymentMethod('stripe');
    if (paymentMethod === 'free'   && !freeAllowed)   setPaymentMethod('stripe');
  }, [paymentMethod, solanaAllowed, freeAllowed]);

  // Leaving the Solana rail (manual switch or the fallback above) clears
  // pay-with-SOL state so it can't leak into an unrelated later send.
  useEffect(() => {
    if (paymentMethod !== 'solana') { setPaySol(false); setSwapQuote(null); setJustSwapped(false); }
  }, [paymentMethod]);

  // Restore after a mobile pay-with-SOL swap round-trip. The redirect is a
  // full page navigation, so this component was unmounted and every piece
  // of local state (message, amount, paymentMethod, open) was lost by the
  // time it remounts here — consumeFlashSwapRestore is the one-shot
  // localStorage handoff the phantom-connect-return handler in
  // overlay/page.tsx wrote right when the swap confirmed (see its
  // swap_target === 'flash' branch). Runs once on mount; deliberately not
  // re-checked later — a real navigation is the only way this component
  // remounts, so polling for it after mount would just be dead code.
  useEffect(() => {
    (async () => {
      const pc = await import('@/lib/phantom-connect');
      const restore = pc.consumeFlashSwapRestore();
      if (!restore) return;
      setMessage(restore.message);
      setAmount(restore.amount);
      setPaymentMethod('solana');
      setPaySol(false);
      setJustSwapped(true);
      setOpen(true);
      showNotif('◎ Swap complete — confirm your flash below to finish', 'success');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime subscription — keep `myFlash` in sync with this viewer's latest row.
  useEffect(() => {
    if (!viewerName || !profileId) return;
    const channel = supabase
      .channel(`my_flashes_${profileId}_${viewerName}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'flashes',
        filter: `profile_id=eq.${profileId}`,
      }, (payload) => {
        const row = payload.new as MyFlashRow | undefined;
        if (row?.viewer_name === viewerName) {
          setMyFlash(row);
          if (row.status === 'approved') showNotif('⚡ Your flash is live on stream!', 'success');
          if (row.status === 'denied')   showNotif('Flash was not approved — no charge.', 'denied');
          // Once the streamer has acted, the "Locking…" / "Locked on-chain
          // — awaiting approval" banners are stale. Clear them so the
          // approved/denied banner is the single source of truth.
          if (row.status === 'approved' || row.status === 'denied') {
            setOnChainStatus(null);
            setOnChainTx(null);
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profileId, viewerName, supabase, showNotif]);

  // Auto-dismiss the "live on stream" banner after a beat. The streamer's
  // approval is a moment in time — leaving the green chip up forever clutters
  // the composer next time the viewer wants to send something. The Solscan
  // link lives permanently in MyFlashesHistory below, so dismissing here
  // doesn't lose the audit trail.
  useEffect(() => {
    if (myFlash?.status !== 'approved') return;
    const t = setTimeout(() => setMyFlash(null), 10_000);
    return () => clearTimeout(t);
  }, [myFlash?.status, myFlash?.id]);

  const amountCents = Math.round(parseFloat(amount || '0') * 100);
  const amountUsdc  = Math.round(parseFloat(amount || '0') * 1_000_000);
  // signTransaction is only required for the desktop / in-app-browser path
  // — the Phantom Connect mobile path signs in Phantom natively and we
  // never invoke a wallet-adapter signer here.
  const solanaReady =
    paymentMethod !== 'solana' ||
    (isWalletConnected && !!effectivePublicKey && !!profile?.solana_wallet);

  const usdcShort = paymentMethod === 'solana' && usdcBalance !== null && usdcBalance < amountCents / 100;
  // Offered any time nothing's in flight and USDC is the active rail — not
  // just when USDC is short, mirrors the beam booking flow's own toggle
  // (a viewer might simply prefer paying in SOL).
  const canOfferSwap = paymentMethod === 'solana' && !submitting;
  const solInsufficient = paySol && (!swapQuote?.solRequired || (solBalance !== null && solBalance < swapQuote.solRequired));

  const canSend =
    !submitting &&
    message.trim().length > 0 &&
    (paymentMethod === 'free' ? !!turnstileToken : amountCents >= 100 && !isNaN(amountCents)) &&
    solanaReady &&
    !(paySol && solInsufficient);

  // Live SOL→USDC quote for the "pay with SOL" toggle — mirrors
  // overlay/page.tsx's matching effect for the beam booking flow exactly,
  // including the same MIN_SOL_FOR_DEPOSIT_TX_LAMPORTS reserve (a flash's
  // own on-chain creation is the same EscrowState shape as a beam's, just
  // escrow_type Flash instead of Beam, so it needs the same SOL reserve for
  // the transaction that follows this swap).
  useEffect(() => {
    if (!paySol || paymentMethod !== 'solana') return;
    let cancelled = false;
    setSwapQuote({ loading: true, solRequired: null, swapOnlySol: null, needsSetup: false, error: null });
    const fetchQuote = async () => {
      try {
        if (!effectivePublicKey) throw new Error('Connect your wallet first');
        const { getSolToUsdcQuote, ATA_RENT_LAMPORTS, MIN_SOL_FOR_DEPOSIT_TX_LAMPORTS, SWAP_TX_FEE_MARGIN_LAMPORTS } = await import('@/lib/jupiter-swap');
        const { value: existingUsdcAtas } = await connection.getParsedTokenAccountsByOwner(
          effectivePublicKey, { mint: new PublicKey(USDC_MINT) },
        );
        const needsSetup = existingUsdcAtas.length === 0;
        const { lamportsRequired } = await getSolToUsdcQuote({ usdcMint: USDC_MINT, usdcMicroTarget: amountUsdc });
        const swapOnlyLamports = lamportsRequired + (needsSetup ? ATA_RENT_LAMPORTS : 0);
        const totalLamports = swapOnlyLamports + SWAP_TX_FEE_MARGIN_LAMPORTS + MIN_SOL_FOR_DEPOSIT_TX_LAMPORTS;
        if (!cancelled) setSwapQuote({ loading: false, solRequired: totalLamports / 1e9, swapOnlySol: swapOnlyLamports / 1e9, needsSetup, error: null });
      } catch (err) {
        if (!cancelled) setSwapQuote({ loading: false, solRequired: null, swapOnlySol: null, needsSetup: false, error: err instanceof Error ? err.message : 'Quote failed' });
      }
    };
    fetchQuote();
    const interval = setInterval(fetchQuote, 20_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [paySol, paymentMethod, amountUsdc, effectivePublicKey, connection]);

  /**
   * Standalone SOL→USDC swap step — mirrors overlay/page.tsx::
   * submitSolanaBooking's paySol branch. No flash gets created here at
   * all; this only swaps, then (desktop) falls straight through to the
   * unmodified normal sendFlash() call below with a now-sufficient USDC
   * balance, or (mobile) stashes flash-shaped restore context and redirects
   * — see stashFlashSwapRestore's doc comment for why that's a separate
   * localStorage handoff rather than direct React state.
   */
  const handleSolSwap = async () => {
    if (!effectivePublicKey) { showNotif('Connect your wallet first', 'denied'); return; }
    setSubmitting(true);
    try {
      const { Connection: Conn, PublicKey: PK, Transaction: Tx } = await import('@solana/web3.js');
      const conn = new Conn(SOLANA_RPC);
      const solLamports = await conn.getBalance(effectivePublicKey);
      const { value: existingUsdcAtas } = await conn.getParsedTokenAccountsByOwner(
        effectivePublicKey, { mint: new PK(USDC_MINT) },
      );
      const { getSolToUsdcQuote, getSwapInstructions, ATA_RENT_LAMPORTS, MIN_SOL_FOR_DEPOSIT_TX_LAMPORTS, SWAP_TX_FEE_MARGIN_LAMPORTS } = await import('@/lib/jupiter-swap');
      const ataRentLamports = existingUsdcAtas.length === 0 ? ATA_RENT_LAMPORTS : 0;
      const { quote, lamportsRequired } = await getSolToUsdcQuote({ usdcMint: USDC_MINT, usdcMicroTarget: amountUsdc });
      // Reserve for the SEPARATE flash-creation tx that follows — see
      // MIN_SOL_FOR_DEPOSIT_TX_LAMPORTS's doc comment in jupiter-swap.ts.
      const totalLamportsNeeded = SWAP_TX_FEE_MARGIN_LAMPORTS + lamportsRequired + ataRentLamports + MIN_SOL_FOR_DEPOSIT_TX_LAMPORTS;
      if (solLamports < totalLamportsNeeded) {
        showNotif(
          `Need ~${(totalLamportsNeeded / 1e9).toFixed(4)} SOL total (swap + fees${ataRentLamports ? ' + one-time USDC wallet setup' : ''} + flash tx). You have ${(solLamports / 1e9).toFixed(4)} SOL.`,
          'denied',
        );
        return;
      }
      const swapInstructions = await getSwapInstructions({ quote, userPublicKey: effectivePublicKey });
      const swapTx = new Tx();
      swapTx.add(...swapInstructions);
      swapTx.feePayer = effectivePublicKey;
      const { blockhash } = await conn.getLatestBlockhash();
      swapTx.recentBlockhash = blockhash;

      const { needsMobileHandoff, isInWalletBrowser } = await import('@/lib/mobile-wallet');
      if (needsMobileHandoff() && !isInWalletBrowser()) {
        const pc = await import('@/lib/phantom-connect');
        const bs58Mod = await import('bs58');
        const bs58 = bs58Mod.default;
        const txB58 = bs58.encode(swapTx.serialize({ requireAllSignatures: false, verifySignatures: false }));
        const session = pc.getStoredSession();
        const baseHere = window.location.origin + window.location.pathname + window.location.search;
        const sep = window.location.search ? '&' : '?';
        const swapCtx = JSON.stringify({ message: message.trim(), amount });
        if (!session) {
          const walletName = pc.getPreferredDeeplinkWallet();
          pc.stashPendingBooking({
            kind: 'swap', swap_target: 'flash',
            booking_id: '', cancel_token: '', escrow_pda: '',
            viewer_wallet: effectivePublicKey.toBase58(),
            pending_tx: txB58, swap_ctx: swapCtx,
          });
          // Force a fresh dapp keypair for this connect — see
          // regenerateDappKeypair's doc comment in phantom-connect.ts.
          pc.regenerateDappKeypair();
          window.location.href = pc.buildConnectUrl({
            wallet: walletName,
            cluster: WALLET_ADAPTER_CLUSTER,
            redirectTo: `${baseHere}${sep}phantom_action=connect-resume&casi_wallet=${walletName}`,
          });
          return;
        }
        pc.stashPendingBooking({
          kind: 'swap', swap_target: 'flash',
          booking_id: '', cancel_token: '', escrow_pda: '',
          viewer_wallet: effectivePublicKey.toBase58(), swap_ctx: swapCtx,
        });
        window.location.href = pc.buildSignTransactionUrl({
          session, transactionB58: txB58,
          redirectTo: `${baseHere}${sep}phantom_action=sign-resume`,
        });
        return;
      }

      // Desktop / wallet-adapter path — no page navigation, await it
      // directly, same as the beam flow's own desktop swap path.
      if (!sendTransaction) throw new Error('Wallet does not support sending transactions');
      const sig = await sendTransaction(swapTx, conn);
      await conn.confirmTransaction(sig, 'confirmed');
      setPaySol(false);
      setJustSwapped(true);
      showNotif('◎ Swap complete — tap Send again to finish your flash with USDC', 'success');
    } catch (err) {
      console.error('[flash][pay-with-sol] swap step failed', err);
      const { reportClientError } = await import('@/lib/report-client-error');
      reportClientError('overlay/flash-pay-with-sol/swap-step', err, {});
      showNotif(err instanceof Error ? err.message : 'Could not complete the SOL swap — try again', 'denied');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async () => {
    if (!canSend) return;
    if (paymentMethod === 'solana' && paySol) {
      await handleSolSwap();
      return;
    }
    setSubmitting(true);
    setOnChainStatus(null);
    setOnChainTx(null);
    try {
      if (paymentMethod === 'solana') setOnChainStatus('locking');

      const result = await sendFlash({
        method: paymentMethod,
        profileId, viewerName,
        message: message.trim(),
        amountCents: paymentMethod === 'free' ? 0 : amountCents,
        amountUsdc,
        streamerSolanaWallet: profile?.solana_wallet ?? null,
        solana: paymentMethod === 'solana'
          ? { connection, wallet: { publicKey: effectivePublicKey, signTransaction, signAllTransactions } }
          : undefined,
        turnstileToken: turnstileToken ?? undefined,
      });

      // Store the read-ownership credential regardless of which rail this
      // was — /api/flashes/my-status verifies it later so "my activity"
      // can show this flash without a broad anon table read. Not set on
      // the Solana mobile-handoff branch (payment-manager throws before
      // returning there); that path stashes it instead and the Phantom
      // Connect return handler in overlay/page.tsx remembers it on resume.
      if (result.flashId && result.flashViewerToken) {
        rememberFlashToken(result.flashId, result.flashViewerToken);
      }

      if (result.stripeClientSecret) {
        setStripeClientSecret(result.stripeClientSecret);
        return;
      }
      if (result.solana) {
        setOnChainTx(result.solana.sig);
        setOnChainStatus('locked');
        showNotif(`⚡ Flash locked on-chain — awaiting approval · ↗ ${result.solana.solscanUrl}`, 'success');
      }
      if (paymentMethod === 'free') {
        showNotif('⚡ Free flash sent — awaiting approval', 'success');
        setMessage('');
      }
      // Collapse the composer after a successful non-modal send so the feed
      // (in embedded mode) or summary card (standalone) is visible again.
      // The Stripe path exits early above once the checkout modal opens —
      // handleStripeCheckoutComplete below collapses the composer once that
      // payment actually completes.
      setOpen(false);
      setPaySol(false);
      setSwapQuote(null);
      setJustSwapped(false);
      onSent?.();
    } catch (err: unknown) {
      const { formatEscrowError } = await import('@/lib/casi-errors');
      showNotif(formatEscrowError(err), 'denied');
      setOnChainStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  // Found live 2026-09-09: paySol/swapQuote/justSwapped were only reset on
  // handleSend's success path and the payment-method-change effect — not
  // here. Toggle "Pay with SOL", complete the swap (justSwapped -> true),
  // then close via ✕ instead of sending: reopening later to send an
  // unrelated ordinary USDC flash wrongly showed "✓ Step 1 done · Step 2 of
  // 2" for what should be a fresh single-step send. Not a financial-safety
  // bug (paySol itself was already false, so it took the normal path with
  // the correct amount) — just a misleading badge, but worth killing.
  const handleClose = () => {
    setOpen(false);
    setPaySol(false);
    setSwapQuote(null);
    setJustSwapped(false);
  };

  // Embedded Checkout completed — the flash's own realtime subscription
  // above will surface the approve/deny outcome later; this just closes the
  // modal and gives immediate feedback that the payment itself went through.
  const handleStripeCheckoutComplete = () => {
    setStripeClientSecret(null);
    showNotif('⚡ Flash sent — awaiting streamer approval!', 'success');
    setMessage('');
    setOpen(false);
    onSent?.();
  };

  // Viewer dismissed the modal without paying. No explicit cancel call
  // needed here (unlike bookings) — an abandoned pending Stripe flash is
  // already swept by the stripe-janitor cron's existing "Abandoned Stripe
  // flashes" pass, same as if the viewer had closed a redirect-based
  // checkout tab under the old flow.
  const handleStripeCheckoutClose = () => {
    setStripeClientSecret(null);
  };

  // Available methods in the order they render.
  const methods: PaymentMethod[] = ['stripe'];
  if (solanaAllowed) methods.push('solana');
  if (freeAllowed)   methods.push('free');

  // Embedded mode: strip the outer margin + the collapsed-summary / header
  // chrome. The caller (ChatPanel) owns the "am I showing the flash
  // composer right now?" decision and its own close affordance.
  const containerStyle: React.CSSProperties = embedded
    ? { background: 'transparent', padding: 0 }
    : { marginTop: 20 };
  const bodyStyle: React.CSSProperties = embedded
    ? { padding: '12px 14px', background: 'rgba(var(--casi-accent-rgb),0.04)', border: '1px solid rgba(var(--casi-accent-rgb),0.14)', borderRadius: 10, animation: 'fadeIn .2s ease' }
    : { background: 'var(--casi-surface)', border: '1px solid rgba(var(--casi-accent-rgb),0.14)', borderRadius: 14, padding: 20, animation: 'fadeIn .25s ease' };

  return (
    <div style={containerStyle}>
      {!embedded && !open ? (
        <button onClick={() => setOpen(true)}
          style={{ width: '100%', background: 'rgba(var(--casi-accent-rgb),0.06)', border: '1px solid rgba(var(--casi-accent-rgb),0.14)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'background .2s' }}
          onMouseOver={e => (e.currentTarget.style.background = 'rgba(var(--casi-accent-rgb),0.1)')}
          onMouseOut={e => (e.currentTarget.style.background = 'rgba(var(--casi-accent-rgb),0.06)')}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--casi-text)' }}>Send a Flash</div>
            <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, color: 'var(--casi-text-muted)', marginTop: 2 }}>
              {freeAllowed ? 'Free or paid message · shown live on stream' : 'One-time paid message · shown live on stream'}
            </div>
          </div>
          <span style={{ marginLeft: 'auto', fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>→</span>
        </button>
      ) : embedded && !open ? (
        // Compact collapsed bar for embedded mode — lives inside FlashPanel
        // as a single thin row so the feed takes up most of the space.
        // Tapping expands into the full composer below.
        <button
          onClick={() => setOpen(true)}
          style={{
            width: '100%',
            background: 'rgba(var(--casi-accent-rgb),0.08)',
            border: '1px solid rgba(var(--casi-accent-rgb),0.2)',
            borderRadius: 8,
            padding: '8px 12px',
            display: 'flex', alignItems: 'center', gap: 10,
            cursor: 'pointer', transition: 'background .15s',
            fontFamily: "var(--font-casi-mono),monospace", fontSize: 11,
            color: 'var(--casi-accent)',
          }}
          onMouseOver={e => (e.currentTarget.style.background = 'rgba(var(--casi-accent-rgb),0.14)')}
          onMouseOut={e => (e.currentTarget.style.background = 'rgba(var(--casi-accent-rgb),0.08)')}
        >
          <span style={{ fontSize: 14 }}>⚡</span>
          <span style={{ flex: 1, textAlign: 'left' }}>Send a flash{freeAllowed ? ' · free or paid' : ''}</span>
          <span style={{ fontSize: 12 }}>→</span>
        </button>
      ) : (
        <div style={bodyStyle}>
          {/* Embedded header: just a close ✕ on the right since the caller's
              frame (FlashPanel) already provides context. Standalone mode
              shows the big "⚡ Flash · Send a Flash" title + ✕ as before. */}
          {embedded ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-accent)' }}>⚡ Flash</span>
              <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--casi-text-muted)', cursor: 'pointer', fontSize: 14, padding: 2 }}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-accent)', marginBottom: 3 }}>⚡ Flash</div>
                <div style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontSize: 17, fontWeight: 800, color: 'var(--casi-text)' }}>Send a Flash</div>
              </div>
              <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--casi-text-muted)', cursor: 'pointer', fontSize: 18, padding: 4 }}>✕</button>
            </div>
          )}

          {/* Live status feedback */}
          {myFlash?.status === 'approved' && (
            <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: '#4ade80', animation: 'springPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              ✓ Your flash is live on stream!
              {myFlash.tx_signature && (
                <a href={`https://solscan.io/tx/${myFlash.tx_signature}${EXPLORER_CLUSTER_QUERY}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', marginTop: 4, fontSize: 9, color: '#9945FF', textDecoration: 'none', opacity: 0.8 }}>
                  ↗ verify on Solscan
                </a>
              )}
            </div>
          )}
          {myFlash?.status === 'denied' && (
            <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: '#f87171', animation: 'springPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              ✕ Flash was not approved — no charge.
            </div>
          )}
          {myFlash?.status === 'pending' && myFlash.id !== dismissedFlashId && (
            <div style={{ background: 'rgba(var(--casi-accent-rgb),0.06)', border: '1px solid rgba(var(--casi-accent-rgb),0.18)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: 'var(--casi-accent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ animation: 'blink 2s infinite' }}>⌛ Flash sent — awaiting streamer approval</span>
              <button
                onClick={() => setDismissedFlashId(myFlash.id)}
                title="Hide this status"
                style={{ background: 'none', border: 'none', color: 'var(--casi-accent)', cursor: 'pointer', fontSize: 14, opacity: 0.6, padding: 0 }}
              >
                ✕
              </button>
            </div>
          )}

          {/* On-chain banners */}
          {onChainStatus === 'locking' && (
            <div style={{ background: 'rgba(153,69,255,0.08)', border: '1px solid rgba(153,69,255,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: '#c4a0ff', animation: 'springPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              ⛓ Locking USDC in escrow — confirm in your wallet…
            </div>
          )}
          {onChainStatus === 'locked' && onChainTx && onChainTx !== dismissedOnChainTx && (
            <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: '#4ade80', animation: 'springPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                ⚡ Flash locked on-chain — awaiting streamer approval
                <a href={`https://solscan.io/tx/${onChainTx}${EXPLORER_CLUSTER_QUERY}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', marginTop: 4, fontSize: 9, color: '#9945FF', textDecoration: 'none', opacity: 0.8 }}>
                  ↗ verify on Solscan
                </a>
              </div>
              <button
                onClick={() => setDismissedOnChainTx(onChainTx)}
                title="Hide this status"
                style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', fontSize: 14, opacity: 0.6, padding: 0, flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Payment method toggle — only shown if more than one rail is available */}
          {methods.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', display: 'block', marginBottom: 8 }}>Pay with</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {methods.map(pm => {
                  const active = paymentMethod === pm;
                  const labelText = pm === 'stripe' ? 'Card' : pm === 'solana' ? 'Solana' : 'Free';
                  const icon =
                    pm === 'stripe' ? <StripeIcon size={11} /> :
                    pm === 'solana' ? <UsdcIcon size={12} /> :
                    <span style={{ fontFamily: "var(--M), var(--font-casi-mono), monospace", fontSize: 12 }}>★</span>;
                  const activeStyle =
                    pm === 'solana' ? { background: 'rgba(153,69,255,0.12)', borderColor: 'rgba(153,69,255,0.45)', color: '#c4a0ff' } :
                    pm === 'free'   ? { background: 'rgba(74,222,128,0.12)',  borderColor: 'rgba(74,222,128,0.4)',  color: '#4ade80' } :
                                       { background: 'rgba(var(--casi-accent-rgb),0.12)', borderColor: 'rgba(var(--casi-accent-rgb),0.45)', color: 'var(--casi-accent)' };
                  return (
                    <button key={pm} type="button" onClick={() => setPaymentMethod(pm)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid', fontFamily: "var(--M), var(--font-casi-mono), monospace", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer', transition: 'all .2s cubic-bezier(0.34,1.56,0.64,1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        ...(active ? { ...activeStyle, transform: 'scale(1.02)' } : { background: 'none', borderColor: 'var(--casi-border)', color: 'var(--casi-text-muted)', transform: 'scale(1)' }) }}>
                      {icon}
                      <span>{labelText}</span>
                    </button>
                  );
                })}
              </div>
              {paymentMethod === 'solana' && !profile?.solana_wallet && (
                <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, color: '#f87171', marginTop: 6 }}>
                  @{username} hasn&apos;t linked a Solana wallet yet.
                </div>
              )}
              {/* No inline "Connect wallet" prompt — the top-of-page wallet
                  pill is the single connect surface, mirroring how every
                  other action in the app handles a not-yet-connected
                  viewer. The submit button below renders disabled until
                  the pill reports a session. */}
            </div>
          )}

          {/* Message */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', display: 'block', marginBottom: 8 }}>Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={200} rows={3}
              placeholder="Say something to the stream…"
              className="bf-inp" style={{ resize: 'none' }} />
            <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, color: '#333', marginTop: 4, textAlign: 'right' }}>{message.length}/200</div>
          </div>

          {/* Amount — hidden entirely for the free rail */}
          {paymentMethod !== 'free' && (() => {
            const streamerFiat = profile.settlement_currency ?? 'usd';
            const fiatSym = fiatSymbol(streamerFiat);
            const fiatLabel = streamerFiat.toUpperCase();
            return (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', display: 'block', marginBottom: 8 }}>
                Amount {paymentMethod === 'solana' ? '(USDC)' : `(${fiatLabel})`}
              </label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {AMOUNT_PRESETS.map(p => (
                  <button key={p} type="button" onClick={() => setAmount(String(p))}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid', fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      ...(parseFloat(amount) === p
                        ? { background: 'rgba(var(--casi-accent-rgb),0.12)', borderColor: 'rgba(var(--casi-accent-rgb),0.35)', color: 'var(--casi-accent)' }
                        : { background: 'none', borderColor: 'var(--casi-border)', color: 'var(--casi-text-muted)' }) }}>
                    {paymentMethod === 'solana' ? `${p} USDC` : `${fiatSym}${p}`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', borderRadius: 10, padding: '10px 14px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: "var(--M), var(--font-casi-mono), monospace", fontSize: 13, color: 'var(--casi-text-muted)' }}>
                  {paymentMethod === 'solana' ? <UsdcIcon size={14} /> : fiatSym}
                </span>
                <input type="number" value={amount} min="1" step="1" onChange={e => setAmount(e.target.value)}
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 17, fontWeight: 700, color: 'var(--casi-text)', fontFamily: "var(--B), var(--font-casi-sans), sans-serif" }} />
                <span style={{ fontFamily: "var(--M), var(--font-casi-mono), monospace", fontSize: 9, color: '#333', whiteSpace: 'nowrap' }}>
                  {paymentMethod === 'solana' ? 'min 1 USDC' : `min ${fiatSym}1`}
                </span>
              </div>
            </div>
            );
          })()}

          {/* Pay-with-SOL toggle + breakdown — mirrors SolanaConfirmModal's
              swap offer (see docs/pay-with-sol-design-brief.md) in this
              component's own inline-style vocabulary, since this form
              doesn't render that modal at all. Available any time nothing's
              in flight on the Solana rail, not just when USDC is short — a
              viewer might simply prefer paying in SOL. */}
          {canOfferSwap && (
            <div style={{ marginBottom: 14 }}>
              {(paySol || justSwapped) && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '4px 10px', borderRadius: 999, background: 'rgba(153,69,255,0.14)', fontFamily: "var(--font-casi-mono), monospace", fontWeight: 700, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#c4a0ff' }}>
                  {justSwapped ? '✓ Step 1 done · Step 2 of 2 — send flash' : 'Step 1 of 2 · Swap SOL → USDC'}
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>
                <input type="checkbox" checked={paySol} onChange={e => setPaySol(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: '#9945FF', flexShrink: 0 }} />
                {usdcShort ? 'Not enough USDC — pay with SOL instead' : 'Pay with SOL instead'} (auto-swapped via Jupiter, two quick signatures)
              </label>
              {paySol && (
                <div style={{ marginTop: 8, background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>Paying with</span>
                    <span style={{ fontFamily: "var(--M), var(--font-casi-mono), monospace", fontSize: 12, color: solInsufficient ? '#f87171' : 'var(--casi-text)' }}>
                      {swapQuote?.loading
                        ? 'getting quote…'
                        : swapQuote?.error
                          ? swapQuote.error
                          : swapQuote?.swapOnlySol
                            ? `≈ ${swapQuote.swapOnlySol.toFixed(4)} SOL`
                            : '—'}
                    </span>
                  </div>
                  {!swapQuote?.loading && !swapQuote?.error && swapQuote?.solRequired != null && (
                    <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, color: '#333', marginTop: 6, lineHeight: 1.6 }}>
                      Your wallet needs ≈ {swapQuote.solRequired.toFixed(4)} SOL on hand in total
                      {solInsufficient ? <span style={{ color: '#f87171' }}> — insufficient</span> : null}
                      : the swap above, a small network-fee margin{swapQuote.needsSetup ? ', a one-time ~0.002 SOL cost to open your USDC wallet' : ''}, and ~0.015 SOL reserved for the flash step right after.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Captcha — only needed for free rail */}
          {paymentMethod === 'free' && (
            <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
              <TurnstileWidget
                onVerify={onTurnstileVerify}
                onExpire={onTurnstileExpire}
                theme="dark"
                compact
              />
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSend} disabled={!canSend}
            style={{ width: '100%',
              background: canSend
                ? (paymentMethod === 'solana' ? '#9945FF' : paymentMethod === 'free' ? '#4ade80' : 'var(--casi-accent)')
                : 'var(--casi-border)',
              border: 'none', borderRadius: 10, padding: '13px 0', fontFamily: "var(--font-casi-sans), sans-serif", fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.3,
              color: canSend
                ? (paymentMethod === 'solana' ? '#fff' : '#050505')
                : '#444',
              cursor: canSend ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all .2s' }}>
            {paymentMethod === 'solana' ? (
              <UsdcIcon size={14} mono="#fff" />
            ) : paymentMethod === 'free' ? (
              <span style={{ fontFamily: "var(--M), var(--font-casi-mono), monospace", fontSize: 14, lineHeight: 1 }}>★</span>
            ) : (
              <StripeIcon size={11} mono="#050505" />
            )}
            {paymentMethod === 'solana'
              ? (submitting
                  ? (paySol ? 'Swapping SOL…' : onChainStatus === 'locking' ? 'Locking on-chain…' : 'Submitting…')
                  : paySol ? 'Swap & continue →' : `${(amountCents / 100).toFixed(2)} USDC Flash`)
              : paymentMethod === 'free'
                ? (submitting ? 'Sending…' : 'Send Free Flash')
                : (submitting ? 'Preparing…' : `${formatFiat(profile.settlement_currency, amountCents / 100)} Flash`)}
          </button>

          <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, color: '#2a2a2a', textAlign: 'center', marginTop: 10, lineHeight: 1.9 }}>
            {paymentMethod === 'solana'
              ? <>USDC held in a CASI escrow PDA · Refunded on deny · <span style={{ color:'#9945FF' }}>audited Anchor program</span><br /></>
              : paymentMethod === 'free'
                ? <>Free message · 1 per minute · streamer can deny or approve<br /></>
                : <>Payment held until streamer approves · Fully refunded if denied<br /></>}
            {paymentMethod !== 'free' && (
              <span style={{ color: '#444' }}>100% → @{username} · no platform fee</span>
            )}
          </div>
        </div>
      )}

      {stripeClientSecret && (
        <EmbeddedCheckoutModal
          clientSecret={stripeClientSecret}
          onComplete={handleStripeCheckoutComplete}
          onClose={handleStripeCheckoutClose}
        />
      )}
    </div>
  );
}
