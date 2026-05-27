"use client";
import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { useStoredPhantomConnectSession } from '@/lib/phantom-connect';
import SkinProvider from '@/components/SkinProvider';
import { formatSlotPrice } from '@/lib/slot-pricing';
import WalletPill from '@/components/WalletPill';
import { refreshWalletNav } from '@/components/WalletNav';
import SlotMedia from '@/components/SlotMedia';
import { useWalletBalances } from '@/lib/wallet-balances';
import { BANNER_MAX_MESSAGE } from '@/lib/banner';
import FlashPanel from '@/components/FlashPanel';
import TurnstileWidget from '@/components/TurnstileWidget';
import {
  SOLANA_RPC,
  USDC_MINT,
  EXPLORER_CLUSTER_QUERY,
  IS_MAINNET,
  WALLET_ADAPTER_CLUSTER,
} from '@/lib/solana-network';
import { CasiMark, Wordmark } from '@/components/v9';
import Countdown from './_components/Countdown';
import { getSecondsRemaining, formatTime } from './_components/time';
import {
  VIEWER_NAME_KEY,
  readBookingTokens,
  rememberBookingToken,
  forgetBookingToken,
  generateRandomName,
} from './_components/viewerStorage';
import NameEntryScreen from './_components/NameEntryScreen';
import SolanaConfirmModal, { type TxStatus } from './_components/SolanaConfirmModal';
import FlashFeed from './_components/FlashFeed';
import MyBeamsSection from './_components/MyBeamsSection';
import MyTransactionsSection, { type TxRow } from './_components/MyTransactionsSection';
import SlotsList from './_components/SlotsList';
import StuckFlashesPanel from './_components/StuckFlashesPanel';
import BrandFooter from './_components/BrandFooter';
import BookingForm from './_components/BookingForm';
import BrowseStreamersModal from './_components/BrowseStreamersModal';

// Explicit column list for bookings reads. Belt + suspenders alongside the
// column-level GRANT in 20260423 — if a new sensitive column lands on
// bookings and someone forgets to update the REVOKE/GRANT list, clients
// here still only ask for known columns.
const BOOKING_COLS = 'id, created_at, profile_id, element_id, viewer_name, status, image_url, storage_path, file_type, message, duration_minutes, price_value, price_unit, payment_method, tx_signature, payment_intent_id, original_amount_cents, approved_at, started_at, escrow_pda, viewer_wallet, is_queued, queue_position, banner_font_px, banner_speed_secs, media_offset_x, media_offset_y, media_zoom';
const BOOKING_PAGE_LIMIT = 200;

// How long a Stripe-denied booking stays surfaced to the viewer with the
// "refund on the way" chip. Anchored on `created_at` because there's no
// `denied_at` column — see comments at the use sites. 10 minutes covers
// realistic streamer moderation latency without trailing stale history.
const STRIPE_DENIED_WINDOW_MS = 10 * 60 * 1000;



