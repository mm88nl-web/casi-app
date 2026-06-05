/**
 * Wallet deeplink helpers (Phantom + Solflare).
 *
 * Why this file exists: on a mobile browser that is NOT inside a wallet's
 * in-app browser, the two in-process routes both fail for us (see history of
 * PRs #87-92). The in-app browser's WebView bridge silently drops user
 * approval taps, and the wallet-adapter's mobile deeplink path returns
 * transactions missing the partial signature. Both have been observed live.
 *
 * The fix is each wallet's official deeplink protocol — the dapp encrypts the
 * payload (the Transaction we want signed), opens a deeplink to the wallet,
 * the wallet decrypts + signs, and returns the result encrypted in a redirect
 * URL. No WebView bridge involved; the only IPC is through the OS's URL-scheme
 * handler. As reliable as opening any other deeplink.
 *
 * Phantom and Solflare implement the SAME protocol (same request params, same
 * NaCl-box encryption, base58 encoding). They differ only in (a) the deeplink
 * base URL and (b) the name of the response param carrying the wallet's
 * ephemeral encryption public key. Those two differences are captured in
 * `WALLETS` below; everything else is shared. Refs:
 *   https://docs.phantom.app/phantom-deeplinks/encryption
 *   https://docs.solflare.com/solflare/technical/deeplinks
 *
 * Tradeoff: the booking UX is no longer in-page. The user gets bounced
 * Chrome → wallet app → Chrome with the booking complete. We persist the
 * pending booking_id + cancel_token in localStorage so we can reconcile
 * when they come back.
 *
 * Encryption scheme is NaCl box (XSalsa20-Poly1305 + X25519 ECDH).
 */

import nacl from 'tweetnacl';
import bs58 from 'bs58';

// ── Wallet registry ────────────────────────────────────────────────────────

/** The wallets we can hand off to via the encrypted deeplink protocol. */
export type DeeplinkWallet = 'phantom' | 'solflare';

type WalletConfig = {
  /** Universal-link base, e.g. `https://phantom.app/ul/v1`. */
  ul:    string;
  /** Name of the response param carrying the wallet's ephemeral x25519 key. */
  encKeyParam: string;
  /** Human label for the connect picker. */
  label: string;
};

const WALLETS: Record<DeeplinkWallet, WalletConfig> = {
  phantom:  { ul: 'https://phantom.app/ul/v1',  encKeyParam: 'phantom_encryption_public_key',  label: 'Phantom'  },
  solflare: { ul: 'https://solflare.com/ul/v1', encKeyParam: 'solflare_encryption_public_key', label: 'Solflare' },
};

export const DEEPLINK_WALLETS: { wallet: DeeplinkWallet; label: string }[] =
  (Object.keys(WALLETS) as DeeplinkWallet[]).map((w) => ({ wallet: w, label: WALLETS[w].label }));

/** Coerce an arbitrary string to a known wallet, defaulting to phantom. */
function normalizeWallet(w: string | null | undefined): DeeplinkWallet {
  return w === 'solflare' ? 'solflare' : 'phantom';
}

// ── Types ────────────────────────────────────────────────────────────────

export type DappKeypair = {
  publicKey:  Uint8Array; // x25519 public key (32 bytes)
  secretKey:  Uint8Array; // x25519 secret key (32 bytes)
};

export type ConnectSession = {
  /** Which wallet this session belongs to — drives which deeplink base URL
   *  subsequent sign calls use. Defaults to 'phantom' for sessions stored
   *  before multi-wallet support (back-compat). */
  wallet: DeeplinkWallet;
  /** The wallet's ephemeral encryption public key — used to derive the shared
   *  secret with our dapp keypair. Persisted across reloads. (Field name is
   *  legacy; it holds whichever wallet's key, not just Phantom's.) */
  phantomEncryptionPublicKey: string; // base58
  /** The wallet pubkey the wallet returned at connect time. */
  walletPublicKey: string;            // base58
  /** Opaque token the wallet uses to identify subsequent calls. */
  session: string;
};

