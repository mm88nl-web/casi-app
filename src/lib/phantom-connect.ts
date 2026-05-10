/**
 * Phantom Connect deeplink helpers.
 *
 * Why this file exists: Phantom mobile's two existing routes both fail for
 * us today (see history of PRs #87-92). The in-app browser's WebView bridge
 * silently drops user approval taps, and the wallet-adapter's mobile
 * deeplink path returns transactions missing the partial signature. Both
 * have been observed live in production logs.
 *
 * Phantom Connect is the official deeplink protocol — the dapp encrypts the
 * payload (the Transaction we want signed), opens a deeplink to Phantom,
 * Phantom decrypts + signs + submits via its OWN RPC, and returns the sig
 * encrypted in a redirect URL. No WebView bridge involved; the only IPC is
 * through the OS's URL-scheme handler. As reliable as opening any other
 * deeplink.
 *
 * Tradeoff: the booking UX is no longer in-page. The user gets bounced
 * Chrome → Phantom app → Chrome with the booking complete. We persist the
 * pending booking_id + cancel_token in localStorage so we can reconcile
 * when they come back.
 *
 * Encryption scheme is NaCl box (XSalsa20-Poly1305 + X25519 ECDH) per
 * https://docs.phantom.app/phantom-deeplinks/encryption.
 */

import nacl from 'tweetnacl';
import bs58 from 'bs58';

// ── Types ────────────────────────────────────────────────────────────────

export type DappKeypair = {
  publicKey:  Uint8Array; // x25519 public key (32 bytes)
  secretKey:  Uint8Array; // x25519 secret key (32 bytes)
};

export type ConnectSession = {
  /** Phantom's ephemeral encryption public key — used to derive the shared
   *  secret with our dapp keypair. Persisted across reloads. */
  phantomEncryptionPublicKey: string; // base58
  /** The wallet pubkey Phantom returned at connect time. */
  walletPublicKey: string;            // base58
  /** Opaque token Phantom uses to identify subsequent calls. */
  session: string;
};

// ── Storage keys ─────────────────────────────────────────────────────────

const KEY_DAPP_KEYPAIR     = 'casi-phantom-dapp-keypair-v1';
const KEY_CONNECT_SESSION  = 'casi-phantom-session-v1';
/** Stash the booking we're in the middle of so we can finalize on return. */
const KEY_PENDING_BOOKING  = 'casi-phantom-pending-booking-v1';

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
  try { return JSON.parse(raw) as ConnectSession; } catch { return null; }
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

export type PendingBooking = {
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
 *  handshake. App URL is the dapp domain (used in Phantom's connect prompt
 *  for branding); cluster picks devnet vs mainnet-beta. */
export function buildConnectUrl(opts: {
  redirectTo: string;
  appUrl?:    string;
  cluster:    'devnet' | 'mainnet-beta';
}): string {
  const kp = getOrCreateDappKeypair();
  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(kp.publicKey),
    cluster:                    opts.cluster,
    app_url:                    opts.appUrl ?? (typeof window !== 'undefined' ? window.location.origin : 'https://casi.gg'),
    redirect_link:              opts.redirectTo,
  });
  return `https://phantom.app/ul/v1/connect?${params.toString()}`;
}

/** Parses a redirect-URL response from Phantom's /connect call. Returns the
 *  ConnectSession on success, or throws on Phantom-side errors. Pass the
 *  current `window.location.search` (or any URLSearchParams). */
export function parseConnectResponse(search: URLSearchParams): ConnectSession {
  const errorCode    = search.get('errorCode');
  const errorMessage = search.get('errorMessage');
  if (errorCode) {
    throw new Error(`Phantom connect error ${errorCode}: ${errorMessage ?? '(no message)'}`);
  }
  const phantomEncryptionPublicKey = search.get('phantom_encryption_public_key');
  const data  = search.get('data');
  const nonce = search.get('nonce');
  if (!phantomEncryptionPublicKey || !data || !nonce) {
    throw new Error('phantom-connect: incomplete connect response');
  }
  const kp = getOrCreateDappKeypair();
  const shared = sharedSecret(bs58.decode(phantomEncryptionPublicKey), kp.secretKey);
  const decrypted = decryptPayload(data, nonce, shared) as { public_key: string; session: string };
  return {
    phantomEncryptionPublicKey,
    walletPublicKey: decrypted.public_key,
    session:         decrypted.session,
  };
}

// ── signAndSendTransaction flow ──────────────────────────────────────────

/** Builds the URL to redirect the user to in order to sign + send a
 *  Transaction. The tx must already have its blockhash + feePayer set.
 *  Returns the deeplink URL the dapp should navigate to. */
export function buildSignAndSendUrl(opts: {
  session:         ConnectSession;
  /** A serialized v0 / legacy Transaction the wallet will sign + submit. */
  transactionB58:  string;
  redirectTo:      string;
}): string {
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
  return `https://phantom.app/ul/v1/signAndSendTransaction?${params.toString()}`;
}

/** Parses a redirect-URL response from Phantom's signAndSendTransaction. */
export function parseSignAndSendResponse(search: URLSearchParams, session: ConnectSession): { signature: string } {
  const errorCode    = search.get('errorCode');
  const errorMessage = search.get('errorMessage');
  if (errorCode) {
    throw new Error(`Phantom sign error ${errorCode}: ${errorMessage ?? '(no message)'}`);
  }
  const data  = search.get('data');
  const nonce = search.get('nonce');
  if (!data || !nonce) {
    throw new Error('phantom-connect: incomplete sign response');
  }
  const kp = getOrCreateDappKeypair();
  const shared = sharedSecret(bs58.decode(session.phantomEncryptionPublicKey), kp.secretKey);
  const decrypted = decryptPayload(data, nonce, shared) as { signature: string };
  if (!decrypted.signature) throw new Error('phantom-connect: response missing signature');
  return { signature: decrypted.signature };
}