function OverlayContent() {
  const searchParams = useSearchParams();
  const username = searchParams.get('s') || '';
  const isOBS = searchParams.get('mode') === 'obs';

  const [elements, setElements]         = useState<any[]>([]);
  const [profile, setProfile]           = useState<any>(null);
  const [activeBookings, setActiveBookings]   = useState<any[]>([]);
  const [approvedQueuedBookings, setApprovedQueuedBookings] = useState<any[]>([]);
  const [queueCounts, setQueueCounts]   = useState<Record<string,number>>({});
  const [loading, setLoading]           = useState(true);
  const [myBookings, setMyBookings]     = useState<any[]>([]);
  // Stuck Solana flashes the viewer paid for but that never settled —
  // either the streamer hasn't moderated yet OR a prior moderation
  // closed the PDA but the DB row is stale (drift). Surfaces a
  // viewer-driven recovery card on the overlay so users aren't waiting
  // on the streamer to unstick something.
  const [myStuckFlashes, setMyStuckFlashes] = useState<any[]>([]);
  // Historical activity for this viewer on this streamer — feeds the
  // MyTransactionsSection panel under the composer. Populated by loadData
  // alongside the active-row + stuck-flash queries.
  const [myHistory, setMyHistory] = useState<TxRow[]>([]);
  const [reclaimingFlash, setReclaimingFlash] = useState<string | null>(null);
  const [expiringSoon, setExpiringSoon] = useState<Set<string>>(new Set());
  const [savedViewerName, setSavedViewerName] = useState<string|null>(null);
  const [nameConfirmed, setNameConfirmed]     = useState(false);
  const [showChangeName, setShowChangeName]   = useState(false);
  const [showBrowseModal, setShowBrowseModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [isQueue, setIsQueue]           = useState(false);
  const [isExtend, setIsExtend]         = useState(false);
  const [imageUrl, setImageUrl]         = useState('');
  const [imageValid, setImageValid]     = useState(false);
  const [message, setMessage]           = useState('');
  // durationSeconds is the canonical unit; duration_minutes = durationSeconds / 60
  const [durationSeconds, setDurationSeconds] = useState(60);
  const [submitting, setSubmitting]     = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string|null>(null);
  const onTurnstileVerify = useCallback((t: string) => setTurnstileToken(t), []);
  const onTurnstileExpire = useCallback(() => setTurnstileToken(null), []);
  const [cancelling, setCancelling]     = useState<string|null>(null);
  const [notification, setNotification] = useState<{text:string;type:string}|null>(null);
  // Pulled from the shared wallet-balance store (same source the top-right
  // WalletNav reads from, so the booking-form "Your balance" line and the
  // nav are guaranteed in lockstep). One WS sub + 10s poll for the whole app.
  const { usdc: usdcBalance } = useWalletBalances();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txStatus, setTxStatus]         = useState<TxStatus>('idle');
  const [txError, setTxError]           = useState<string|null>(null);
  const [confirmedTxId, setConfirmedTxId] = useState<string|null>(null);

  // ── Beam media (upload or URL) ────────────────────────────────────────────
  const [uploadMode, setUploadMode]         = useState<'url'|'upload'>('url');
  const [uploadedUrl, setUploadedUrl]       = useState<string|null>(null);
  const [uploadedPath, setUploadedPath]     = useState<string|null>(null);
  const [uploadedFileType, setUploadedFileType] = useState<'image'|'video'|null>(null);
  const [uploading, setUploading]           = useState(false);
  // ─────────────────────────────────────────────────────────────────────────

  // ── Per-booking customization (banner font/speed + media offset/zoom) ─────
  // Defaults match BANNER_*_RANGE.default / MEDIA_*_RANGE.default in
  // src/lib/banner.ts. Sent in the create-* POST body; null-equivalent
  // values are omitted server-side (the render path falls back to the
  // same defaults when the column is null).
  const [customizeOpen,   setCustomizeOpen]   = useState(false);
  const [bannerFontPx,    setBannerFontPx]    = useState(28);
  const [bannerSpeedSecs, setBannerSpeedSecs] = useState(20);
  const [mediaOffsetX,    setMediaOffsetX]    = useState(50);
  const [mediaOffsetY,    setMediaOffsetY]    = useState(50);
  const [mediaZoom,       setMediaZoom]       = useState(1);
  const onMediaOffsetChange = useCallback((x: number, y: number) => {
    setMediaOffsetX(x); setMediaOffsetY(y);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  // ── Wallet state ──────────────────────────────────────────────────────────
  const { wallet, connected, connecting, connect, publicKey, signTransaction, signAllTransactions, sendTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  // Phantom Connect (deeplink) session — when present, the user is
  // effectively connected even without a wallet-adapter publicKey. Used
  // to gate the booking-form's Pay button on mobile.
  const phantomConnectSession = useStoredPhantomConnectSession();
  const hasPhantomConnectSession = !!phantomConnectSession;

  // Only connect when the user explicitly clicked a Connect button.
  // Without this guard the effect fires on page load because Wallet Standard
  // registers Phantom into `wallet` automatically, causing an instant popup.
  const userInitiatedConnect = useRef(false);
  useEffect(() => {
    if (wallet && !connected && !connecting && userInitiatedConnect.current) {
      userInitiatedConnect.current = false;
      connect().catch(() => {});
    }
  }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  const openWalletModal = () => {
    userInitiatedConnect.current = true;
    if (wallet) {
      connect().catch(() => {});
    } else {
      setWalletModalVisible(true);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const supabase = useRef(createClient()).current;
  const viewerNameRef = useRef('');
  // Mirrors the connected wallet pubkey into a ref so loadData can pick up
  // cross-device denied rows (viewer_name lives in localStorage, wallet does
  // not). Updated by an effect below; reading via ref avoids reconstructing
  // the loadData callback on every wallet change.
  const viewerWalletRef = useRef<string | null>(null);
  const lastRealtimeEventAt = useRef(Date.now());

  // Theme color tokens — CSS vars, set by SkinProvider
  const tc    = 'var(--casi-accent)';
  const tcRgb = 'var(--casi-accent-rgb)';

  useEffect(() => {
    if (!isOBS && !username) window.location.href = '/search';
  }, [username, isOBS]);

  // Phantom Connect return handler. When the page loads with our
  // phantom_action query param set, Phantom has bounced the user back from
  // a connect or sign deeplink — parse the encrypted response, finalize
  // the booking, and clean up the URL. We use a query param (NOT a hash
  // fragment) because Phantom appends its response params as a query
  // string, which would mangle a URL that already has a hash.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('phantom_action');
    if (action !== 'connect-resume' && action !== 'sign-resume') return;

    // Strip ONLY the phantom-* params from the URL — leave everything else
    // (especially `s=<streamer>`) intact. Otherwise the page-level guard
    // `if (!isOBS && !username) → /search` fires on the next render and
    // the user lands on the search page right after a successful connect.
    const cleanUrl = (): void => {
      const next = new URLSearchParams(window.location.search);
      next.delete('phantom_action');
      next.delete('phantom_encryption_public_key');
      next.delete('data');
      next.delete('nonce');
      next.delete('errorCode');
      next.delete('errorMessage');
      const qs = next.toString();
      const url = window.location.origin + window.location.pathname + (qs ? '?' + qs : '');
      history.replaceState(null, '', url);
    };

    (async () => {
      const pc = await import('@/lib/phantom-connect');
      try {
        if (action === 'connect-resume') {
          const session = pc.parseConnectResponse(params);
          pc.saveSession(session);
          cleanUrl();
          // If a tx was stashed (we redirected to connect mid-booking),
          // chain straight into sign with the freshly minted session.
          const pending = pc.readPendingBooking();
          if (pending?.pending_tx) {
            const sep = window.location.search ? '&' : '?';
            const here = window.location.origin + window.location.pathname + window.location.search + `${sep}phantom_action=sign-resume`;
            window.location.href = pc.buildSignTransactionUrl({
              session,
              transactionB58: pending.pending_tx,
              redirectTo: here,
            });
          }
          return;
        }

        // Sign return: parse signature, attach to booking.
        const session = pc.getStoredSession();
        if (!session) {
          showNotif('Phantom session expired — please retry the booking', 'denied');
          cleanUrl();
          return;
        }
        // Phantom returns the SIGNED tx; we submit it ourselves via our
        // own RPC. Avoids Phantom's signAndSendTransaction returning
        // -32601 "method not supported" on certain Phantom Mobile builds.
        const { signedTransactionB58 } = pc.parseSignTransactionResponse(params, session);
        const pending = pc.readPendingBooking();
        cleanUrl();
        if (!pending) {
          showNotif('Lost track of which booking — please retry', 'denied');
          return;
        }
        const { Connection } = await import('@solana/web3.js');
        const { SOLANA_RPC } = await import('@/lib/solana-network');
        const bs58Mod = await import('bs58');
        const bs58Local = bs58Mod.default;
        const conn = new Connection(SOLANA_RPC, 'confirmed');
        const rawTx = bs58Local.decode(signedTransactionB58);
        const signature = await conn.sendRawTransaction(rawTx, { skipPreflight: false });

        // Dispatch on the stash's `kind`. Default 'book' for stashes from
        // older code paths that didn't set it explicitly.
        const kind = pending.kind ?? 'book';
        if (kind === 'book') {
          const res = await fetch('/api/bookings/attach-solana-tx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              booking_id:    pending.booking_id,
              cancel_token:  pending.cancel_token,
              tx_signature:  signature,
              escrow_pda:    pending.escrow_pda,
              viewer_wallet: pending.viewer_wallet,
            }),
          });
          if (res.ok) {
            showNotif('◎ Payment locked — awaiting streamer approval!', 'success');
            pc.clearPendingBooking();
            if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
          } else {
            showNotif('Booking attach failed — your funds may be locked. Reload to recover.', 'error');
          }
        } else if (kind === 'flash') {
          // Flash booking_id is the flash row id. Different attach endpoint
          // — flashes don't carry a cancel_token in the same way.
          const res = await fetch('/api/flashes/attach-escrow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              flash_id:      pending.booking_id,
              tx_signature:  signature,
              escrow_pda:    pending.escrow_pda,
              viewer_wallet: pending.viewer_wallet,
            }),
          });
          if (res.ok) {
            showNotif('⚡ Flash locked — awaiting streamer approval!', 'success');
            pc.clearPendingBooking();
            refreshWalletNav();
            if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
          } else {
            showNotif('Flash attach failed — your funds may be locked. Reload to recover.', 'error');
          }
        } else {
          // settle / cancel: tx already submitted on-chain — webhook will
          // catch up the booking row, we just refresh the viewer's data and
          // surface the right toast. No attach-solana-tx call needed since
          // the booking row already exists with its escrow_pda.
          pc.clearPendingBooking();
          refreshWalletNav();
          showNotif(
            kind === 'settle'
              ? '◎ Beam ended — refund returned to your wallet'
              : '◎ USDC returned to your wallet',
            'warning',
          );
          if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
        }
      } catch (err) {
        const { reportClientError } = await import('@/lib/report-client-error');
        reportClientError('overlay/phantom-connect-return', err, { action });
        showNotif(err instanceof Error ? err.message : 'Phantom return failed', 'denied');
        cleanUrl();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEWER_NAME_KEY);
      if (saved) { setSavedViewerName(saved); viewerNameRef.current = saved; setNameConfirmed(true); }
    } catch {}
  }, []);

  const confirmName = (name: string) => {
    try { localStorage.setItem(VIEWER_NAME_KEY, name); } catch {}
    setSavedViewerName(name); viewerNameRef.current = name; setNameConfirmed(true);
  };

  const showNotif = (text: string, type: string) => {
    setNotification({text, type});
    setTimeout(() => setNotification(null), 5000);
  };

  const loadData = useCallback(async (profId: string, nameOverride?: string) => {
    const name = nameOverride ?? viewerNameRef.current;
    const wallet = viewerWalletRef.current;
    const [{ data: els }, { data: active }, { data: aq }, { data: queued }] = await Promise.all([
      supabase.from('overlay_elements').select('*').eq('profile_id', profId),
      supabase.from('bookings').select(BOOKING_COLS).eq('profile_id', profId).eq('status','active').limit(BOOKING_PAGE_LIMIT),
      supabase.from('bookings').select(BOOKING_COLS).eq('profile_id', profId).eq('status','approved_queued').order('approved_at',{ascending:true}).limit(BOOKING_PAGE_LIMIT),
      supabase.from('bookings').select('element_id').eq('profile_id', profId).eq('status','pending').limit(BOOKING_PAGE_LIMIT),
    ]);
    // Viewer overlay: show backdrops + any slot with a defined price (0 == free).
    setElements((els||[]).filter((el:any) => el.is_background || el.price_value >= 0));
    setActiveBookings(active||[]);
    setApprovedQueuedBookings(aq||[]);
    const counts: Record<string,number> = {};
    (queued||[]).forEach((b:any) => { if (b.element_id) counts[b.element_id]=(counts[b.element_id]||0)+1; });
    setQueueCounts(counts);
    if (name || wallet) {
      // Load the viewer's active + recent rows. Denied rows are included so
      // the visibility filter at visibleMyBookings can surface "recover USDC"
      // for Solana bookings whose escrow PDA still holds funds. Without this,
      // a viewer who can't recover within the 30s grace window below is stuck.
      //
      // Two parallel queries, merged on id:
      //   - by viewer_name: the full recent set (pending / active / queued /
      //     denied / expired) for this browser's saved handle. `expired` is
      //     included so a kick whose on-chain settle silently failed still
      //     surfaces the RECOVER USDC chip — the DB says "done", the PDA still
      //     holds funds, and only the viewer can close it out.
      //   - by viewer_wallet: denied or expired Solana rows with a live escrow
      //     PDA, so a viewer who abandoned recovery on one device and
      //     reconnects the same wallet elsewhere still sees the chip. Scoped
      //     to payment_method=solana + non-null escrow_pda so we don't drag in
      //     unrelated history.
      const [nameRes, walletRes] = await Promise.all([
        name
          ? supabase.from('bookings').select(BOOKING_COLS)
              .eq('profile_id', profId).eq('viewer_name', name)
              .in('status', ['pending', 'active', 'approved_queued', 'denied', 'expired'])
              .order('created_at', { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [] as any[] }),
        wallet
          ? supabase.from('bookings').select(BOOKING_COLS)
              .eq('profile_id', profId).eq('viewer_wallet', wallet)
              .eq('payment_method', 'solana')
              .in('status', ['denied', 'expired'])
              .not('escrow_pda', 'is', null)
              .limit(20)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const byId = new Map<any, any>();
      for (const b of (nameRes.data || [])) byId.set(b.id, b);
      for (const b of (walletRes.data || [])) if (!byId.has(b.id)) byId.set(b.id, b);
      const mine = Array.from(byId.values());
      // Keep a row around if it's still actionable. `denied` with live PDA =
      // recoverable via cancel_escrow; `expired` with live PDA = kick-leaked,
      // recoverable via settle_beam; recently-denied gives Stripe viewers a
      // moment to see the refund chip. Everything else drops out.
      //
      // Window is keyed on `created_at` (no `denied_at` column) — a booking
      // created within STRIPE_DENIED_WINDOW_MS may still be sitting in the
      // streamer's queue waiting on moderation. 10 min covers realistic
      // moderation latency; older rows are stale-history and silently drop.
      const relevant = mine.filter((b:any) => {
        if (b.status === 'expired') {
          return b.payment_method === 'solana' && b.escrow_pda;
        }
        if (b.status === 'denied') {
          return (b.payment_method === 'solana' && b.escrow_pda)
            || (b.payment_method === 'stripe'
                && Date.now() - new Date(b.created_at).getTime() < STRIPE_DENIED_WINDOW_MS);
        }
        return true;
      });
      setMyBookings(relevant);

      // Stuck Solana flashes: pending rows with an escrow_pda. Same dual
      // query as bookings (by viewer_name + viewer_wallet) so a viewer
      // who paid on one device + reconnected on another still sees the
      // recovery card. The streamer-side stuck-flash class is moderated
      // via admin/page.tsx::moderateSolanaFlash drift recovery; this
      // surface is for the viewer who'd rather get their USDC back than
      // wait for the streamer to act.
      const FLASH_COLS = 'id, viewer_name, message, amount_cents, status, escrow_pda, viewer_wallet, payment_method, created_at';
      const [nameFlashRes, walletFlashRes] = await Promise.all([
        name
          ? supabase.from('flashes').select(FLASH_COLS)
              .eq('profile_id', profId).eq('viewer_name', name)
              .eq('payment_method', 'solana').eq('status', 'pending')
              .not('escrow_pda', 'is', null)
              .limit(20)
          : Promise.resolve({ data: [] as any[] }),
        wallet
          ? supabase.from('flashes').select(FLASH_COLS)
              .eq('profile_id', profId).eq('viewer_wallet', wallet)
              .eq('payment_method', 'solana').eq('status', 'pending')
              .not('escrow_pda', 'is', null)
              .limit(20)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const stuckById = new Map<any, any>();
      for (const f of (nameFlashRes.data || [])) stuckById.set(f.id, f);
      for (const f of (walletFlashRes.data || [])) if (!stuckById.has(f.id)) stuckById.set(f.id, f);
      setMyStuckFlashes(Array.from(stuckById.values()));

      // Historical activity for today — every beam + flash this viewer has
      // sent to this streamer in the last 24h (since browser-local midnight),
      // dual-keyed (viewer_name OR viewer_wallet) the same way the active-row
      // query is so a viewer who reconnects from a different browser still
      // sees their full spend log for the current stream day. Capped at 50
      // rows per kind; sorted client-side after merge. Anything older than
      // today is hidden — same scoping as studio's FLASHES · TODAY tile so
      // both surfaces agree on what "this session" means.
      const histStart = new Date();
      histStart.setHours(0, 0, 0, 0);
      const histStartIso = histStart.toISOString();
      const HIST_BOOK_COLS = 'id, status, payment_method, price_value, price_unit, original_amount_cents, message, duration_minutes, tx_signature, started_at, ended_at, created_at';
      const HIST_FLASH_COLS = 'id, status, payment_method, amount_cents, message, tx_signature, created_at';
      const [histBookName, histBookWallet, histFlashName, histFlashWallet] = await Promise.all([
        name
          ? supabase.from('bookings').select(HIST_BOOK_COLS)
              .eq('profile_id', profId).eq('viewer_name', name)
              .gte('created_at', histStartIso)
              .order('created_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] as any[] }),
        wallet
          ? supabase.from('bookings').select(HIST_BOOK_COLS)
              .eq('profile_id', profId).eq('viewer_wallet', wallet)
              .gte('created_at', histStartIso)
              .order('created_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] as any[] }),
        name
          ? supabase.from('flashes').select(HIST_FLASH_COLS)
              .eq('profile_id', profId).eq('viewer_name', name)
              .gte('created_at', histStartIso)
              .order('created_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] as any[] }),
        wallet
          ? supabase.from('flashes').select(HIST_FLASH_COLS)
              .eq('profile_id', profId).eq('viewer_wallet', wallet)
              .gte('created_at', histStartIso)
              .order('created_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const histById = new Map<string, TxRow>();
      // price_value on bookings is the per-unit RATE (USDC/hr or USDC/min
      // depending on price_unit), NOT the total. The booked total is
      // rate × (duration_minutes / unitMinutes) where unitMinutes is 60
      // when price_unit='hr', else 1. Stripe rows additionally have
      // original_amount_cents (set when the PaymentIntent was created with
      // the chosen duration) which is already the total in cents — prefer
      // that when present. MyTransactionsSection prorates this raw total
      // on display using started_at + ended_at.
      const computeBeamCents = (b: any): number => {
        if (b.payment_method === 'stripe' && b.original_amount_cents != null) {
          return Number(b.original_amount_cents);
        }
        const rate = Number(b.price_value || 0);
        const dur = Number(b.duration_minutes || 0);
        const unitMin = b.price_unit === 'hr' ? 60 : 1;
        return Math.round(rate * (dur / unitMin) * 100);
      };
      const toBeamRow = (b: any): TxRow => ({
        kind: 'beam', id: String(b.id), status: b.status,
        payment_method: b.payment_method,
        amount_cents: computeBeamCents(b),
        message: b.message,
        duration_minutes: b.duration_minutes,
        tx_signature: b.tx_signature,
        started_at: b.started_at ?? null,
        ended_at: b.ended_at ?? null,
        created_at: b.created_at,
      });
      for (const b of (histBookName.data || [])) {
        histById.set(`beam-${b.id}`, toBeamRow(b));
      }
      for (const b of (histBookWallet.data || [])) {
        const k = `beam-${b.id}`;
        if (histById.has(k)) continue;
        histById.set(k, toBeamRow(b));
      }
      const toFlashRow = (f: any): TxRow => ({
        kind: 'flash', id: f.id, status: f.status,
        payment_method: f.payment_method,
        amount_cents: f.amount_cents,
        message: f.message,
        duration_minutes: null,
        tx_signature: f.tx_signature,
        started_at: null,
        ended_at: null,
        created_at: f.created_at,
      });
      for (const f of (histFlashName.data || [])) {
        histById.set(`flash-${f.id}`, toFlashRow(f));
      }
      for (const f of (histFlashWallet.data || [])) {
        const k = `flash-${f.id}`;
        if (histById.has(k)) continue;
        histById.set(k, toFlashRow(f));
      }
      const merged = Array.from(histById.values())
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 50);
      setMyHistory(merged);
    }
  }, [supabase]);

  // Keep viewerWalletRef in sync with the adapter, and re-pull bookings when
  // a wallet connects/disconnects. This is what lets a viewer open the page
  // on a brand-new browser/device, connect the same wallet, and see their
  // previously-denied Solana booking's RECOVER USDC chip — without this they
  // would be locked out until the 7-day cancel_stale_pending crank fires.
  useEffect(() => {
    const next = publicKey?.toBase58() ?? null;
    if (next === viewerWalletRef.current) return;
    viewerWalletRef.current = next;
    if (profile?.id) loadData(profile.id);
  }, [publicKey, profile?.id, loadData]);

  // Passive PDA backfill for pending Solana bookings whose original
  // initializeBeam flow timed out before the row could be attached. On
  // mobile (Phantom in-app browser) the wallet may submit via its own RPC
  // and the tx can land on-chain 30+s later than our 60s confirmation
  // window. The viewer ends up with a "Pending" chip that's actually
  // funded — but the streamer can't approve because escrow_pda is NULL.
  // Probe every render for any of OUR pending Solana rows (i.e. one we
  // hold a cancel_token for) and POST attach-solana-tx if the PDA exists.
  // Idempotent: once probed, skipped for the rest of the session via ref.
  const probedPendingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const tokens = readBookingTokens();
    const candidates = myBookings.filter((b: any) =>
      b.status === 'pending' &&
      b.payment_method === 'solana' &&
      !b.escrow_pda &&
      tokens[String(b.id)] &&
      !probedPendingRef.current.has(String(b.id))
    );
    if (candidates.length === 0) return;
    let cancelled = false;
    (async () => {
      const { Connection } = await import('@solana/web3.js');
      const { deriveEscrowPda } = await import('@/lib/casi-escrow');
      const conn = new Connection(SOLANA_RPC, 'confirmed');
      let backfilled = 0;
      for (const b of candidates) {
        if (cancelled) break;
        const id = String(b.id);
        probedPendingRef.current.add(id);
        try {
          const [pda] = deriveEscrowPda(b.id);
          const info = await conn.getAccountInfo(pda).catch(() => null);
          if (!info) continue;
          const res = await fetch('/api/bookings/attach-solana-tx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              booking_id:    b.id,
              cancel_token:  tokens[id],
              escrow_pda:    pda.toBase58(),
              viewer_wallet: viewerWalletRef.current,
            }),
          });
          if (res.ok) backfilled++;
        } catch {
          /* swallow — best-effort */
        }
      }
      if (!cancelled && backfilled > 0 && profile?.id) {
        showNotif(
          `✓ Found ${backfilled} stuck booking${backfilled === 1 ? '' : 's'} on-chain — streamer can approve now`,
          'success',
        );
        await loadData(profile.id, savedViewerName ?? undefined);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myBookings, profile?.id]);

  useEffect(() => {
    if (!username) return;
    let cleanup: (()=>void)|undefined;
    const init = async () => {
      const { data: prof } = await supabase.from('profiles').select('*').eq('username', username).single();
      setProfile(prof);
      if (prof) {
        const saved = (() => { try { return localStorage.getItem(VIEWER_NAME_KEY)||''; } catch { return ''; } })();
        viewerNameRef.current = saved;
        await loadData(prof.id, saved);
        setLoading(false);
        // Show success notification when returning from Stripe flash checkout
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          if (params.get('flash_success') === '1') {
            showNotif('⚡ Flash sent — awaiting streamer approval!', 'success');
            params.delete('flash_success');
            params.delete('flash_id');
            const qs = params.toString();
            window.history.replaceState({}, '', `${window.location.pathname}${qs ? '?' + qs : ''}`);
          }
        }
        const bump = () => { lastRealtimeEventAt.current = Date.now(); };
        // Debounce refetches: a single streamer action (approve, deny, etc.)
        // fires both an overlay_elements UPDATE and a bookings UPDATE, plus
        // reconnects replay bursts. Without coalescing that's one full
        // loadData per event — trailing-debounce collapses the burst into
        // one fetch ~200ms after quiet.
        let refetchTimer: ReturnType<typeof setTimeout> | undefined;
        const scheduleReload = () => {
          bump();
          if (refetchTimer) clearTimeout(refetchTimer);
          refetchTimer = setTimeout(() => {
            refetchTimer = undefined;
            loadData(prof.id);
          }, 200);
        };
        const channel = supabase.channel(`overlay_${prof.id}`)
          .on('postgres_changes', { event: '*',      schema: 'public', table: 'overlay_elements', filter: `profile_id=eq.${prof.id}` }, scheduleReload)
          .on('postgres_changes', { event: '*',      schema: 'public', table: 'bookings',         filter: `profile_id=eq.${prof.id}` }, scheduleReload)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles',         filter: `id=eq.${prof.id}` }, (payload) => {
            // Skin / theme changes from settings propagate here without a reload.
            setProfile((prev: any) => ({ ...prev, ...payload.new }));
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') bump();
          });

        // OBS heartbeat: if Realtime goes silent for 30 s, reload to reconnect
        let watchdog: ReturnType<typeof setInterval>|undefined;
        if (isOBS) {
          watchdog = setInterval(() => {
            if (Date.now() - lastRealtimeEventAt.current > 30_000) {
              window.location.reload();
            }
          }, 30_000);
        }

        cleanup = () => {
          supabase.removeChannel(channel);
          if (watchdog) clearInterval(watchdog);
          if (refetchTimer) clearTimeout(refetchTimer);
        };
      } else { setLoading(false); }
    };
    init();
    return () => { if (cleanup) cleanup(); };
  }, [username, supabase, loadData]);

  const prevMyBookingsRef = useRef<any[]>([]);
  // Booking IDs that flipped to denied within the last minute. Used to keep
  // Stripe-denied chips on screen briefly ("✕ Denied — refund on the way")
  // since the viewer's payment is voided automatically and there's no button
  // to click. Solana-denied rows stay visible via the escrow_pda signal.
  const [recentlyDenied, setRecentlyDenied] = useState<Set<string>>(new Set());

  // 1. Status Change Notifications
  useEffect(() => {
    const prev = prevMyBookingsRef.current;
    myBookings.forEach(booking => {
      const old = prev.find((b: any) => b.id === booking.id);
      if (!old) return;
      if (old.status === 'pending' && booking.status === 'denied') {
        // Solana deny on a Pending escrow leaves funds in the PDA — only the
        // viewer can close it via cancel_escrow. We used to auto-pop the
        // wallet here, but Phantom doesn't reliably foreground popups when
        // the overlay tab isn't focused (streamer just denied, so attention
        // is on the admin tab), and a popup the viewer doesn't see = a
        // cancel tx that never lands. Point them at the persistent RECOVER
        // USDC button on the chip instead — one deliberate click.
        if (booking.payment_method === 'solana' && booking.escrow_pda) {
          showNotif('Denied — click RECOVER USDC to reclaim your funds', 'denied');
        } else {
          showNotif('Your request was denied — refund on the way', 'denied');
        }
        const id = String(booking.id);
        setRecentlyDenied(prev => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        setTimeout(() => {
          setRecentlyDenied(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 60_000);
      }
      if (old.status === 'pending' && booking.status === 'active')          showNotif('Your beam is live! 🎉', 'success');
      if (old.status === 'pending' && booking.status === 'approved_queued') showNotif("Approved — you're in the queue!", 'queue');
      // Admin kicked an active beam. Two possibilities for Solana:
      //   - settle_beam landed on-chain → the webhook clears escrow_pda, the
      //     viewer's refund has already hit their wallet. No action needed.
      //   - settle_beam failed (cranker hiccup, no wallet fallback) → DB
      //     flipped to expired but the PDA still holds funds. Surface an
      //     actionable nudge so the viewer can close it out themselves.
      if (old.status === 'active' && booking.status === 'expired') {
        if (booking.payment_method === 'solana' && booking.escrow_pda) {
          showNotif('Beam ended early — click RECOVER USDC to reclaim your refund', 'warning');
        }
      }
    });
    prevMyBookingsRef.current = myBookings;
  }, [myBookings]);

  // 2. Stripe Payment Return Handler
  useEffect(() => {
    if (!profile) return;
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const bookingId = params.get('booking_id');

    if (payment === 'success' && bookingId) {
      showNotif('Payment successful — request sent! 🎉', 'success');
      // Clean up the URL so the viewer doesn't see Stripe parameters
      const clean = `${window.location.pathname}?s=${profile.username}`;
      window.history.replaceState({}, '', clean);
    }

    if (payment === 'cancelled' && bookingId) {
      // Mark as denied via /api/stripe/cancel (authorized with the per-booking
      // cancel_token stashed by /api/stripe/authorize). Previously this wrote
      // status='denied' directly under bookings_update_anon, which anyone
      // could call on any booking id to mass-deny.
      const cancelToken = readBookingTokens()[bookingId];
      fetch('/api/stripe/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, cancel_token: cancelToken }),
      }).then(() => {
        forgetBookingToken(bookingId);
        if (typeof loadData === 'function') {
          loadData(profile.id, savedViewerName ?? undefined);
        }
      });
      showNotif('Payment cancelled', 'warning');
      const clean = `${window.location.pathname}?s=${profile.username}`;
      window.history.replaceState({}, '', clean);
    }
  }, [profile]);

  const getActiveBookingForSlot = (id: string) => activeBookings.find((b:any) => b.element_id===id)||null;
  const getMyBookingForSlot     = (id: string) => myBookings.find((b:any) => b.element_id===id && b.status!=='denied')||null;

  const canExtend = (elementId: string) => {
    const queueBehind = approvedQueuedBookings.filter((b:any) => b.element_id===elementId);
    return queueBehind.length === 0 && (queueCounts[elementId]||0) === 0;
  };

  const cancelBooking = async (bookingId: string) => {
  setCancelling(bookingId);
  // Viewer is anonymous, so we prove ownership with the per-booking
  // cancel_token handed to us by /api/stripe/authorize or /bookings/create-free
  // and stashed in localStorage. See stripe/cancel/route.ts.
  const cancelToken = readBookingTokens()[bookingId];
  const res = await fetch('/api/stripe/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking_id: bookingId, cancel_token: cancelToken }),
  });
  setCancelling(null);
  if (res.ok) {
    forgetBookingToken(bookingId);
    showNotif('Booking cancelled', 'warning');
  } else {
    showNotif('Cancel failed — the streamer can still deny this request', 'error');
  }
  if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
};

  // Expires a booking from the viewer side (runs when countdown hits 0 or viewer
  // ends early). Delegated to /api/bookings/expire-and-advance so the write
  // runs under service_role and the server can independently verify the
  // timer actually ran out — previously the overlay wrote status directly
  // under bookings_update_anon, which was a mass-expire attack surface.
  const clientExpireBooking = useCallback(async (booking: any) => {
    const res = await fetch('/api/bookings/expire-and-advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: booking.id }),
    });
    if (!res.ok && res.status !== 409) {
      // 409 = not-overdue (another client raced us or clock skew); silently
      // let realtime/cron catch it. Other errors are logged for diagnosis.
      console.error('[overlay] expire-and-advance failed:', res.status);
    }
    if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
  }, [profile?.id, loadData, savedViewerName]);

  // Detect video vs image from a URL's path extension (no server round-trip).
  const getUrlFileType = (url: string): 'image'|'video' => {
    const path = url.toLowerCase().split('?')[0];
    return /\.(mp4|webm|mov|ogv)$/.test(path) ? 'video' : 'image';
  };

  // Upload a viewer's file to the beams Storage bucket before payment.
  // Per-file-type caps: images are usually fine at 5 MB (a compressed
  // 1080p JPEG is ~1 MB, a PNG ~3 MB), but videos need real headroom —
  // a 10-second 1080p mp4 easily runs 8-15 MB. Accepting up to 20 MB
  // lets streamers show clips that don't look like motion-blurred mush.
  const MAX_IMAGE_BYTES = 5  * 1024 * 1024;
  const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
  const handleFileSelect = async (file: File) => {
    const fileType: 'image'|'video' = file.type.startsWith('video/') ? 'video' : 'image';
    const cap = fileType === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > cap) {
      const mb = cap / (1024 * 1024);
      showNotif(`File too large — max ${mb} MB for ${fileType}s`, 'denied');
      return;
    }
    // P0 guard: free slots are image-only until video moderation ships.
    if (fileType === 'video' && selectedSlot && Number(selectedSlot.price_value) === 0) {
      showNotif('Videos are paid-slots only for now — please upload an image', 'denied');
      return;
    }
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const path = `${profile?.username ?? 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`;
    setUploading(true);
    const { error: upErr } = await supabase.storage.from('beams').upload(path, file, { contentType: file.type });
    if (upErr) { showNotif('Upload failed — try again', 'denied'); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('beams').getPublicUrl(path);
    setUploadedUrl(publicUrl);
    setUploadedPath(path);
    setUploadedFileType(fileType);
    setUploading(false);
  };

  const openSlot = (el: any, joinQueue: boolean, extend=false) => {
    setSelectedSlot(el); setIsQueue(joinQueue); setIsExtend(extend);
    setImageUrl(''); setImageValid(false); setMessage('');
    setUploadedUrl(null); setUploadedPath(null); setUploadedFileType(null); setUploading(false);
    // Reset customization back to per-shape defaults whenever the form
    // opens — last viewer's tweaks shouldn't bleed into the next slot.
    setCustomizeOpen(false);
    setBannerFontPx(28); setBannerSpeedSecs(20);
    setMediaOffsetX(50); setMediaOffsetY(50); setMediaZoom(1);
    const maxDur = el.max_duration_minutes;
    const defaultSec = maxDur ? Math.min(60, maxDur * 60) : 60;
    setDurationSeconds(defaultSec);
    if (extend) {
      const myBooking = getMyBookingForSlot(el.id);
      if (myBooking?.image_url) { setImageUrl(myBooking.image_url); setImageValid(true); }
    }
  };
  const closeSlot = () => {
    setSelectedSlot(null); setIsExtend(false);
    setUploadedUrl(null); setUploadedPath(null); setUploadedFileType(null); setUploading(false);
  };
  const setDurationSecsClamped = (secs: number) => {
    const maxSecs = selectedSlot?.max_duration_minutes ? selectedSlot.max_duration_minutes * 60 : Infinity;
    setDurationSeconds(Math.max(30, Math.min(secs, maxSecs)));
  };

  const submitBooking = async () => {
  const hasMedia = uploadMode === 'upload' ? !!uploadedUrl : !!imageUrl;
  // Banner slots swap the content requirement: the viewer's message is the
  // primary content (renders as a scrolling marquee on stream), media is
  // optional. Non-banner slots keep the original media-required contract.
  const isBanner = selectedSlot?.shape === 'banner';
  const hasBannerMessage = isBanner && message.trim().length > 0 && message.length <= BANNER_MAX_MESSAGE;
  const hasRequiredContent = isBanner ? hasBannerMessage : hasMedia;
  if (!savedViewerName || !hasRequiredContent || !selectedSlot) {
    if (isBanner && !hasBannerMessage) {
      showNotif(`Type a message (up to ${BANNER_MAX_MESSAGE} chars) — it'll scroll across the banner.`, 'denied');
    }
    return;
  }
  setSubmitting(true);

  const currentQueue = queueCounts[selectedSlot.id] || 0;
  const effectiveImageUrl   = uploadMode === 'upload' ? uploadedUrl  : imageUrl;
  const effectiveStoragePath = uploadMode === 'upload' ? uploadedPath : null;
  const effectiveFileType   = uploadMode === 'upload' ? uploadedFileType : (imageUrl ? getUrlFileType(imageUrl) : null);

  // Only ship customization fields the viewer actually changed — null
  // values let the render path fall back to defaults and keep DB rows
  // lean. Banner fields are scoped to banner slots; media fields apply
  // to everything else. The server clamps both ranges in case of drift.
  const customizationBody: Record<string, number | null> = isBanner
    ? {
        banner_font_px:    bannerFontPx    === 28 ? null : bannerFontPx,
        banner_speed_secs: bannerSpeedSecs === 20 ? null : bannerSpeedSecs,
      }
    : {
        media_offset_x: mediaOffsetX === 50 ? null : mediaOffsetX,
        media_offset_y: mediaOffsetY === 50 ? null : mediaOffsetY,
        media_zoom:     mediaZoom     === 1  ? null : mediaZoom,
      };

  const isFreeSlot = Number(selectedSlot.price_value) === 0;

  // ── FREE SLOT PATH ─────────────────────────────────────────────────────────
  // Free bookings go through a server-gated endpoint that enforces captcha +
  // text moderation. Direct anon inserts for price_value=0 slots are blocked
  // at the RLS layer (see 20260419000000_p0_hardening.sql).
  if (isFreeSlot) {
    // P0 guard: free slots are image-only until video moderation ships.
    if (effectiveFileType === 'video') {
      showNotif('Videos are paid-slots only for now — please use an image', 'denied');
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch('/api/bookings/create-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id:       profile.id,
          element_id:       selectedSlot.id,
          viewer_name:      savedViewerName,
          message:          isExtend ? `⏱ Extension request${message.trim() ? ' — ' + message.trim() : ''}` : (message.trim() || null),
          image_url:        effectiveImageUrl,
          storage_path:     effectiveStoragePath,
          file_type:        effectiveFileType,
          duration_minutes: durationSeconds / 60,
          is_queued:        isQueue || isExtend,
          queue_position:   (isQueue || isExtend) ? currentQueue + 1 : null,
          turnstile_token:  turnstileToken,
          ...customizationBody,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        showNotif(json.error || 'Failed to submit free booking', 'error');
        setSubmitting(false);
        return;
      }
      if (json.booking_id && json.cancel_token) {
        rememberBookingToken(json.booking_id, json.cancel_token);
      }
      showNotif('★ Free request sent — awaiting streamer approval', 'success');
      setSubmitting(false);
      closeSlot();
    } catch (err) {
      console.error('Free booking failed:', err);
      showNotif('Server error. Please try again.', 'error');
      setSubmitting(false);
    }
    return;
  }

  // ── PAID SLOT PATH ─────────────────────────────────────────────────────────
  // Server-gated: stale-cleanup + duplicate-check + insert all run as
  // service_role so anon no longer needs UPDATE or INSERT on bookings for
  // Stripe rows. authorize() still mints the cancel_token right before the
  // Checkout redirect.
  let newBookingId: string;
  try {
    const createRes = await fetch('/api/bookings/create-stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id:       profile.id,
        element_id:       selectedSlot.id,
        viewer_name:      savedViewerName,
        image_url:        effectiveImageUrl,
        storage_path:     effectiveStoragePath,
        file_type:        effectiveFileType,
        message: isExtend ? `⏱ Extension request${message.trim() ? ' — ' + message.trim() : ''}` : (message.trim() || null),
        duration_minutes: durationSeconds / 60,
        price_value:      selectedSlot.price_value,
        price_unit:       selectedSlot.price_unit,
        is_queued:        isQueue || isExtend,
        queue_position:   (isQueue || isExtend) ? currentQueue + 1 : null,
        is_extend:        isExtend,
        ...customizationBody,
      }),
    });
    const createJson = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !createJson.booking_id) {
      if (createJson.error === 'already_booked') {
        setSubmitting(false);
        showNotif('You already have a booking for this slot', 'warning');
        closeSlot();
        return;
      }
      console.error('create-stripe error:', createJson.error);
      showNotif(createJson.error || 'Failed to create booking', 'error');
      setSubmitting(false);
      return;
    }
    newBookingId = createJson.booking_id as string;
    // cancel_token is now minted atomically at create time so it's available
    // before authorize ever runs — no race window where another caller could
    // call authorize first and steal the token.
    if (createJson.cancel_token) rememberBookingToken(newBookingId, createJson.cancel_token);
  } catch (err) {
    console.error('create-stripe fetch failed:', err);
    showNotif('Server error. Please try again.', 'error');
    setSubmitting(false);
    return;
  }

  try {
    const res = await fetch('/api/stripe/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: newBookingId }),
    });
    const json = await res.json();
    if (json.checkout_url) {
      // authorize may still return cancel_token for old bookings that were
      // created before this change; store it as a fallback if not already set.
      if (json.cancel_token) rememberBookingToken(newBookingId, json.cancel_token);
      window.location.href = json.checkout_url;
    } else {
      console.error('Stripe error:', json.error);
      showNotif(json.error || 'Payment failed to initialize', 'error');
      setSubmitting(false);
    }
  } catch (err) {
    console.error('Authorize fetch failed:', err);
    showNotif('Server error. Please try again.', 'error');
    setSubmitting(false);
  }
};

  // ── Solana / CASI escrow booking ────────────────────────────────────────────
  const submitSolanaBooking = async () => {
    const effectiveSolImageUrl    = uploadMode === 'upload' ? uploadedUrl    : imageUrl;
    const effectiveSolStoragePath = uploadMode === 'upload' ? uploadedPath   : null;
    const effectiveSolFileType    = uploadMode === 'upload' ? uploadedFileType : (imageUrl ? getUrlFileType(imageUrl) : null);
    // Allow Phantom-Connect-only sessions through this gate. Mobile users
    // who connected via the deeplink path (PR #93+) won't have a wallet-
    // adapter publicKey or wallet.adapter, but they DO have a session
    // pubkey we can use as the viewer for tx-build and balance probes.
    const pcSession = await import('@/lib/phantom-connect').then(m => m.getStoredSession());
    const sessionPubkey = pcSession ? new PublicKey(pcSession.walletPublicKey) : null;
    const effectivePublicKey = publicKey ?? sessionPubkey;
    if (!savedViewerName || !effectiveSolImageUrl || !selectedSlot || !effectivePublicKey) return;
    // wallet.adapter is only needed for the desktop / in-app-browser path
    // (it powers Anchor's signing). The mobile-Phantom-Connect path
    // signs in Phantom natively so we don't need it there.
    if (Number(selectedSlot.price_value) === 0) {
      // Free slots go through submitBooking, not the Solana rail.
      showNotif('This slot is free — use “Send Free Request” instead', 'warning');
      return;
    }
    if (!profile?.solana_wallet) {
      showNotif('This streamer has not linked a Solana wallet yet', 'denied');
      return;
    }
    setSubmitting(true);
    setTxStatus('booking');
    setTxError(null);

    // Stale-pending cleanup + insert + cancel_token issuance happen
    // server-side. The route stale-cleans the same (profile_id, element_id,
    // viewer_name, payment_method='solana', no-escrow) set the overlay used
    // to deny directly under bookings_update_anon, then issues a per-booking
    // cancel_token used by the rest of this flow to authorize follow-up
    // writes via /api/bookings/viewer-deny + /api/bookings/attach-solana-tx.

    // Duplicate check (informational — server doesn't enforce this).
    if (!isExtend) {
      const { data: existing } = await supabase.from('bookings').select('id')
        .eq('profile_id', profile.id).eq('element_id', selectedSlot.id)
        .eq('viewer_name', savedViewerName).in('status', ['pending','active','approved_queued'])
        .not('escrow_pda', 'is', null)
        .single();
      if (existing) {
        setSubmitting(false);
        showNotif('You already have a booking for this slot', 'warning');
        closeSlot();
        return;
      }
    }

    const currentQueue = queueCounts[selectedSlot.id] || 0;
    const isBannerSol = selectedSlot.shape === 'banner';
    const customizationBodySol: Record<string, number | null> = isBannerSol
      ? {
          banner_font_px:    bannerFontPx    === 28 ? null : bannerFontPx,
          banner_speed_secs: bannerSpeedSecs === 20 ? null : bannerSpeedSecs,
        }
      : {
          media_offset_x: mediaOffsetX === 50 ? null : mediaOffsetX,
          media_offset_y: mediaOffsetY === 50 ? null : mediaOffsetY,
          media_zoom:     mediaZoom     === 1  ? null : mediaZoom,
        };
    const createRes = await fetch('/api/bookings/create-solana', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id:    profile.id,
        element_id:    selectedSlot.id,
        viewer_name:   savedViewerName,
        image_url:     effectiveSolImageUrl,
        storage_path:  effectiveSolStoragePath,
        file_type:     effectiveSolFileType,
        message: isExtend ? `⏱ Extension request${message.trim() ? ' — ' + message.trim() : ''}` : (message.trim() || null),
        duration_minutes: durationSeconds / 60,
        price_value:   selectedSlot.price_value,
        price_unit:    selectedSlot.price_unit,
        is_queued:     isQueue || isExtend,
        queue_position: (isQueue || isExtend) ? currentQueue + 1 : null,
        ...customizationBodySol,
      }),
    });
    const createBody = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !createBody?.booking_id) {
      const reason = typeof createBody?.error === 'string' ? createBody.error : 'Failed to create booking';
      showNotif(reason, 'error');
      setTxStatus('error'); setTxError(reason);
      setSubmitting(false);
      return;
    }
    const newBooking = { id: createBody.booking_id as string };
    rememberBookingToken(newBooking.id, createBody.cancel_token as string);

    setTxStatus('streaming');

    // Hoisted out of the try block so the catch's reportClientError can
    // include them — closure-scoped vars declared inside try aren't
    // visible in catch.
    let pathTaken: 'unknown' | 'phantom_native' | 'wallet_adapter' = 'unknown';
    let phantomProviderDetected = false;
    let inferredFromPoll = false;

    try {
      const { Connection, PublicKey } = await import('@solana/web3.js');

      const usdcDecimals    = 6;
      const durationMinutes = durationSeconds / 60;
      const totalUsdc       = selectedSlot.price_unit === 'min'
        ? selectedSlot.price_value * durationMinutes
        : selectedSlot.price_value * (durationMinutes / 60);

      // ── Pre-flight: verify viewer has SOL + a USDC ATA with enough balance ──
      const connection = new Connection(SOLANA_RPC);

      // SOL: initialize_escrow creates both the EscrowState PDA and a PDA-owned
      // vault ATA (~2× rent) plus a signature fee. Empirically ~0.003 SOL on
      // devnet — we require 0.01 for safety margin.
      const solLamports = await connection.getBalance(effectivePublicKey);
      const MIN_SOL     = 0.01 * 1e9;
      if (solLamports < MIN_SOL) {
        showNotif(
          IS_MAINNET
            ? `Need SOL for rent + fees. You have ${(solLamports / 1e9).toFixed(4)} SOL — top up your wallet and try again.`
            : `Need devnet SOL for rent + fees. You have ${(solLamports / 1e9).toFixed(4)} SOL. Airdrop at faucet.quicknode.com/solana/devnet`,
          'denied',
        );
        await fetch('/api/bookings/viewer-deny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: newBooking.id, cancel_token: readBookingTokens()[newBooking.id] }) });
        setSubmitting(false);
        return;
      }

      // USDC ATA balance check.
      const { value: tokenAccounts } = await connection.getParsedTokenAccountsByOwner(
        effectivePublicKey,
        { mint: new PublicKey(USDC_MINT) },
      );
      if (tokenAccounts.length === 0) {
        showNotif(
          IS_MAINNET
            ? 'No USDC found in your wallet. Buy or bridge USDC and try again.'
            : 'No devnet USDC found (mint 4zMMC9…DU). Switch Phantom to Devnet then mint at spl-token-faucet.vercel.app',
          'denied',
        );
        await fetch('/api/bookings/viewer-deny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: newBooking.id, cancel_token: readBookingTokens()[newBooking.id] }) });
        setSubmitting(false);
        return;
      }
      const usdcBalance: number =
        tokenAccounts[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0;
      if (usdcBalance < totalUsdc) {
        showNotif(
          `Insufficient USDC: you have ${usdcBalance.toFixed(2)}, need ${totalUsdc.toFixed(2)}`,
          'denied',
        );
        await fetch('/api/bookings/viewer-deny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: newBooking.id, cancel_token: readBookingTokens()[newBooking.id] }) });
        setSubmitting(false);
        return;
      }
      console.log('[solana] pre-flight passed — SOL:', (solLamports / 1e9).toFixed(4), 'USDC:', usdcBalance);
      // ──────────────────────────────────────────────────────────────────────

      // Lock full amount in the CASI escrow PDA. Settlement pays the
      // streamer 100% of the vested portion with no platform fee deducted.
      const { CasiEscrowClient } = await import('@/lib/casi-escrow');
      // Phantom-Connect-only sessions don't have a wallet-adapter
      // signTransaction. That's fine for THIS code path because we only
      // call buildInitializeBeamTx() which builds an unsigned tx — no
      // signing. The actual signing happens in Phantom natively via the
      // deeplink. Stub the sign methods to throw if anything tries to
      // call them anyway (caught by the catch block below).
      const signStub = async () => { throw new Error('Wallet sign not available — use Phantom Connect deeplink path'); };
      const anchorWallet = {
        publicKey: effectivePublicKey,
        signTransaction: signTransaction ?? signStub,
        signAllTransactions: signAllTransactions
          || (async <T,>(txs: T[]) => {
            const out: T[] = [];
            for (const tx of txs) out.push((signTransaction ? await signTransaction(tx as never) : await signStub()) as T);
            return out;
          }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      const client = new CasiEscrowClient(connection, anchorWallet, WALLET_ADAPTER_CLUSTER);

      const amountUsdcMicro = Math.round(totalUsdc * 10 ** usdcDecimals);
      const durationSecsInt = Math.round(durationSeconds);

      // Bound the on-chain call. Anchor's .rpc() polls for confirmation on
      // OUR RPC (Helius), but Phantom mobile submits via its own RPC — the
      // two RPCs can desync and the poll hangs indefinitely while the tx is
      // already landed. After 30s we throw and let the catch's PDA-probe
      // recovery path resolve the booking from on-chain state. Desktop and
      // happy-path mobile finish in <10s so the timeout never triggers.
      // Pass the wallet-adapter's sendTransaction so initializeBeam routes
      // through it instead of Anchor's .rpc(). On Phantom mobile the wallet
      // adapter calls signAndSendTransaction internally — the wallet signs
      // AND submits via Phantom's own RPC, returning the sig directly. This
      // sidesteps the Helius/Phantom-RPC desync that causes confirmation
      // timeouts on the in-app browser. Desktop wallets behave equivalently.
      // Build a sendOverride that prefers Phantom's native provider API
      // when available. PhantomWalletAdapter (npm) does NOT override the
      // base sendTransaction — it just provides signTransaction, so
      // wallet-adapter's sendTransaction still does sign + sendRaw via OUR
      // connection (Helius), which on mobile in-app browser desyncs with
      // Phantom's submit-RPC and the confirmation hangs.
      //
      // The actual fix: when window.phantom.solana is present (Phantom
      // in-app browser exposes this), call signAndSendTransaction
      // directly — Phantom signs AND submits via its OWN RPC and returns
      // the sig immediately. We skip the wallet-adapter layer entirely
      // for that single call. Falls through to wallet-adapter's send for
      // any other context.
      // ────────────────────────────────────────────────────────────────
      // Mobile-first booking flow: race wallet-send against PDA-poll.
      //
      // User reported the Phantom Android in-app browser shows the
      // approval sheet, the user taps Approve, the tx hits the chain —
      // but the wallet's response NEVER reaches the page. Diagnostics
      // confirmed both phantom_native (signAndSendTransaction) and
      // wallet_adapter (sendTransaction) hung indefinitely with the
      // wallet sitting in the approved state. The WebView bridge is
      // dropping the response.
      //
      // Fix: stop trusting the wallet's promise. Build the unsigned tx,
      // fire the wallet send (no await, just kick it), and start polling
      // the escrow PDA on our connection. Whichever resolves first wins:
      //   - wallet returns sig → use it
      //   - PDA appears on-chain → infer success, attach without sig
      //   - 90s elapses → genuine failure, deny
      //
      // attach-solana-tx accepts tx_signature as optional, so the
      // PDA-only path completes the booking just fine.
      // ────────────────────────────────────────────────────────────────
      const { tx, escrowPda: escrowPdaPubkey } = await client.buildInitializeBeamTx({
        escrowId:     newBooking.id,
        streamer:     new PublicKey(profile.solana_wallet),
        amountUsdc:   amountUsdcMicro,
        durationSecs: durationSecsInt,
      });
      const escrowPda = escrowPdaPubkey.toBase58();

      // ── Mobile (non-in-app) Phantom Connect deeplink path ──────────────
      // Mobile Chrome's Phantom-deeplink-via-wallet-adapter returns txs with
      // missing partial sigs; the in-app browser's WebView bridge silently
      // drops approval taps. Both have been observed live. The official
      // workaround is Phantom Connect — encrypt the tx, deeplink into
      // Phantom natively, sign+submit there, return via redirect URL with
      // sig. We persist the booking info in localStorage so the redirect
      // back can finalize attach-solana-tx without rebuilding state.
      const { needsMobileHandoff, isInWalletBrowser } = await import('@/lib/mobile-wallet');
      if (needsMobileHandoff() && !isInWalletBrowser()) {
        const pc = await import('@/lib/phantom-connect');
        const bs58Mod = await import('bs58');
        const bs58 = bs58Mod.default;
        // Serialize the unsigned tx for Phantom (Phantom signs + submits).
        // requireAllSignatures: false because the viewer will sign inside
        // Phantom; verifySignatures: false because the tx isn't signed yet.
        const txB58 = bs58.encode(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
        const cancelToken = readBookingTokens()[newBooking.id] ?? '';
        const session = pc.getStoredSession();
        // Build the return URL with a query-param marker (NOT a hash) so
        // Phantom can safely append its encrypted response params on top.
        const baseHere = window.location.origin + window.location.pathname + window.location.search;
        const sep = window.location.search ? '&' : '?';

        if (!session) {
          // First time on this device — connect handshake. Stash the tx so
          // the connect-return handler can chain straight into sign.
          pc.stashPendingBooking({
            booking_id:    String(newBooking.id),
            cancel_token:  cancelToken,
            escrow_pda:    escrowPda,
            viewer_wallet: effectivePublicKey.toBase58(),
            pending_tx:    txB58,
          });
          window.location.href = pc.buildConnectUrl({
            cluster: WALLET_ADAPTER_CLUSTER,
            redirectTo: `${baseHere}${sep}phantom_action=connect-resume`,
          });
          return;
        }

        // Have session — sign deeplink directly.
        pc.stashPendingBooking({
          booking_id:    String(newBooking.id),
          cancel_token:  cancelToken,
          escrow_pda:    escrowPda,
          viewer_wallet: effectivePublicKey.toBase58(),
        });
        window.location.href = pc.buildSignTransactionUrl({
          session,
          transactionB58: txB58,
          redirectTo: `${baseHere}${sep}phantom_action=sign-resume`,
        });
        return;
      }

      // Best-effort wallet wake-up for Phantom Android (no-op elsewhere).
      const phantomProvider = typeof window !== 'undefined'
        ? (window as unknown as {
            phantom?: {
              solana?: {
                isConnected?: boolean;
                connect?: (opts?: { onlyIfTrusted?: boolean }) => Promise<unknown>;
                signAndSendTransaction?: (t: unknown) => Promise<{ signature: string }>;
              };
            };
          }).phantom?.solana
        : null;
      phantomProviderDetected = !!phantomProvider;
      if (phantomProvider?.connect && !phantomProvider.isConnected) {
        try {
          await Promise.race([
            phantomProvider.connect({ onlyIfTrusted: true }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('phantom_connect_timeout')), 5_000)),
          ]);
        } catch { /* non-fatal */ }
      }

      // Fire-and-forget the wallet send. The promise either resolves
      // with a sig or hangs forever — we don't care because the PDA
      // poll below is the source of truth.
      type SendOutcome = { kind: 'wallet'; sig: string } | { kind: 'inferred'; sig: string };
      const walletSendPromise: Promise<SendOutcome> = (async () => {
        if (phantomProvider?.signAndSendTransaction) {
          pathTaken = 'phantom_native';
          const r = await phantomProvider.signAndSendTransaction(tx);
          return { kind: 'wallet', sig: r.signature };
        }
        if (sendTransaction) {
          pathTaken = 'wallet_adapter';
          const sig = await sendTransaction(tx, connection);
          return { kind: 'wallet', sig };
        }
        throw new Error('No wallet send method available');
      })();
      const POLL_INTERVAL_MS = 2_000;
      // 25s here + 30s catch-block probe = 55s total window for a tx to
      // surface before we surface an error. The catch probe is the real
      // safety net; the in-race poll only covers the wallet-submitted-but-
      // didn't-return-a-sig window. Kept shorter so wallet errors don't
      // leave the modal frozen for 90s.
      const POLL_TIMEOUT_MS  = 25_000;
      const pollPromise: Promise<SendOutcome> = (async () => {
        const start = Date.now();
        while (Date.now() - start < POLL_TIMEOUT_MS) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
          const info = await connection.getAccountInfo(escrowPdaPubkey).catch(() => null);
          if (info) {
            inferredFromPoll = true;
            return { kind: 'inferred', sig: '' };
          }
        }
        throw new Error('rpc_confirmation_timeout');
      })();

      // Wrap walletSendPromise so non-user-rejection wallet errors (e.g. Phantom
      // "Unexpected error") don't kill the race — the PDA poll is the source of
      // truth and may still confirm even when the wallet throws.
      const walletSendSafe: Promise<SendOutcome> = walletSendPromise.then(
        v => v,
        async (e) => {
          const { isUserRejection } = await import('@/lib/casi-errors');
          if (isUserRejection(e)) throw e; // user rejected — propagate to deny the booking
          console.warn('[bookSlot] wallet rejected (non-user), poll continues:', e);
          return new Promise<SendOutcome>(() => {}); // never resolves — let poll win
        },
      );

      const result = await Promise.race([walletSendSafe, pollPromise]);
      const sig = result.sig;

      // Persist on-chain state so the admin settle/cancel flows can rebuild
      // the CPI accounts without re-fetching from chain. cancel_token-authed
      // server route — anon UPDATE on tx_signature/escrow_pda/viewer_wallet
      // is being phased out (see migration 20260421...).
      const attachRes = await fetch('/api/bookings/attach-solana-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id:    newBooking.id,
          cancel_token:  readBookingTokens()[newBooking.id],
          tx_signature:  sig,
          escrow_pda:    escrowPda,
          viewer_wallet: effectivePublicKey.toBase58(),
        }),
      });
      if (!attachRes.ok) {
        // Funds are already locked on-chain. Don't fall through to the catch
        // (which would deny) — leave the row where it is and surface the PDA
        // so recovery is possible even if the viewer closes this tab.
        console.error('[solana beam] attach failed after on-chain success:', attachRes.status, 'sig=', sig, 'pda=', escrowPda);
        setTxStatus('error');
        setTxError(`Payment confirmed on-chain (tx ${sig}) but booking update failed. Contact the streamer with escrow ${escrowPda}.`);
        showNotif('Payment confirmed but booking update failed — see console for recovery info', 'error');
        setSubmitting(false);
        return;
      }

      setConfirmedTxId(sig);
      refreshWalletNav();
      setTxStatus('waiting');
      showNotif('◎ Payment locked — awaiting streamer approval!', 'success');
      setShowConfirmModal(false);
      closeSlot();
      if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
    } catch (err: unknown) {
      const { formatEscrowError, isUserRejection, isWalletSignatureMissing } = await import('@/lib/casi-errors');
      const { reportClientError } = await import('@/lib/report-client-error');
      console.error('[solana beam] initializeBeam failed:', err);

      // Discord report deferred to the "nothing on-chain" branch below —
      // confirmation timeouts on mobile (Phantom RPC ≠ Helius poll RPC)
      // recover via PDA probe and shouldn't ping. Only actual failures
      // (wallet missing sig, balance race, etc.) make it past the probe.

      // User rejected in wallet — nothing on-chain, safe to deny.
      if (isUserRejection(err)) {
        await fetch('/api/bookings/viewer-deny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: newBooking.id, cancel_token: readBookingTokens()[newBooking.id] }) });
        setTxStatus('error'); setTxError('Transaction rejected in wallet');
        showNotif('Transaction rejected in wallet', 'denied');
        setSubmitting(false);
        return;
      }

      // Any other error can still land the tx on-chain — confirmation
      // timeouts, Anchor's rebroadcast quirk ("already been processed"), RPC
      // flakes. Probe the PDA before denying: if funds are locked, backfill
      // the booking so the streamer can approve or the viewer can recover.
      //
      // Retry the probe with backoff because the RPC replica we hit may not
      // have propagated the freshly-landed account yet. Without this, a tx
      // that actually succeeded gets treated as "nothing on-chain", the
      // booking denied, and the viewer's USDC stuck in a vault with no DB
      // pointer back to it (no recover-USDC button surfaces).
      try {
        const { Connection } = await import('@solana/web3.js');
        const { deriveEscrowPda } = await import('@/lib/casi-escrow');
        const [escrowPda] = deriveEscrowPda(newBooking.id);
        const conn = new Connection(SOLANA_RPC, 'confirmed');
        // Long-tail polling: Phantom mobile submits via its own RPC and the
        // tx can take 30+ seconds to propagate to Helius on devnet. The old
        // [0, 800, 1600, 2400]ms backoff (~5s total) gave up too early and
        // we'd deny a booking that was about to land. Poll every 1.5s for
        // up to 30s — combined with the 30s race timeout above this gives
        // viewers a 60s window for the tx to surface before we deny.
        const PROBE_INTERVAL_MS = 1500;
        const PROBE_MAX_ATTEMPTS = 20;
        let info = null;
        for (let i = 0; i < PROBE_MAX_ATTEMPTS; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, PROBE_INTERVAL_MS));
          info = await conn.getAccountInfo(escrowPda).catch(() => null);
          if (info) break;
        }
        if (info) {
          const recoverRes = await fetch('/api/bookings/attach-solana-tx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              booking_id:    newBooking.id,
              cancel_token:  readBookingTokens()[newBooking.id],
              escrow_pda:    escrowPda.toBase58(),
              viewer_wallet: effectivePublicKey.toBase58(),
            }),
          });
          if (recoverRes.ok) {
            refreshWalletNav();
            setTxStatus('waiting');
            showNotif('◎ Payment locked — awaiting streamer approval!', 'success');
            setShowConfirmModal(false);
            closeSlot();
            if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
            setSubmitting(false);
            return;
          }
          console.error('[solana beam] recovery attach failed:', recoverRes.status, 'pda=', escrowPda.toBase58());
          setTxStatus('error');
          setTxError(`Payment confirmed on-chain but booking update failed. Contact the streamer with escrow ${escrowPda.toBase58()}.`);
          showNotif('Payment confirmed but booking update failed — see console for recovery info', 'error');
          setSubmitting(false);
          return;
        }
      } catch (probeErr) {
        console.error('[solana beam] PDA probe failed:', probeErr);
      }

      // Nothing confirmed on-chain after the probe window. Do NOT call
      // viewer-deny here — if the tx is still in-flight and lands later,
      // the PDA backfill effect will attach it and the streamer can approve
      // normally. Denying now would close the booking and leave USDC locked
      // in the vault with no Recover USDC button. Leave the row as `pending`
      // and let cancel_stale_pending crank clean it up after 7 days if the
      // tx never lands.
      const userMsg = isWalletSignatureMissing(err)
        ? formatEscrowError(err)
        : 'Transaction timed out — if any USDC left your wallet, reload this page to check. Your booking will auto-refund in 7 days if the streamer doesn\'t approve it.';
      reportClientError('overlay/booking/solana/initializeBeam', err, {
        booking_id:    String(newBooking.id),
        profile_id:    profile?.id,
        duration_secs: Math.round(durationSeconds),
        viewer_wallet: effectivePublicKey?.toBase58() ?? null,
        mobile:        typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent),
        signature_missing: isWalletSignatureMissing(err),
        rpc_timeout: err instanceof Error && err.message === 'rpc_confirmation_timeout',
        path_taken: pathTaken,
        phantom_provider_detected: phantomProviderDetected,
        inferred_from_poll: inferredFromPoll,
        wallet_adapter_name: wallet?.adapter?.name ?? null,
      });
      setTxStatus('error'); setTxError(userMsg);
      showNotif(userMsg, 'error');
    }

    setSubmitting(false);
  };

  /**
   * Build the CasiEscrowClient. Used by viewer-side settle_beam / cancel_escrow.
   * On desktop and inside a wallet's in-app browser the wallet adapter has a
   * real signTransaction so the returned client can call .rpc() directly. On
   * mobile-Phantom-Connect we have a session pubkey but no adapter signer —
   * the helper returns a build-only client (signTransaction stub) and the
   * caller routes signing through the Phantom Connect deeplink helper below.
   */
  const buildViewerCasiClient = async () => {
    const pcSession = await import('@/lib/phantom-connect').then(m => m.getStoredSession());
    const sessionPk = pcSession ? new PublicKey(pcSession.walletPublicKey) : null;
    const pk = publicKey ?? sessionPk;
    if (!pk) return null;
    const { Connection } = await import('@solana/web3.js');
    const { CasiEscrowClient } = await import('@/lib/casi-escrow');
    const stub = async () => { throw new Error('Sign via Phantom Connect deeplink, not adapter'); };
    const anchorWallet = {
      publicKey: pk,
      signTransaction: signTransaction ?? stub,
      signAllTransactions:
        signAllTransactions ||
        (async <T,>(txs: T[]) => {
          const out: T[] = [];
          for (const tx of txs) out.push((signTransaction ? await signTransaction(tx as never) : await stub()) as T);
          return out;
        }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    return new CasiEscrowClient(new Connection(SOLANA_RPC), anchorWallet, WALLET_ADAPTER_CLUSTER);
  };

  /**
   * Returns true when the viewer is on a mobile browser that's NOT inside a
   * wallet's in-app browser AND has a Phantom Connect session. In that case
   * any Solana tx must be signed via the Phantom Connect deeplink — the
   * wallet adapter has no working signTransaction in this environment.
   */
  const isPhantomConnectMobile = async (): Promise<boolean> => {
    const { needsMobileHandoff, isInWalletBrowser } = await import('@/lib/mobile-wallet');
    if (!needsMobileHandoff() || isInWalletBrowser()) return false;
    const pc = await import('@/lib/phantom-connect');
    return !!pc.getStoredSession();
  };

  /**
   * Hand off a built-but-unsigned Transaction to Phantom Connect for signing.
   * Stashes booking context so the mount-time return handler can finalize on
   * return (the `kind` field tells it whether to attach-solana-tx or just
   * refresh data after the on-chain submit). Page navigates away.
   */
  const phantomConnectSignAndSubmit = async (
    tx: import('@solana/web3.js').Transaction,
    kind: 'settle' | 'cancel',
    booking: { id: string | number; escrow_pda: string; viewer_wallet: string },
  ): Promise<void> => {
    const pc = await import('@/lib/phantom-connect');
    const bs58Mod = await import('bs58');
    const bs58 = bs58Mod.default;
    const session = pc.getStoredSession();
    if (!session) throw new Error('No Phantom Connect session');
    const txB58 = bs58.encode(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
    const cancelToken = readBookingTokens()[booking.id] ?? '';
    pc.stashPendingBooking({
      kind,
      booking_id:    String(booking.id),
      cancel_token:  cancelToken,
      escrow_pda:    booking.escrow_pda,
      viewer_wallet: booking.viewer_wallet,
    });
    const baseHere = window.location.origin + window.location.pathname + window.location.search;
    const sep = window.location.search ? '&' : '?';
    window.location.href = pc.buildSignTransactionUrl({
      session,
      transactionB58: txB58,
      redirectTo: `${baseHere}${sep}phantom_action=sign-resume`,
    });
  };

  /**
   * Settle a live Solana beam via `settle_beam`. On-chain integer proration
   * pays the streamer the vested portion and refunds the viewer the rest.
   * Called when the viewer clicks "end early" on an active beam.
   */
  const settleSolanaBeam = async (booking: any) => {
    if (!booking.escrow_pda || !booking.viewer_wallet || !profile?.solana_wallet) return;
    try {
      const client = await buildViewerCasiClient();
      if (!client) throw new Error('Wallet not ready to sign');
      const { PublicKey: PK } = await import('@solana/web3.js');
      // Mobile Phantom Connect: build the tx, redirect to Phantom for signing.
      // Page navigates away; the mount-time return handler refreshes data
      // once the signed tx submits successfully.
      if (await isPhantomConnectMobile()) {
        const { tx } = await client.buildSettleBeamTx({
          escrowId: booking.id,
          viewer:   new PK(booking.viewer_wallet),
          streamer: new PK(profile.solana_wallet),
        });
        await phantomConnectSignAndSubmit(tx, 'settle', booking);
        return;
      }
      await client.settleBeam({
        escrowId: booking.id,
        viewer:   new PK(booking.viewer_wallet),
        streamer: new PK(profile.solana_wallet),
      });
    } catch (err) {
      // "Transaction has already been processed" = Anchor's .rpc() resubmitted
      // the signed tx after the first submission already landed. The refund
      // went through; treat as success and fall through to the happy path.
      const { formatEscrowError, isAlreadyProcessed } = await import('@/lib/casi-errors');
      if (!isAlreadyProcessed(err)) {
        console.error('[beam] settleBeam failed:', err);
        showNotif(formatEscrowError(err), 'denied');
        return;
      }
    }
    refreshWalletNav();
    showNotif('◎ Beam ended — refund returned to your wallet', 'warning');
    if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
  };

  /**
   * Reclaim USDC from a stuck Solana escrow. Decodes the on-chain status byte
   * and picks the right instruction:
   *   - Pending → `cancel_escrow` → 100% refund. Happens when the streamer
   *     denied a booking that was never started.
   *   - Active → `settle_beam` → pro-rata refund (vested to streamer, rest
   *     to viewer). Happens when the streamer kicked but the cranker-signed
   *     `settle_beam_delegated` didn't land (no cranker / no delegate / chain
   *     hiccup). Either party can settle at any time while Active, and anyone
   *     can settle after the duration elapses.
   *
   * On-chain state is authoritative. DB status may say `denied` or `expired`
   * but the PDA tells us what's actually possible to do with the funds.
   */
  const reclaimSolanaEscrow = async (booking: any) => {
    if (!booking.escrow_pda) return;
    const clearPdaInDb = async (): Promise<boolean> => {
      // Token path first — the original browser that booked has the
      // cancel_token in localStorage and viewer-deny accepts it.
      const token = readBookingTokens()[booking.id];
      if (token) {
        try {
          const denyRes = await fetch('/api/bookings/viewer-deny', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              booking_id: booking.id,
              cancel_token: token,
              null_escrow: true,
            }),
          });
          if (denyRes.ok) {
            if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
            return true;
          }
        } catch (err) {
          console.error('[reclaim] viewer-deny failed:', err);
        }
      }
      // Fallback: viewer recovered from a different browser than they
      // booked on (cancel_token lives in localStorage). Use the wallet-
      // scoped bulk cleaner — it re-probes each PDA on the server and
      // only nulls escrow_pda on rows where the on-chain PDA is actually
      // gone, so this is safe to call even if some chips still hold
      // funds. Side benefit: it'll clear other ghost chips for the same
      // wallet in the same call.
      const wallet = viewerWalletRef.current;
      if (!wallet && !savedViewerName) return false;
      try {
        const res = await fetch('/api/bookings/cleanup-stale-solana', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            viewer_wallet: wallet ?? undefined,
            viewer_name:   savedViewerName ?? undefined,
            profile_id:    profile?.id,
          }),
        });
        if (!res.ok) return false;
        if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
        return true;
      } catch (err) {
        console.error('[reclaim] cleanup-stale-solana failed:', err);
        return false;
      }
    };

    const { Connection, PublicKey } = await import('@solana/web3.js');
    const conn = new Connection(SOLANA_RPC);
    // Poll-probe the PDA to tolerate RPC replica lag: a tx that just closed
    // the account can take a beat to propagate to every replica we hit, and
    // a single getAccountInfo can read the stale side and falsely report
    // "still alive". Treat "gone on any attempt" as authoritative closure.
    const isPdaClosed = async (attempts = 6, delayMs = 1000): Promise<boolean> => {
      for (let i = 0; i < attempts; i++) {
        const info = await conn.getAccountInfo(new PublicKey(booking.escrow_pda)).catch(() => null);
        if (!info) return true;
        if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
      }
      return false;
    };

    const pdaInfo = await conn.getAccountInfo(new PublicKey(booking.escrow_pda)).catch(() => null);
    if (!pdaInfo) {
      // PDA already closed — funds have left the vault. Clean up the stale row.
      const ok = await clearPdaInDb();
      showNotif(ok ? 'Escrow already closed — cleared' : 'Escrow closed, but DB cleanup failed — refresh the page', 'warning');
      return;
    }

    // EscrowState status byte sits at offset 161 (8 discriminator + 32+32+32+32
    // pubkeys + 8+8+8 u64/i64 + 1 escrow_type). 0 = Pending, 1 = Active.
    // Settled/Cancelled close the account, so a non-null read implies {0, 1}.
    const STATUS_OFFSET = 161;
    const statusByte = pdaInfo.data.length > STATUS_OFFSET ? pdaInfo.data[STATUS_OFFSET] : -1;
    const isActive = statusByte === 1;

    if (isActive) {
      // settle_beam: program splits total pro-rata by elapsed/duration.
      // Viewer's unvested portion lands in their USDC ATA in the same tx.
      if (!booking.viewer_wallet || !profile?.solana_wallet) {
        showNotif('Missing wallet info — refresh and try again', 'denied');
        return;
      }
      try {
        const client = await buildViewerCasiClient();
        if (!client) throw new Error('Wallet not ready to sign');
        const { PublicKey: PK } = await import('@solana/web3.js');
        if (await isPhantomConnectMobile()) {
          const { tx } = await client.buildSettleBeamTx({
            escrowId: booking.id,
            viewer:   new PK(booking.viewer_wallet),
            streamer: new PK(profile.solana_wallet),
          });
          await phantomConnectSignAndSubmit(tx, 'settle', booking);
          return;
        }
        await client.settleBeam({
          escrowId: booking.id,
          viewer:   new PK(booking.viewer_wallet),
          streamer: new PK(profile.solana_wallet),
        });
      } catch (err) {
        const { formatEscrowError, isAlreadyProcessed } = await import('@/lib/casi-errors');
        const msg = err instanceof Error ? err.message : String(err);
        // AlreadySettled / AccountNotInitialized = the escrow closed between
        // our probe and our tx (streamer retried, cranker caught up). Verify
        // on-chain and treat as success if so.
        if (isAlreadyProcessed(err) || /AlreadySettled|AccountNotInitialized/i.test(msg)) {
          if (await isPdaClosed()) {
            const ok = await clearPdaInDb();
            refreshWalletNav();
            showNotif(ok ? '◎ Refund returned to your wallet' : 'Refund returned — booking row needs a manual refresh', 'warning');
            return;
          }
        }
        console.error('[reclaim] settleBeam failed:', err);
        showNotif(formatEscrowError(err), 'denied');
        return;
      }
      const closed = await isPdaClosed();
      const denyOk = await clearPdaInDb();
      refreshWalletNav();
      showNotif(
        denyOk
          ? (closed ? '◎ Prorated refund returned to your wallet' : '◎ Settle confirmed — refund landing in your wallet')
          : '◎ Refund returned — this device will sync shortly',
        'warning',
      );
      return;
    }

    // Status == Pending — original cancel_escrow path.
    let cancelThrew = false;
    try {
      const client = await buildViewerCasiClient();
      if (!client) throw new Error('Wallet not ready to sign');
      if (await isPhantomConnectMobile()) {
        const { tx } = await client.buildCancelEscrowTx({ escrowId: booking.id });
        await phantomConnectSignAndSubmit(tx, 'cancel', booking);
        return;
      }
      await client.cancelEscrow({ escrowId: booking.id });
    } catch (err) {
      cancelThrew = true;
      const { formatEscrowError } = await import('@/lib/casi-errors');
      console.error('[beam] cancelEscrow failed:', err);
      // AlreadySettled = escrow moved out of Pending between our probe and the
      // cancel (approved / settled / cancelled elsewhere). already-processed =
      // Anchor's .rpc() resubmitted a tx that already landed; the underlying
      // cancel likely succeeded. AccountNotInitialized = Anchor couldn't find
      // a valid EscrowState (closed). In all three cases the tx may have
      // actually closed the PDA — poll-probe before concluding otherwise.
      const msg = err instanceof Error ? err.message : String(err);
      if (/AlreadySettled|already.*processed|AccountNotInitialized/i.test(msg)) {
        if (await isPdaClosed()) {
          const ok = await clearPdaInDb();
          refreshWalletNav();
          showNotif(ok ? '◎ USDC returned to your wallet' : 'USDC returned, but booking row needs a manual refresh', 'warning');
          return;
        }
        showNotif('Beam is live — wait for it to finish', 'denied');
        return;
      }
      showNotif(formatEscrowError(err), 'denied');
      return;
    }

    // .rpc() resolved — Anchor has awaited confirmed commitment, so the tx
    // reached the leader and is fully on-chain. Any lingering "PDA still
    // alive" read from here is RPC replica lag, not a failed cancel. Always
    // try to clean the DB row (the Helius webhook would eventually do the
    // same; we short-circuit for snappier UX on the device that signed).
    // clearPdaInDb can fail with 403 when the viewer recovered from a
    // different browser than they booked on (cancel_token lives in
    // localStorage) — that's fine, the webhook will catch it.
    if (cancelThrew) return; // belt-and-suspenders; handled above
    const closed = await isPdaClosed();
    const denyOk = await clearPdaInDb();
    refreshWalletNav();
    if (!closed) {
      console.warn('[beam] cancelEscrow confirmed but PDA probe still reads alive (replica lag):', booking.escrow_pda);
    }
    showNotif(
      denyOk
        ? (closed ? '◎ USDC returned to your wallet' : '◎ Cancel confirmed — USDC landing in your wallet')
        : '◎ USDC returned — this device will sync shortly',
      'warning',
    );
  };

  /**
   * Viewer-side recovery for a stuck Solana flash. Mirror of
   * reclaimSolanaEscrow above, but for the flashes table:
   *
   *   - Probe the escrow PDA. If it's already closed (a prior moderate
   *     tx settled or denied without the DB catching up), call the
   *     viewer-recover route which re-probes server-side and flips the
   *     flash row to `denied`. No wallet popup — there's nothing to sign.
   *   - If the PDA is alive, viewer signs `cancel_escrow` (the program-
   *     level cancel works for any Pending escrow regardless of beam
   *     vs flash type — same EscrowState). After it lands, server route
   *     reflects the closure.
   *   - Handles the race where the PDA closes between probe and tx:
   *     catch AlreadySettled / AccountNotInitialized, fall through to
   *     server-side reconcile.
   */
  const reclaimFlashEscrow = async (flash: any) => {
    if (!flash.escrow_pda || reclaimingFlash) return;
    setReclaimingFlash(flash.id);
    try {
      const reflectClosed = async (toastOk: string, toastFail: string): Promise<void> => {
        const res = await fetch('/api/flashes/viewer-recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flash_id: flash.id }),
        });
        if (res.ok) {
          showNotif(toastOk, 'warning');
          if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
        } else {
          const err = await res.json().catch(() => ({}));
          showNotif(err?.error || toastFail, 'denied');
        }
      };

      const { Connection, PublicKey } = await import('@solana/web3.js');
      const conn = new Connection(SOLANA_RPC, 'confirmed');
      const pdaInfo = await conn.getAccountInfo(new PublicKey(flash.escrow_pda)).catch(() => null);

      // PDA already gone → server-side reconcile, no wallet sign.
      if (!pdaInfo) {
        await reflectClosed(
          '◎ Recovery confirmed — funds already returned',
          'Recovery failed — try again',
        );
        return;
      }

      // PDA still alive → viewer signs cancel_escrow for a full refund.
      const client = await buildViewerCasiClient();
      if (!client) {
        showNotif('Connect your wallet to recover this flash', 'denied');
        return;
      }
      try {
        if (await isPhantomConnectMobile()) {
          const { tx } = await client.buildCancelEscrowTx({ escrowId: flash.id });
          await phantomConnectSignAndSubmit(tx, 'cancel', {
            id: flash.id,
            escrow_pda: flash.escrow_pda,
            viewer_wallet: flash.viewer_wallet ?? '',
          });
          return;
        }
        await client.cancelEscrow({ escrowId: flash.id });
      } catch (err) {
        const { isAlreadyProcessed, formatEscrowError } = await import('@/lib/casi-errors');
        const msg = err instanceof Error ? err.message : String(err);
        if (isAlreadyProcessed(err) || /AlreadySettled|AccountNotInitialized/i.test(msg)) {
          // Race: PDA closed between our probe and our tx. Reconcile.
          await reflectClosed(
            '◎ Already settled — DB synced',
            'Settled on-chain but DB sync failed — refresh',
          );
          return;
        }
        showNotif(formatEscrowError(err), 'denied');
        return;
      }

      // Cancel landed. Tell the server the PDA is closed so the row flips
      // to denied. refreshWalletNav fires the live USDC balance update so
      // the viewer sees their refund land instantly in the nav.
      refreshWalletNav();
      await reflectClosed(
        '◎ USDC refunded',
        'Refund confirmed on-chain — refresh in a moment',
      );
    } finally {
      setReclaimingFlash(null);
    }
  };

  // Bulk-clear ghost RECOVER USDC chips — closed PDAs whose DB rows still
  // carry escrow_pda from a previous build / aborted flow. The server probes
  // each row's PDA and nulls escrow_pda on the ones that are actually gone;
  // rows where the PDA is still alive require a real cancel/settle sign and
  // are left alone.
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const runStaleSolanaCleanup = async () => {
    const wallet = viewerWalletRef.current;
    if ((!wallet && !savedViewerName) || cleanupBusy) return;
    setCleanupBusy(true);
    try {
      const res = await fetch('/api/bookings/cleanup-stale-solana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewer_wallet: wallet ?? undefined,
          viewer_name:   savedViewerName ?? undefined,
          profile_id:    profile?.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showNotif('Cleanup failed — try again', 'denied');
        return;
      }
      const cleaned = Number(body?.cleaned ?? 0);
      const stillOpen = Number(body?.stillOpen ?? 0);
      if (cleaned > 0 && profile?.id) {
        await loadData(profile.id, savedViewerName ?? undefined);
      }
      if (cleaned === 0 && stillOpen === 0) {
        showNotif('Nothing to clean — all chips are real', 'warning');
      } else if (cleaned > 0 && stillOpen === 0) {
        showNotif(`Cleared ${cleaned} ghost chip${cleaned === 1 ? '' : 's'}`, 'success');
      } else if (cleaned > 0 && stillOpen > 0) {
        showNotif(`Cleared ${cleaned}; ${stillOpen} still need manual recover`, 'warning');
      } else {
        showNotif(`${stillOpen} chip${stillOpen === 1 ? '' : 's'} still hold funds — click RECOVER USDC`, 'warning');
      }
    } catch (err) {
      console.error('[cleanup] failed:', err);
      showNotif('Cleanup failed — try again', 'denied');
    } finally {
      setCleanupBusy(false);
    }
  };
  // ──────────────────────────────────────────────────────────────────────────

  const estimatedCost = selectedSlot
    ? selectedSlot.price_unit==='min'
      ? (selectedSlot.price_value * (durationSeconds / 60)).toFixed(2)
      : (selectedSlot.price_value * (durationSeconds / 3600)).toFixed(2)
    : '0';

  // True when the viewer has the content needed to submit a booking.
  // Banner slots use the scrolling message as their content (media is
  // optional). Every other shape requires a valid image/video.
  const canSubmit = selectedSlot?.shape === 'banner'
    ? message.trim().length > 0 && message.length <= BANNER_MAX_MESSAGE
    : uploadMode === 'upload'
      ? !!uploadedUrl
      : (!!imageUrl && imageUrl.startsWith('https://') && imageValid);

  // For booking form accent: extend=yellow, queue/rent=skin accent
  const accentColor    = isExtend ? '#eab308' : tc;
  const accentColorRgb = isExtend ? '234, 179, 8' : tcRgb;
  // Keep denied Solana bookings visible if their escrow PDA still holds funds
  // — the viewer may need to click "recover USDC" to reclaim from chain.
  // Keep expired Solana bookings visible on the same condition — a kick whose
  // on-chain settle silently failed leaves the PDA alive and only the viewer
  // can close it via settle_beam. Keep denied Stripe bookings visible while
  // the deny is fresh so the viewer sees a "refund on the way" chip — the
  // in-memory Set covers live transitions, the created_at fallback covers
  // viewers who reload after the deny landed (no `denied_at` column to key on).
  const visibleMyBookings = myBookings.filter((b:any) => {
    if (b.status === 'expired') {
      return b.payment_method === 'solana' && b.escrow_pda;
    }
    if (b.status === 'denied') {
      if (b.payment_method === 'solana' && b.escrow_pda) return true;
      if (b.payment_method === 'stripe') {
        if (recentlyDenied.has(String(b.id))) return true;
        return Date.now() - new Date(b.created_at).getTime() < STRIPE_DENIED_WINDOW_MS;
      }
      return false;
    }
    return true;
  });

  if (loading) return null;
  if (!isOBS && !nameConfirmed) return (
    <>
      <SkinProvider
        skin={profile?.skin}
        inkColor={profile?.skin === 'custom' ? (profile?.ink_color ?? profile?.theme_color) : null}
        paperColor={profile?.skin === 'custom' ? profile?.paper_color : null}
      />
      <NameEntryScreen onConfirm={confirmName} tc={tc} />
    </>
  );

  return (
    <>
      <SkinProvider
        skin={profile?.skin}
        inkColor={profile?.skin === 'custom' ? (profile?.ink_color ?? profile?.theme_color) : null}
        paperColor={profile?.skin === 'custom' ? profile?.paper_color : null}
      />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes fadeIn    { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes springPop { from{opacity:0;transform:scale(0.88) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
        /* Fires once when a beam goes live: 3s bloom in the streamer's accent
           colour, keyed on activeBooking.id so only the transition triggers it
           (a fresh page mount with an already-active beam will also glow — OK
           for v1; OBS rarely reloads). */
        @keyframes beamGlow  { 0%{box-shadow:0 0 0 rgba(var(--casi-accent-rgb),0)} 15%{box-shadow:0 0 42px 8px rgba(var(--casi-accent-rgb),0.85)} 100%{box-shadow:0 0 0 rgba(var(--casi-accent-rgb),0)} }
        /* Banner marquee: scrolls the viewer's message right-to-left over 20s.
           Infinite loop within the beam's duration. Container clips, track is
           inline-block so its width depends on content length. */
        @keyframes beamMarquee { from{transform:translateX(100%)} to{transform:translateX(-100%)} }
        .beam-shape-circle  { clip-path: circle(50%); }
        .beam-glow          { animation: beamGlow 3s ease-out 1; will-change: box-shadow; }
        .beam-banner        { display:flex; align-items:center; width:100%; height:100%; overflow:hidden; background:rgba(0,0,0,0.78); border-top:2px solid rgba(var(--casi-accent-rgb),0.4); border-bottom:2px solid rgba(var(--casi-accent-rgb),0.4); white-space:nowrap; }
        .beam-banner-track  { display:inline-block; padding-left:100%; color:var(--casi-accent); font-family:var(--font-casi-sans),sans-serif; font-weight:800; font-size:28px; letter-spacing:1px; animation: beamMarquee 20s linear infinite; }
        .ov { min-height:100vh; background:${isOBS?'transparent':'var(--casi-bg)'}; color:var(--casi-text); font-family:var(--font-casi-sans),sans-serif; }

        .ov-nav { display:flex; align-items:center; justify-content:space-between; padding:0 24px; height:56px; border-bottom:1px solid var(--casi-surface); background:color-mix(in srgb,var(--casi-bg) 94%,transparent); backdrop-filter:blur(20px); position:sticky; top:0; z-index:200; }
        .ov-logo { display:flex; align-items:center; gap:8px; text-decoration:none; }
        .ov-wm { font-size:18px; font-weight:800; color:var(--casi-accent); letter-spacing:-0.5px; }
        .ov-nav-right { display:flex; align-items:center; gap:10px; }
        .notif { font-family:var(--font-casi-mono),monospace; font-size:10px; letter-spacing:1px; padding:5px 12px; border-radius:20px; animation:springPop 0.4s cubic-bezier(0.34,1.56,0.64,1) both; white-space:nowrap; max-width:220px; overflow:hidden; text-overflow:ellipsis; }
        .viewer-chip { display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.04); border:1px solid var(--casi-border); border-radius:20px; padding:5px 12px; cursor:pointer; transition:border-color .2s; }
        .viewer-chip:hover { border-color:#333; }
        .vdot { width:6px; height:6px; border-radius:50%; background:var(--casi-accent); animation:blink 1.5s infinite; flex-shrink:0; }
        .vname { font-family:var(--font-casi-mono),monospace; font-size:10px; color:#888; }
        .name-edit-input { background:rgba(255,255,255,0.05); border:1px solid rgba(var(--casi-accent-rgb),0.31); border-radius:8px; padding:6px 12px; font-size:12px; color:var(--casi-text); outline:none; font-family:var(--font-casi-mono),monospace; width:130px; }

        .ov-main { max-width:1200px; margin:0 auto; padding:16px 20px 48px; }
        @media (min-width:900px) { .ov-main { padding:24px 48px 60px; } }
        /* v9 viewer 2-col body — canvas + flashes-feed left, slots/booking right.
           Layout via CSS-grid placement on existing children, no JSX wrapping
           (the canvas div is huge + closes over component state, extracting
           it is fragile). MyBeams + StuckFlashes + FlashPanel span both cols
           via .ov-full-row; canvas/feed sit in col 1, slots/booking in col 2.
           In OBS mode .ov-v9 is not applied so the grid never engages. */
        .ov-main.ov-v9 { display: grid; grid-template-columns: minmax(0,1.4fr) minmax(0,1fr); gap: 24px 32px; align-items: start; max-width: 1280px; }
        .ov-main.ov-v9 > .ov-full-row { grid-column: 1 / -1; }
        .ov-main.ov-v9 > .stream-canvas { grid-column: 1; grid-row: 2; margin-bottom: 0; }
        .ov-main.ov-v9 > .ov-browse-link { grid-column: 1; grid-row: 3; }
        .ov-main.ov-v9 > .slots-sec { grid-column: 2; grid-row: 2 / span 2; margin-top: 0; align-self: start; }
        @media (max-width:900px) {
          .ov-main.ov-v9 { grid-template-columns: 1fr; }
          .ov-main.ov-v9 > .stream-canvas,
          .ov-main.ov-v9 > .ov-browse-link,
          .ov-main.ov-v9 > .slots-sec { grid-column: 1; grid-row: auto; }
        }
        .ov-browse-link {
          display: flex; align-items: center; gap: 10px;
          width: 100%; text-align: left; margin-top: 8px;
          padding: 11px 16px;
          background: var(--surf, var(--casi-surface));
          border: 1px solid var(--line, var(--casi-border));
          border-radius: 10px; cursor: pointer;
          font-family: var(--M), var(--font-casi-mono), monospace;
          font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
          color: var(--text-3, var(--casi-text-muted));
          transition: border-color 0.15s, background 0.15s, color 0.15s;
        }
        .ov-browse-link::before {
          content: "⊞"; font-size: 15px; font-style: normal;
          color: var(--ink-40, rgba(13,207,176,0.4));
          transition: color 0.15s;
        }
        .ov-browse-link:hover {
          border-color: var(--ink-40, rgba(13,207,176,0.4));
          background: var(--ink-04, rgba(13,207,176,0.04));
          color: var(--ink, var(--casi-accent));
        }
        .ov-browse-link:hover::before { color: var(--ink, var(--casi-accent)); }

        .my-beams { background:var(--casi-surface); border:1px solid var(--casi-border); border-radius:12px; padding:14px 16px; margin-bottom:14px; animation:fadeIn .3s ease; }
        .my-beams-lbl { font-family:var(--font-casi-mono),monospace; font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--casi-text-muted); margin-bottom:10px; }
        .my-beams-list { display:flex; flex-wrap:wrap; gap:8px; }
        .beam-chip { display:flex; align-items:center; gap:8px; border-radius:10px; padding:8px 12px; border:1px solid; font-size:12px; }
        .cancel-btn { background:none; border:none; font-family:var(--font-casi-mono),monospace; font-size:9px; color:rgba(248,113,113,0.5); cursor:pointer; text-transform:uppercase; letter-spacing:1px; transition:color .2s; padding:0; margin-left:4px; }
        .cancel-btn:hover { color:#f87171; }

        .stream-canvas { width:100%; aspect-ratio:16/9; border-radius:12px; border:1px solid var(--casi-border); background:#0a0a0a; position:relative; overflow:hidden; margin-bottom:10px; }

        /* ── Slot list — v9 ── sharp borders, ink accent on hover/select,
           48px square thumb that adopts the slot shape via .s-thumb-* helpers
           applied by SlotsList.tsx (none today, so it stays a square — fine
           visually, the type text already conveys shape). */
        .slots-sec { margin-top:24px; }
        .slots-lbl {
          font-family:var(--M); font-size:11px; font-weight:600; color:var(--text-3);
          text-transform:uppercase; letter-spacing:0.16em; margin-bottom:14px;
          display:flex; align-items:center; gap:10px;
        }
        .slots-lbl::before { content:""; display:block; width:18px; height:1px; background:var(--ink); }
        .slots-grid { display:flex; flex-direction:column; gap:8px; }
        .slot-card {
          display:flex; align-items:center; gap:14px;
          padding:14px 16px; background:var(--surf);
          border:1px solid var(--line); border-radius:10px;
          cursor:pointer; text-align:left; width:100%; font:inherit; color:inherit;
          transition:border-color .15s, background .15s;
        }
        .slot-card:hover:not(.s-disabled) { border-color:var(--ink-40); background:var(--ink-04); }
        .slot-card.s-disabled { cursor:default; opacity:.55; }
        .s-thumb {
          width:42px; height:42px; flex-shrink:0; border-radius:0;
          border:1.5px solid var(--ink-40); background:var(--ink-04);
          display:flex; align-items:center; justify-content:center;
          font-family:var(--S); font-size:14px; font-style:italic; color:var(--ink);
        }
        .s-type {
          font-size:14px; font-weight:600; letter-spacing:-0.01em;
          margin-bottom:2px; color:var(--text);
        }
        .s-price {
          font-family:var(--M); font-size:12px; font-weight:600; color:var(--ink);
          letter-spacing:0;
        }

        /* ── Booking form ──────────────────────────────────────────────────────
           Mobile (<900px): bottom sheet — anchors to the bottom of the viewport,
           slides up from the bottom. Capped at 65dvh so the canvas (16:9 +
           nav ≈ 250-270px on typical phones) is fully visible and clear above.
           Desktop (≥900px): static sidebar in grid-column 2. */
        .bf-backdrop {
          position:fixed; inset:0; z-index:499;
          /* Transparent — just a tap-to-dismiss target. The canvas stays
             fully visible above the sheet so viewers can see their preview. */
          background:rgba(0,0,0,0.08);
          animation:bkFadeIn .18s ease;
        }
        @keyframes bkFadeIn { from { opacity:0; } to { opacity:1; } }
        @media (min-width:900px) { .bf-backdrop { display:none; } }
        .bf {
          /* Mobile: bottom sheet capped at 65dvh — leaves room for the full
             canvas (≈210-230px) plus the nav bar above the sheet */
          position:fixed; bottom:0; left:0; right:0; top:auto;
          width:100%;
          max-height:65dvh;
          overflow-y:auto; overflow-x:hidden;
          -webkit-overflow-scrolling:touch;
          overscroll-behavior:contain;
          z-index:500;
          background:var(--surf);
          border:1px solid var(--ink) !important;
          border-bottom:none !important;
          border-radius:16px 16px 0 0;
          padding:0;
          box-shadow:0 -8px 48px rgba(0,0,0,0.65);
          animation:modalIn .28s cubic-bezier(.22,1,.36,1);
        }
        /* drag-handle pill */
        .bf::before {
          content:''; display:block;
          width:36px; height:3px;
          background:var(--line-2, rgba(255,255,255,0.18));
          border-radius:2px;
          margin:10px auto 0;
        }
        @keyframes modalIn { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }
        @media (min-width:900px) {
          /* Desktop: static sidebar — canvas stays visible on the left */
          .bf {
            position:static; bottom:auto; left:auto; right:auto;
            width:auto; max-height:none; overflow:hidden;
            border-radius:14px;
            border-bottom:1px solid var(--ink) !important;
            box-shadow:none;
            animation:slideInV9 .2s ease;
          }
          .bf::before { display:none; }
          .ov-main.ov-v9 > .bf { grid-column:2; grid-row:2 / span 2; margin-top:0; align-self:start; }
        }
        @keyframes slideInV9 { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:none; } }
        .bf-hdr {
          display:flex; align-items:center; justify-content:space-between;
          padding:18px 22px; margin-bottom:0; border-bottom:none;
          background:var(--ink); color:var(--on-ink);
          border-radius:13px 13px 0 0;
        }
        .bf-type {
          font-family:var(--H); font-weight:700; font-size:15px; letter-spacing:-0.015em;
          color:var(--on-ink) !important;  /* override per-component accent inline style */
        }
        .bf-price {
          font-family:var(--M); font-size:11px; font-weight:600;
          letter-spacing:0.16em; text-transform:uppercase;
          padding:5px 9px; background:rgba(0,0,0,0.18);
          color:var(--on-ink) !important;
        }
        .bf-x {
          background:none; border:none; color:var(--on-ink); opacity:.7;
          cursor:pointer; font-size:14px; padding:0 6px; transition:opacity .14s;
          font-family:var(--M);
        }
        .bf-x:hover { opacity:1; color:var(--on-ink); }
        .bf-grid {
          display:grid; grid-template-columns:1fr; gap:16px;
          padding:20px 22px;
        }
        .bf-lbl {
          font-family:var(--M); font-size:10px; font-weight:700; color:var(--text-3);
          text-transform:uppercase; letter-spacing:0.2em;
          display:flex; align-items:center; gap:8px;
          margin-bottom:12px;
        }
        .bf-lbl::before { content:""; display:block; width:14px; height:1.5px; background:var(--ink); }
        .bf-inp {
          width:100%; background:var(--paper);
          border:1px solid var(--line-2); border-radius:8px;
          padding:11px 14px; font-size:13.5px; color:var(--text); outline:none;
          font-family:var(--B); transition:border-color .14s;
        }
        .bf-inp:focus { border-color:var(--ink); }
        .bf-inp::placeholder { color:var(--text-4); }
        .bf-hint {
          font-family:var(--M); font-size:10px; margin-top:6px;
          letter-spacing:0.04em;
        }

        /* Duration row — segmented presets, ink-active. Component renders six
           buttons in a flex row; we promote them to v9's edge-to-edge segment. */
        .dur-row {
          display:flex; align-items:stretch; gap:0; flex-wrap:nowrap;
          margin-top:8px;
        }
        .dur-btn {
          flex:1; padding:9px 4px;
          font-family:var(--M); font-size:11px; font-weight:600; letter-spacing:0.06em;
          background:transparent;
          border:1px solid var(--line-2); border-right:none; border-radius:0;
          color:var(--text-3); cursor:pointer; transition:all .12s;
        }
        .dur-btn:last-child { border-right:1px solid var(--line-2); }
        .dur-btn:hover { background:var(--ink-04); color:var(--ink); border-color:var(--ink-40); }

        /* Footer — receipt panel with the cost on the left, primary action on the right */
        .bf-footer {
          display:flex; align-items:center; justify-content:space-between;
          padding:18px 22px;
          border-top:1.5px solid var(--ink);
          background:var(--paper);
          gap:12px;
        }
        @media (min-width:900px) { .bf-footer { border-radius:0 0 13px 13px; } }
        .bf-cost-lbl {
          font-family:var(--H); font-weight:800; font-size:13px;
          text-transform:uppercase; letter-spacing:0.16em; color:var(--text);
        }
        .bf-cost-val {
          font-family:var(--H); font-weight:800; font-variation-settings:"opsz" 96;
          font-size:32px; letter-spacing:-0.035em; color:var(--ink) !important;
          font-variant-numeric:tabular-nums; margin-top:2px;
        }
        .bf-sub {
          font-family:var(--M); font-weight:700; font-size:12px;
          letter-spacing:0.16em; text-transform:uppercase;
          padding:15px 18px; border:1px solid var(--ink); border-radius:8px;
          background:var(--ink); color:var(--on-ink);
          cursor:pointer; transition:transform .14s, filter .14s;
          white-space:nowrap;
        }
        .bf-sub:disabled {
          background:var(--surf-2) !important; color:var(--text-4) !important;
          border-color:var(--line) !important; cursor:not-allowed;
        }
        .bf-sub:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.1); }

        @media (max-width:640px) {
          .ov-nav { padding:0 16px; }
          .ov-main { padding:12px 14px 60px; }
          .bf-grid { padding:16px; }
          .bf-footer { flex-direction:column; align-items:stretch; padding:18px; }
          .bf-sub { width:100%; text-align:center; }
          .slots-grid { grid-template-columns:1fr; }
        }
        /* iPhone-class viewports: nav-right block fits WalletPill (already
           collapsed to identity-only at ≤768px) + viewer chip without the
           username clipping the wallet address. Truncate the chip name and
           tighten the toast width so a moderation toast can't push the
           layout past the viewport edge. */
        @media (max-width:420px) {
          .ov-nav { padding:0 12px; }
          .ov-nav-right { gap:8px; }
          .notif { max-width:140px; font-size:9.5px; padding:5px 10px; }
          .viewer-chip { padding:5px 9px; }
          .vname { max-width:84px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .bf-grid { padding:16px; gap:14px; }
          .bf-hdr { padding:14px 16px; }
          .bf-footer { padding:14px 16px; }
          .bf-cost-val { font-size:28px; }
        }
      `}</style>

      <div className="ov">
        {!isOBS && (
          <nav className="ov-nav">
            <a href="/" className="ov-logo">
              <CasiMark width={50} height={25} />
              <Wordmark />
            </a>
            <div className="ov-nav-right">
              {/* Wallet pill — net dot, USDC + SOL balances, identity dropdown.
                  v7-styled twin of WalletNav; same useWalletBalances store. */}
              <WalletPill />
              {notification && (
                <div className="notif" style={
                  notification.type==='success' ? { background:`rgba(${tcRgb},0.09)`, border:`1px solid rgba(${tcRgb},0.25)`, color:tc } :
                  notification.type==='queue'   ? { background:`rgba(${tcRgb},0.08)`, border:`1px solid rgba(${tcRgb},0.21)`, color:tc } :
                  notification.type==='denied'  ? { background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.25)', color:'#f87171' } :
                  { background:'rgba(234,179,8,0.1)', border:'1px solid rgba(234,179,8,0.25)', color:'#facc15' }
                }>{notification.text}</div>
              )}
              {selectedSlot && <button onClick={closeSlot} style={{ fontFamily:"var(--font-casi-mono),monospace", fontSize:10, color:'#555', background:'none', border:'none', cursor:'pointer', textTransform:'uppercase', letterSpacing:1.5 }}>Cancel</button>}
              {savedViewerName && !selectedSlot && (
                showChangeName ? (
                  <input type="text" defaultValue={savedViewerName} autoFocus className="name-edit-input"
                    onKeyDown={(e) => { if(e.key==='Enter'){const v=(e.target as HTMLInputElement).value.trim(); if(v){confirmName(v);setShowChangeName(false);}} if(e.key==='Escape')setShowChangeName(false); }}
                    onBlur={(e) => { const v=e.target.value.trim(); if(v)confirmName(v); setShowChangeName(false); }} />
                ) : (
                  <div className="viewer-chip" onClick={() => setShowChangeName(true)}>
                    <span className="vdot" />
                    <span className="vname">@{savedViewerName}</span>
                  </div>
                )
              )}
            </div>
          </nav>
        )}

        {/* v9 streamer header — viewer-mode only. Reads display_name / avatar /
            bio / is_live straight off the already-loaded `profile`. Skipped when
            no profile (search-flow) and in OBS source mode. */}
        {!isOBS && profile && (
          <div className="casi-v9-vb-head">
            <div className="casi-v9-vb-avatar">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" />
              ) : (
                (profile.display_name || profile.username || '?').charAt(0).toUpperCase()
              )}
            </div>
            <div className="casi-v9-vb-info">
              <div className="casi-v9-vb-name">
                {profile.display_name || profile.username}
              </div>
              {profile.bio && <div className="casi-v9-vb-bio">{profile.bio}</div>}
              <div className="casi-v9-vb-status">
                {profile.is_live && (
                  <span className="casi-v9-vb-live-badge">
                    <span className="casi-v9-vb-live-dot" />
                    Live now
                  </span>
                )}
                {profile.username && (
                  <a
                    href={`/overlay?s=${profile.username}`}
                    className="casi-v9-vb-overlay-link"
                  >
                    ↗ /overlay?s={profile.username}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        <main className={isOBS ? '' : 'ov-main ov-v9'}>

          {/* MY BEAMS */}
          {!isOBS && !selectedSlot && (
            <div className="ov-full-row">
            <MyBeamsSection
              bookings={visibleMyBookings}
              activeBookings={activeBookings}
              expiringSoon={expiringSoon}
              onExpiringWarning={(id, s) => {
                if (s <= 300 && s > 0) setExpiringSoon(prev => new Set(prev).add(id));
                else if (s <= 0) setExpiringSoon(prev => { const n = new Set(prev); n.delete(id); return n; });
              }}
              viewerWallet={viewerWalletRef.current}
              cleanupBusy={cleanupBusy}
              onStaleCleanup={runStaleSolanaCleanup}
              tc={tc}
              tcRgb={tcRgb}
              cancelling={cancelling}
              onEndEarly={async (booking, activeBooking) => {
                if (booking.payment_method === 'solana') {
                  // settle_beam pays streamer the vested portion on-chain and
                  // refunds the viewer the rest in a single tx. DB is updated
                  // after to advance the queue; settleSolanaBeam surfaces its
                  // own toast on error.
                  await settleSolanaBeam(booking);
                  if (activeBooking) await clientExpireBooking(activeBooking);
                } else {
                  // Stripe rail. Wait for the server to confirm before
                  // celebrating — previously this fired the success toast
                  // unconditionally, so a 502 from /api/stripe/end-early
                  // (e.g. when the pro-rated amount is below Stripe's
                  // currency minimum) still showed 'Beam ended — refund
                  // issued' on the viewer side while the beam kept
                  // running. clientExpireBooking also moved on, which
                  // realtime then snapped back, leaving the viewer with
                  // a contradictory chip.
                  const res = await fetch('/api/stripe/end-early', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ booking_id: booking.id }),
                  });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({} as { message?: string; error?: string }));
                    const detail = body.message || body.error || `HTTP ${res.status}`;
                    showNotif(`Couldn't end beam early — ${detail}. The beam will continue running until it expires naturally.`, 'error');
                    return;
                  }
                  if (activeBooking) await clientExpireBooking(activeBooking);
                  showNotif('Beam ended — prorated refund issued', 'warning');
                }
              }}
              onCancel={cancelBooking}
              onReclaim={reclaimSolanaEscrow}
              onExpire={clientExpireBooking}
            />
            </div>
          )}

          {/* STREAM CANVAS */}
          <div className={isOBS ? '' : 'stream-canvas'} style={isOBS ? { position:'relative', width:'100vw', height:'100vh' } : {}}>
            {/* Silhouette preview background — visible to viewers while booking, never in OBS */}
            {!isOBS && selectedSlot && profile?.preview_background_url && (
              <img
                src={profile.preview_background_url}
                style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.35, pointerEvents:'none', zIndex:5 }}
                alt=""
              />
            )}
            {/* SVG clipPath defs for custom-shaped slots */}
            {elements.some((el: any) => el.shape === 'custom' && el.clip_path_svg) && (
              <svg width="0" height="0" style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none' }}>
                <defs>
                  {elements.filter((el: any) => el.shape === 'custom' && el.clip_path_svg).map((el: any) => (
                    <clipPath key={el.id} id={`beam-clip-${el.id}`} clipPathUnits="objectBoundingBox">
                      <path d={el.clip_path_svg} />
                    </clipPath>
                  ))}
                </defs>
              </svg>
            )}
            {elements.map((el: any) => {
              const activeBooking   = getActiveBookingForSlot(el.id);
              const isOccupied      = !!activeBooking;
              const queueCount      = queueCounts[el.id]||0;
              const isSelected      = selectedSlot?.id===el.id;
              const myBookingForSlot = getMyBookingForSlot(el.id);
              const myIsExpiring    = myBookingForSlot && expiringSoon.has(myBookingForSlot.id);
              const isLocked        = !!el.locked;
              // Estimated wait for a viewer joining the queue right now:
              // remaining time on the live beam + sum of every queued
              // booking's duration. Matches the booking-form estimate at
              // line 2193 so slot pill and form agree. Clamp to ≥1 min so
              // the pill never reads "0m wait" when there's genuinely a
              // live beam and queue ahead.
              const activeRemainingMin = activeBooking ? Math.max(0, getSecondsRemaining(activeBooking) / 60) : 0;
              const queueOnSlot        = approvedQueuedBookings.filter((b:any) => b.element_id === el.id);
              const queueDurationMin   = queueOnSlot.reduce((sum: number, b:any) => sum + Number(b.duration_minutes || 0), 0);
              const waitMin            = Math.max(1, Math.round(activeRemainingMin + queueDurationMin));
              // Viewer has a preview ready (upload or validated URL)
              const viewerHasPreview = isSelected && (
                (uploadMode === 'upload' && !!uploadedUrl) ||
                (uploadMode === 'url' && imageValid && !!imageUrl)
              );
              const displayImage: string|null = viewerHasPreview
                ? (uploadMode === 'upload' ? uploadedUrl! : imageUrl)
                : (el.image_url || null);
              const displayFileType: 'image'|'video'|null = viewerHasPreview
                ? (uploadMode === 'upload' ? uploadedFileType : getUrlFileType(imageUrl))
                : (activeBooking?.file_type ?? null);
              const showExtend = myBookingForSlot?.status==='active' && expiringSoon.has(myBookingForSlot.id) && canExtend(el.id);

              // Keying the media container on activeBooking.id re-mounts it
              // on every pending→active transition so `.beam-glow`'s CSS
              // animation plays fresh. Key stays stable while a single beam
              // is live, then changes on the next one.
              const mediaKey = `${el.id}-${activeBooking?.id ?? 'none'}`;
              const shapeClass = el.shape === 'circle' ? 'beam-shape-circle' : '';
              const cornerR = (el.shape === 'rect' || el.shape === 'rounded') ? (el.corner_radius ?? (el.shape === 'rounded' ? 14 : 0)) : 0;
              const customClip = el.shape === 'custom' && el.clip_path_svg ? { clipPath: `url(#beam-clip-${el.id})` } : {};
              const glowClass = isOccupied && (el.glow_on_start ?? true) && !el.is_background ? 'beam-glow' : '';

              // Banner slots render the viewer's message as a scrolling
              // marquee in place of the normal image/video content. Falls
              // back to the regular media path if the slot is a banner but
              // no booking is active (just show the empty placeholder).
              const isBannerActive = el.shape === 'banner' && isOccupied && !!activeBooking?.message;

              // The slot itself is the click target — tapping an open beam
              // (or a queued occupied one) opens the booking form. Disabled
              // when the viewer already has a booking here, the slot is
              // locked, or another slot's form is already open (one at a
              // time). Extend / Join queue / Book all route through the
              // same openSlot call with different modes.
              const clickable = !isOBS && !isLocked && !myBookingForSlot && !selectedSlot;
              const handleSlotClick = clickable ? () => openSlot(el, isOccupied) : undefined;
              const isSelectedHere = selectedSlot?.id === el.id;

              // Per-booking customization: when the viewer is staging a
              // new booking on this slot, mirror their live form values
              // so they preview exactly what'll go on stream. Otherwise
              // honor whatever the active booking has stored. Defaults
              // match BANNER_*_RANGE.default / MEDIA_*_RANGE.default in
              // src/lib/banner.ts.
              const cFontPx   = isSelectedHere ? bannerFontPx    : Number(activeBooking?.banner_font_px    ?? 28);
              const cSpeedSec = isSelectedHere ? bannerSpeedSecs : Number(activeBooking?.banner_speed_secs ?? 20);
              const cOffX     = isSelectedHere ? mediaOffsetX    : Number(activeBooking?.media_offset_x    ?? 50);
              const cOffY     = isSelectedHere ? mediaOffsetY    : Number(activeBooking?.media_offset_y    ?? 50);
              const cZoom     = isSelectedHere ? mediaZoom       : Number(activeBooking?.media_zoom        ?? 1);
              const hasCustomCrop = cOffX !== 50 || cOffY !== 50 || cZoom !== 1;
              // circle/hex masks only look right with `cover` — letterbox
              // would leave empty wedges inside the clip-path. Backdrops
              // also cover. Other shapes stay `contain` (preserving the
              // viewer's aspect ratio) UNLESS they've customized — that
              // signals intentional cropping.
              const useCover = el.is_background || el.shape === 'circle' || el.shape === 'custom' || hasCustomCrop;
              const objectFitCss: 'cover' | 'contain' = useCover ? 'cover' : 'contain';
              const mediaInlineStyle: React.CSSProperties = {
                width: '100%', height: '100%',
                objectFit: objectFitCss,
                objectPosition: `${cOffX}% ${cOffY}%`,
                transform: cZoom !== 1 ? `scale(${cZoom})` : undefined,
                pointerEvents: 'none',
              };

              return (
                <div
                  key={el.id}
                  onClick={handleSlotClick}
                  style={{
                    position: 'absolute',
                    left: `${el.pos_x}%`, top: `${el.pos_y}%`,
                    width: `${el.width}%`, height: `${el.height}%`,
                    zIndex: el.is_background ? 10 : 50,
                    cursor: clickable ? 'pointer' : 'default',
                    transition: 'all 0.35s cubic-bezier(0.16,1,0.3,1)',
                    overflow: 'hidden',
                    borderRadius: cornerR > 0 ? `${cornerR}px` : undefined,
                  }}
                >
                  {isBannerActive ? (
                    <div key={mediaKey} className={`beam-banner ${glowClass}`.trim()}>
                      <span
                        className="beam-banner-track"
                        style={{ fontSize: cFontPx, animationDuration: `${cSpeedSec}s` }}
                      >{activeBooking.message}</span>
                    </div>
                  ) : displayImage ? (
                    <div key={mediaKey} className={`${shapeClass} ${glowClass}`.trim()} style={{ position:'relative', width:'100%', height:'100%', ...customClip }}>
                      {/* Backdrop fills (cover, crop as needed). Shape-able
                          beams use cover when they're masked (circle/hex)
                          or when the viewer customized the crop; otherwise
                          contain preserves their aspect ratio. */}
                      {displayFileType === 'video'
                        ? <video key={displayImage} src={displayImage} autoPlay loop muted playsInline style={{ ...mediaInlineStyle, opacity: viewerHasPreview && !isOBS ? 0.65 : 1 }} />
                        : <img key={displayImage ?? 'empty'} src={displayImage} style={{ ...mediaInlineStyle, opacity: viewerHasPreview && !isOBS ? 0.65 : 1 }} alt="" />
                      }
                      {viewerHasPreview && !isOBS && <div style={{ position:'absolute', inset:0, borderRadius:4, boxShadow:`inset 0 0 0 2px rgba(${accentColorRgb},0.5)`, pointerEvents:'none' }} />}
                    </div>
                  ) : el.shape === 'banner' && !isOccupied && !isLocked && !isOBS ? (
                    // Empty banner on the viewer overlay (but NOT on OBS —
                    // stream shouldn't show placeholder text permanently).
                    // Scroll a soft "tip to try" message so viewers can see
                    // what the slot will do before they send a flash.
                    <div className="beam-banner" style={{ opacity: 0.5, borderColor: `rgba(${tcRgb}, 0.3)` }}>
                      <span className="beam-banner-track" style={{ color: `rgba(${tcRgb}, 0.7)` }}>
                        ▰ Banner · your message scrolls here · tip to try
                      </span>
                    </div>
                  ) : (
                    <div
                      className={shapeClass}
                      style={{
                        width:'100%', height:'100%', display:'flex', flexDirection:'column',
                        alignItems:'center', justifyContent:'center',
                        borderRadius: el.is_background ? 12 : 6,
                        // Bumped alpha 0.25 → 0.85 and added an outer dark
                        // stroke (box-shadow) so the dashed slot boundary
                        // survives a bright backdrop image — without it,
                        // slot edges vanish on beach/sky/snow canvases.
                        border: `1.5px dashed ${isLocked
                          ? 'rgba(248,113,113,0.85)'
                          : isOccupied
                            ? `rgba(${tcRgb},0.85)`
                            : el.is_background
                              ? 'rgba(168,85,247,0.85)'
                              : `rgba(${tcRgb},0.85)`}`,
                        background: isLocked
                          ? 'rgba(248,113,113,0.03)'
                          : isOccupied
                            ? `rgba(${tcRgb},0.02)`
                            : el.is_background
                              ? 'rgba(168,85,247,0.03)'
                              : `rgba(${tcRgb},0.02)`,
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.55)',
                      }}
                    >
                      {/* Dark scrim chip behind the icon + countdown so they
                          stay legible against any backdrop. Mirrors the
                          studio/live editor treatment. */}
                      <div
                        style={{
                          display:'inline-flex', flexDirection:'column', alignItems:'center',
                          padding: el.is_background ? '8px 14px' : '5px 10px',
                          borderRadius: 6,
                          background: 'rgba(0,0,0,0.55)',
                          backdropFilter: 'blur(4px)',
                          WebkitBackdropFilter: 'blur(4px)',
                          border: `1px solid ${isLocked
                            ? 'rgba(248,113,113,0.4)'
                            : el.is_background
                              ? 'rgba(168,85,247,0.4)'
                              : `rgba(${tcRgb},0.4)`}`,
                          maxWidth: '90%',
                        }}
                      >
                        <span style={{ fontSize: el.is_background ? 18 : 14, marginBottom: isOccupied ? 3 : 0 }}>
                          {isLocked ? '🔒' : isOccupied ? (el.shape==='banner' ? '▰' : '') : el.is_background ? '🖼' : el.shape==='banner' ? '▰' : '✦'}
                        </span>
                        {isOccupied && (
                          <span style={{ fontFamily:"var(--font-casi-mono),monospace", fontSize:10, color:'#fff', opacity: 0.85 }}>
                            <Countdown booking={activeBooking} onExpire={() => clientExpireBooking(activeBooking)} />
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Selection outline — mirrors the admin studio's selection
                      glow so the booking-form modal below has a clear visual
                      anchor back to the slot that triggered it. */}
                  {isSelectedHere && !isOBS && (
                    <div style={{ position:'absolute', inset:-3, borderRadius:10, border:`2px solid ${accentColor}`, boxShadow:`0 0 0 4px rgba(${accentColorRgb},0.15)`, pointerEvents:'none', zIndex:15 }} />
                  )}

                  {/* Price badge — corner-mounted inside the slot (bottom-
                      centre on backdrops, top-right on beams) so slots
                      pinned to the canvas edge don't have their price
                      label hanging off-screen like the old stack did. */}
                  {!isOBS && (() => {
                    const p = formatSlotPrice(el);
                    return (
                    <div
                      style={{
                        position: 'absolute',
                        ...(el.is_background
                          ? { bottom: 12, left: '50%', transform: 'translateX(-50%)' }
                          : { top: 6, right: 6 }),
                        background: 'rgba(5,5,5,0.92)',
                        border: `1px solid ${Number(el.price_value)===0 ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 20,
                        padding: '3px 10px',
                        pointerEvents: 'none',
                        zIndex: 20,
                        fontFamily: "var(--font-casi-mono),monospace",
                        fontSize: 10,
                        color: p.rail === 'free' ? '#4ade80' : tc,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.rail === 'free' ? '★ Free' : p.label}
                      {el.max_duration_minutes && <span style={{ color:'#555', marginLeft: 6, fontSize: 9 }}>· max {el.max_duration_minutes}m</span>}
                    </div>
                    );
                  })()}

                  {/* Status badge — locked / my booking state, top-left so
                      it doesn't collide with the price on the right. */}
                  {!isOBS && (isLocked || myBookingForSlot) && (
                    <div
                      style={{
                        position: 'absolute', top: 6, left: 6,
                        zIndex: 20, pointerEvents: 'none',
                        fontFamily: "var(--font-casi-mono),monospace", fontSize: 9,
                        padding: '3px 10px', borderRadius: 20, border: '1px solid',
                        ...(isLocked
                          ? { color: 'rgba(248,113,113,0.6)', borderColor: 'rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.08)' }
                          : myIsExpiring
                            ? { color: '#facc15', borderColor: 'rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.08)' }
                            : myBookingForSlot!.status === 'active'
                              ? { color: tc, borderColor: `rgba(${tcRgb},0.3)`, background: `rgba(${tcRgb},0.08)` }
                              : myBookingForSlot!.status === 'approved_queued'
                                ? { color: tc, borderColor: `rgba(${tcRgb},0.22)`, background: `rgba(${tcRgb},0.05)` }
                                : { color: 'var(--casi-text-muted)', borderColor: 'var(--casi-border)', background: 'rgba(255,255,255,0.03)' }
                        ),
                      }}
                    >
                      {isLocked
                        ? '🔒 Locked'
                        : myIsExpiring
                          ? '⚠ Expiring'
                          : myBookingForSlot!.status === 'active'
                            ? '● Your beam'
                            : myBookingForSlot!.status === 'approved_queued'
                              ? '⏳ Queued'
                              : '⌛ Pending'}
                    </div>
                  )}

                  {/* Wait estimate — always shown on occupied slots (even
                      with an empty queue) so viewers know how long they'd
                      wait before clicking through to the booking form.
                      Queue count joins the text when ≥1 viewer is already
                      in line. */}
                  {!isOBS && isOccupied && !myBookingForSlot && !isLocked && (
                    <div
                      style={{
                        position: 'absolute', bottom: 6, right: 6,
                        zIndex: 20, pointerEvents: 'none',
                        fontFamily: "var(--font-casi-mono),monospace", fontSize: 9,
                        color: `rgba(${tcRgb},0.8)`,
                        background: 'rgba(5,5,5,0.85)',
                        border: `1px solid rgba(${tcRgb},0.22)`,
                        borderRadius: 20, padding: '2px 8px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ⏳ {queueCount > 0 ? `${queueCount} queued · ` : ''}~{waitMin}m wait
                    </div>
                  )}

                  {/* Extend — viewer's own beam is expiring and eligible.
                      Separate button so it doesn't collapse into the slot
                      click (which would just re-open the booking form in
                      book-new mode). */}
                  {!isOBS && showExtend && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openSlot(el, false, true); }}
                      style={{
                        position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
                        background: '#eab308', border: 'none', borderRadius: 20,
                        padding: '4px 14px', fontFamily: "var(--font-casi-sans),sans-serif",
                        fontWeight: 700, fontSize: 10, textTransform: 'uppercase',
                        color: 'var(--casi-bg)', cursor: 'pointer', zIndex: 25,
                      }}
                    >
                      Extend
                    </button>
                  )}
                </div>
              );
            })}

            {/* Flash Feed — overlaid on canvas in OBS mode */}
            {isOBS && profile?.id && (
              <FlashFeed profileId={profile.id} streamerCurrency={profile.settlement_currency ?? null} />
            )}
          </div>

          {/* "Browse other streams" link — sits directly under the canvas
              in the v9 two-column grid (col 1, row 3). Opens the modal
              search; not a navigation. Hidden in OBS mode. */}
          {!isOBS && (
            <button
              type="button"
              className="ov-browse-link"
              onClick={() => setShowBrowseModal(true)}
            >
              Browse other streams →
            </button>
          )}

          {/* BOOKING FORM — fixed modal + backdrop */}
          {!isOBS && selectedSlot && (
            <div className="bf-backdrop" onClick={closeSlot} aria-hidden />
          )}
          {!isOBS && selectedSlot && (
            <BookingForm
              slot={selectedSlot}
              accentColor={accentColor}
              accentColorRgb={accentColorRgb}
              tcRgb={tcRgb}
              isExtend={isExtend}
              isQueue={isQueue}
              savedViewerName={savedViewerName ?? ''}
              onChangeNameClick={() => setShowChangeName(true)}
              onClose={closeSlot}
              uploadMode={uploadMode}
              onUploadModeChange={setUploadMode}
              uploadedUrl={uploadedUrl}
              uploadedFileType={uploadedFileType}
              uploading={uploading}
              onFileSelect={handleFileSelect}
              onRemoveUpload={() => { setUploadedUrl(null); setUploadedPath(null); setUploadedFileType(null); }}
              imageUrl={imageUrl}
              imageValid={imageValid}
              onImageUrlChange={setImageUrl}
              onImageValidChange={setImageValid}
              getUrlFileType={getUrlFileType}
              durationSeconds={durationSeconds}
              onDurationChange={setDurationSecsClamped}
              message={message}
              onMessageChange={setMessage}
              estimatedCost={estimatedCost}
              streamerCurrency={profile?.settlement_currency ?? null}
              walletConnected={connected || hasPhantomConnectSession}
              usdcBalance={usdcBalance}
              activeBookings={activeBookings}
              approvedQueuedBookings={approvedQueuedBookings}
              turnstileToken={turnstileToken}
              onTurnstileVerify={onTurnstileVerify}
              onTurnstileExpire={onTurnstileExpire}
              customizeOpen={customizeOpen}
              onCustomizeToggle={() => setCustomizeOpen(o => !o)}
              bannerFontPx={bannerFontPx}
              onBannerFontPxChange={setBannerFontPx}
              bannerSpeedSecs={bannerSpeedSecs}
              onBannerSpeedSecsChange={setBannerSpeedSecs}
              mediaOffsetX={mediaOffsetX}
              mediaOffsetY={mediaOffsetY}
              onMediaOffsetChange={onMediaOffsetChange}
              mediaZoom={mediaZoom}
              onMediaZoomChange={setMediaZoom}
              canSubmit={canSubmit}
              submitting={submitting}
              connecting={connecting}
              onStripeSubmit={submitBooking}
              onSolanaPay={() => {
                if (!connected && !hasPhantomConnectSession) {
                  openWalletModal();
                } else {
                  setTxStatus('idle'); setTxError(null); setShowConfirmModal(true);
                }
              }}
            />
          )}

          {/* SLOTS LIST */}
          {!isOBS && !selectedSlot && (
            <SlotsList
              elements={elements}
              tc={tc}
              tcRgb={tcRgb}
              queueCounts={queueCounts}
              getActiveBookingForSlot={getActiveBookingForSlot}
              getMyBookingForSlot={getMyBookingForSlot}
              onOpenSlot={openSlot}
            />
          )}

          {/* Flash feed + composer. FlashPanel is the single "chat-box-but-
              for-flashes" surface: renders approved flashes chat-style AND
              embeds the SendFlashSection composer inline. No separate
              send-a-flash card above it, no plain text chat — CASI is
              deliberately flash-only. FlashPanel hides the composer when
              a slot booking form is open so the two modals don't fight for
              focus. Rail gating is handled inside FlashPanel via
              streamerProfile. */}
          {/* Stuck-flash recovery — only renders when this viewer (by name
              or wallet) has pending Solana flashes with a live escrow_pda
              that haven't been moderated. Lets the viewer reclaim their
              USDC without waiting on the streamer to act. Hidden in OBS
              mode (this is viewer chrome, not stream content). */}
          {!isOBS && !selectedSlot && (
            <div className="ov-full-row">
              <StuckFlashesPanel
                flashes={myStuckFlashes}
                reclaimingId={reclaimingFlash}
                onReclaim={reclaimFlashEscrow}
              />
            </div>
          )}

          {!isOBS && profile?.id && !selectedSlot && (
            <div className="ov-full-row" style={{ marginTop:24 }}>
              <FlashPanel
                profileId={profile.id}
                viewerName={savedViewerName || null}
                streamerProfile={profile}
                username={username}
                showNotif={showNotif}
              />
            </div>
          )}

          {/* Viewer's today-scoped activity log on this streamer — beams +
              flashes merged, persistent Solscan link per row, running spend
              total at the bottom. Sits under everything else so the viewer
              has the in-progress / send-a-flash surfaces above the fold and
              the receipts at the bottom. Hidden on OBS browser-source mode
              (this is viewer chrome, not stream content) and when no rows
              exist (the component itself early-returns). */}
          {!isOBS && !selectedSlot && username && (
            <div className="ov-full-row" style={{ marginTop:24 }}>
              <MyTransactionsSection rows={myHistory} username={username} />
            </div>
          )}

          {!isOBS && <BrandFooter />}
        </main>
      </div>

      <BrowseStreamersModal open={showBrowseModal} onClose={() => setShowBrowseModal(false)} />

      {/* Solana confirmation modal */}
      {showConfirmModal && selectedSlot && (
        <SolanaConfirmModal
          slot={selectedSlot}
          duration={durationSeconds / 60}
          estimatedCost={estimatedCost}
          username={username}
          recipientWallet={profile?.solana_wallet ?? null}
          usdcBalance={usdcBalance}
          txStatus={txStatus}
          txError={txError}
          txId={confirmedTxId}
          submitting={submitting}
          onConfirm={submitSolanaBooking}
          onCancel={() => { if (!submitting) { setShowConfirmModal(false); setTxStatus('idle'); setTxError(null); setConfirmedTxId(null); } }}
        />
      )}
    </>
  );
}

export default function PerfectOverlay() {
  return <Suspense fallback={null}><OverlayContent /></Suspense>;
}