// ── Storage keys ─────────────────────────────────────────────────────────

const KEY_DAPP_KEYPAIR     = 'casi-phantom-dapp-keypair-v1';
const KEY_CONNECT_SESSION  = 'casi-phantom-session-v1';
/** Stash the booking we're in the middle of so we can finalize on return. */
const KEY_PENDING_BOOKING  = 'casi-phantom-pending-booking-v1';
/** Remembers which wallet the viewer last chose in the connect picker, so a
 *  cold booking (book before connecting) knows which wallet to hand off to. */
const KEY_PREFERRED_WALLET = 'casi-deeplink-wallet-v1';

// ── Preferred wallet ───────────────────────────────────────────────────────

/** The wallet to deeplink to when there's no active session yet. Reads the
 *  live session first (authoritative), then the remembered picker choice,
 *  then defaults to phantom. */
export function getPreferredDeeplinkWallet(): DeeplinkWallet {
  const session = getStoredSession();
  if (session) return session.wallet;
  if (typeof window === 'undefined') return 'phantom';
  return normalizeWallet(window.localStorage.getItem(KEY_PREFERRED_WALLET));
}

export function setPreferredDeeplinkWallet(wallet: DeeplinkWallet): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY_PREFERRED_WALLET, wallet);
}

// ── Dapp keypair (persisted) ─────────────────────────────────────────────

/** Returns the dapp's x25519 keypair, generating + persisting on first call. */
export function getOrCreateDappKeypair(): DappKeypair {
  if (typeof window === 'undefined') {
    throw new Error('phantom-connect: SSR call');
  }
  const stored = window.localStorage.getItem(KEY_DAPP_KEYPAIR);
  if (stored) {
    try {
      const { pk, sk } = JSON.parse(stored) as { pk: string; sk: string };
      return {
        publicKey: bs58.decode(pk),
        secretKey: bs58.decode(sk),
      };
    } catch { /* fall through to regen */ }
  }
  const kp = nacl.box.keyPair();
  window.localStorage.setItem(KEY_DAPP_KEYPAIR, JSON.stringify({
    pk: bs58.encode(kp.publicKey),
    sk: bs58.encode(kp.secretKey),
  }));
  return kp;
}

// ── Session persistence ──────────────────────────────────────────────────

/** Storage event we dispatch ourselves when saveSession/clearSession runs.
 *  Lets `useStoredSession` re-render in the same tab — `storage` events only
 *  fire across tabs, not within. */
const SESSION_EVENT = 'casi-phantom-session-changed';

function notifySessionChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function getStoredSession(): ConnectSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY_CONNECT_SESSION);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as ConnectSession;
    // Sessions stored before multi-wallet support have no `wallet` field —
    // they were always Phantom. Normalize so sign calls have a valid base URL.
    return { ...s, wallet: normalizeWallet(s.wallet) };
  } catch { return null; }
}

export function saveSession(s: ConnectSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY_CONNECT_SESSION, JSON.stringify(s));
  notifySessionChange();
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY_CONNECT_SESSION);
  notifySessionChange();
}

// React hook — returns the current Phantom Connect session, re-rendering
// when it changes. Single source for "is the user connected via Phantom
// Connect?" across WalletNav, WalletPill, and the booking flow.
import { useEffect, useState } from 'react';
export function useStoredPhantomConnectSession(): ConnectSession | null {
  const [s, setS] = useState<ConnectSession | null>(null);
  useEffect(() => {
    const refresh = () => setS(getStoredSession());
    refresh();
    window.addEventListener(SESSION_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SESSION_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return s;
}

// ── Pending booking stash ────────────────────────────────────────────────

/** A viewer-side Solana action that's mid-flight via the Phantom Connect
 *  sign deeplink. Persisted across the redirect so the return handler
 *  knows what to do with the signed tx. */
export type PendingBooking = {
  /** What the signed tx is for. Drives the return handler's dispatch:
   *  - 'book'   → POST /api/bookings/attach-solana-tx
   *  - 'flash'  → POST /api/flashes/attach-escrow
   *  - 'settle' → tx already submitted on-chain by us; refresh data
   *  - 'cancel' → tx already submitted on-chain by us; refresh data
   *  Default 'book' for backwards-compatibility with older stashes. */
  kind?:         'book' | 'flash' | 'settle' | 'cancel';
  booking_id:    string;
  cancel_token:  string;
  escrow_pda:    string;
  viewer_wallet: string;
  /** Base58-encoded unsigned tx. Set when we need to do a connect handshake
   *  before signing — on connect-return we re-fire the sign deeplink with
   *  this tx without rebuilding it. */
  pending_tx?:   string;
  /** ms since epoch — older than ~10 min and we treat the stash as stale. */
  ts: number;
};

export function stashPendingBooking(b: Omit<PendingBooking, 'ts'>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY_PENDING_BOOKING, JSON.stringify({ ...b, ts: Date.now() }));
}

export function readPendingBooking(): PendingBooking | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY_PENDING_BOOKING);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingBooking;
    if (Date.now() - p.ts > 10 * 60_000) {
      // Stale — treat as if there's nothing pending so we don't re-finalize
      // bookings the user has already moved past or denied.
      window.localStorage.removeItem(KEY_PENDING_BOOKING);
      return null;
    }
    return p;
  } catch { return null; }
}

export function clearPendingBooking(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY_PENDING_BOOKING);
}

// ── Encryption helpers ───────────────────────────────────────────────────

/** Compute the shared secret for box.open / box. NaCl box does this lazily
 *  on each call; we precompute once and reuse. */
function sharedSecret(theirPublicKey: Uint8Array, ourSecretKey: Uint8Array): Uint8Array {
  return nacl.box.before(theirPublicKey, ourSecretKey);
}

/** Encrypts a JSON-serializable payload using the shared secret + a fresh
 *  random nonce. Returns the base58-encoded payload + nonce per Phantom's
 *  spec. */
function encryptPayload(payload: unknown, sharedKey: Uint8Array): { nonce: string; payload: string } {
  const nonce = nacl.randomBytes(24);
  const message = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = nacl.box.after(message, nonce, sharedKey);
  return {
    nonce: bs58.encode(nonce),
    payload: bs58.encode(encrypted),
  };
}

/** Decrypts a Phantom redirect-URL payload using the shared secret. Returns
 *  the parsed JSON or throws. */
function decryptPayload(payloadB58: string, nonceB58: string, sharedKey: Uint8Array): unknown {
  const payload = bs58.decode(payloadB58);
  const nonce   = bs58.decode(nonceB58);
  const decrypted = nacl.box.open.after(payload, nonce, sharedKey);
  if (!decrypted) throw new Error('phantom-connect: failed to decrypt payload');
  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ── Connect flow ─────────────────────────────────────────────────────────

/** Builds the URL to redirect the user to in order to start a connect
 *  handshake. App URL is the dapp domain (used in the wallet's connect prompt
 *  for branding); cluster picks devnet vs mainnet-beta and is REQUIRED per
 *  both wallets' docs — without it the wallet silently dismisses the deeplink.
 *  `wallet` selects which wallet to hand off to (defaults to phantom). */
export function buildConnectUrl(opts: {
  redirectTo: string;
  appUrl?:    string;
  cluster:    'devnet' | 'mainnet-beta';
  wallet?:    DeeplinkWallet;
}): string {
  const wallet = normalizeWallet(opts.wallet);
  const kp = getOrCreateDappKeypair();
  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(kp.publicKey),
    cluster:                    opts.cluster,
    app_url:                    opts.appUrl ?? (typeof window !== 'undefined' ? window.location.origin : 'https://casi.gg'),
    redirect_link:              opts.redirectTo,
  });
  return `${WALLETS[wallet].ul}/connect?${params.toString()}`;
}

/** Parses a redirect-URL response from a wallet's /connect call. Returns the
 *  ConnectSession on success, or throws on wallet-side errors. Pass the
 *  current `window.location.search` (or any URLSearchParams) and the wallet
 *  the connect deeplink was sent to (so we read the right encryption-key
 *  param). Defaults to phantom for back-compat. */
export function parseConnectResponse(search: URLSearchParams, wallet?: DeeplinkWallet): ConnectSession {
  const w = normalizeWallet(wallet);
  const errorCode    = search.get('errorCode');
  const errorMessage = search.get('errorMessage');
  if (errorCode) {
    throw new Error(`${WALLETS[w].label} connect error ${errorCode}: ${errorMessage ?? '(no message)'}`);
  }
  const walletEncryptionPublicKey = search.get(WALLETS[w].encKeyParam);
  const data  = search.get('data');
  const nonce = search.get('nonce');
  if (!walletEncryptionPublicKey || !data || !nonce) {
    throw new Error('wallet-deeplink: incomplete connect response');
  }
  const kp = getOrCreateDappKeypair();
  const shared = sharedSecret(bs58.decode(walletEncryptionPublicKey), kp.secretKey);
  const decrypted = decryptPayload(data, nonce, shared) as { public_key: string; session: string };
  return {
    wallet:          w,
    phantomEncryptionPublicKey: walletEncryptionPublicKey,
    walletPublicKey: decrypted.public_key,
    session:         decrypted.session,
  };
}

// ── signAndSendTransaction flow ──────────────────────────────────────────

/** Builds the URL to redirect the user to in order to sign a Transaction.
 *  The wallet signs the tx and returns it base58-encoded; the dapp is
 *  responsible for submitting via its own RPC. We use this rather than the
 *  signAndSendTransaction variant because some Phantom Mobile builds
 *  return errorCode=-32601 ("This method is not supported") for the
 *  *AndSend form. signTransaction is universally supported. The target wallet
 *  is taken from the session. */
export function buildSignTransactionUrl(opts: {
  session:         ConnectSession;
  /** A serialized legacy Transaction the wallet will sign. Must already
   *  have feePayer + recentBlockhash set; the wallet will not edit either. */
  transactionB58:  string;
  redirectTo:      string;
}): string {
  const wallet = normalizeWallet(opts.session.wallet);
  const kp = getOrCreateDappKeypair();
  const shared = sharedSecret(bs58.decode(opts.session.phantomEncryptionPublicKey), kp.secretKey);
  const { nonce, payload } = encryptPayload(
    {
      transaction: opts.transactionB58,
      session:     opts.session.session,
    },
    shared,
  );
  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(kp.publicKey),
    nonce,
    redirect_link:              opts.redirectTo,
    payload,
  });
  return `${WALLETS[wallet].ul}/signTransaction?${params.toString()}`;
}

/** Parses the response from a signTransaction deeplink. Returns the signed
 *  serialized tx as base58; the caller is responsible for submitting it
 *  via their own connection. */
export function parseSignTransactionResponse(search: URLSearchParams, session: ConnectSession): { signedTransactionB58: string } {
  const errorCode    = search.get('errorCode');
  const errorMessage = search.get('errorMessage');
  if (errorCode) {
    const label = WALLETS[normalizeWallet(session.wallet)].label;
    throw new Error(`${label} sign error ${errorCode}: ${errorMessage ?? '(no message)'}`);
  }
  const data  = search.get('data');
  const nonce = search.get('nonce');
  if (!data || !nonce) {
    throw new Error('wallet-deeplink: incomplete sign response');
  }
  const kp = getOrCreateDappKeypair();
  const shared = sharedSecret(bs58.decode(session.phantomEncryptionPublicKey), kp.secretKey);
  const decrypted = decryptPayload(data, nonce, shared) as { transaction: string };
  if (!decrypted.transaction) throw new Error('phantom-connect: response missing signed transaction');
  return { signedTransactionB58: decrypted.transaction };
}
