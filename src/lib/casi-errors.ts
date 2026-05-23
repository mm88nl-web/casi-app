/**
 * casi-errors.ts
 *
 * Maps CasiError codes (from programs/casi-escrow/src/lib.rs) + common
 * Solana wallet / RPC errors to user-friendly toast copy.
 *
 * Keep this file in lockstep with the `#[error_code] pub enum CasiError`
 * block in lib.rs. If you add a new error variant on-chain, add it here too.
 *
 * Variant names and messages mirror the Rust source verbatim so an auditor
 * can grep either side and find matching entries.
 */

/** Ordered list — must match `CasiError` variants in lib.rs. */
export const CASI_ERROR_NAMES = [
  'InvalidAmount',              // 6000
  'InvalidDuration',            // 6001
  'FlashMustHaveZeroDuration',  // 6002
  'InvalidEscrowType',          // 6003
  'Unauthorized',               // 6004
  'AlreadySettled',             // 6005
  'NotActive',                  // 6006
  'WrongEscrowType',            // 6007
  'MathOverflow',               // 6008
  'UnsupportedVersion',         // 6009
  'InvalidExpiry',              // 6010
  'DelegateLifetimeExceedsMax', // 6011
  'DelegateExpired',            // 6012
  'PendingNotStale',            // 6013
  'ProtocolPaused',             // 6014
  'InvalidMint',                // 6015
  'AmountExceedsCap',           // 6016
  'InvalidAdmin',               // 6017
  'TransferHookNotAllowed',     // 6018
  'AmountBelowMin',             // 6019
] as const;

export type CasiErrorName = (typeof CASI_ERROR_NAMES)[number];

/** Anchor custom error codes start at 6000 and increment by variant index. */
export const CASI_ERROR_CODE_BASE = 6000;

/** name → friendly copy shown in the spring-animated toast. */
const FRIENDLY: Record<CasiErrorName, string> = {
  InvalidAmount:             'Flash amount must be greater than zero.',
  InvalidDuration:           'Beam duration must be greater than zero.',
  FlashMustHaveZeroDuration: 'Flash escrows must have zero duration.',
  InvalidEscrowType:         'Unknown escrow type — please refresh and try again.',
  Unauthorized:              'Only the streamer can approve or deny this flash.',
  AlreadySettled:            'This flash has already been approved or denied.',
  NotActive:                 'This beam has not started yet.',
  WrongEscrowType:           'Wrong escrow type for this action.',
  MathOverflow:              'Transaction amount is out of range — please try a smaller value.',
  UnsupportedVersion:         'Escrow account format is out of date — please contact support.',
  InvalidExpiry:              'Delegate expiry must be in the future.',
  DelegateLifetimeExceedsMax: 'Delegate lifetime is too long — please choose a shorter window.',
  DelegateExpired:            'Streamer session key has expired — please ask them to refresh it.',
  PendingNotStale:            'This booking is not old enough to cancel permissionlessly yet.',
  ProtocolPaused:             'The escrow program is paused — new bookings cannot be created right now.',
  InvalidMint:                'Token mint does not match the configured mint for this program.',
  AmountExceedsCap:           'Amount exceeds the per-booking cap — please try a smaller value.',
  InvalidAdmin:               'Invalid admin address.',
  TransferHookNotAllowed:     'This token mint uses a transfer hook and cannot be used with this program.',
  AmountBelowMin:             'Amount is below the minimum for this program.',
};

/**
 * Extract a CasiError name from any thrown value.
 *
 * Handles:
 *   - AnchorError with `error.errorCode.code` set to the variant name
 *   - Error messages containing "Error Code: Foo" or "CasiError::Foo"
 *   - Program logs containing "custom program error: 0xN" → mapped by index
 */
type MaybeAnchorError = {
  error?: { errorCode?: { code?: unknown } };
  message?: unknown;
  logs?: unknown;
};

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return String(err ?? '');
}

export function parseCasiError(err: unknown): CasiErrorName | null {
  if (!err || typeof err !== 'object') return null;

  const e = err as MaybeAnchorError;

  // Anchor v0.30 surface: err.error.errorCode.code is the variant name.
  const anchorCode = e.error?.errorCode?.code;
  if (typeof anchorCode === 'string' && (CASI_ERROR_NAMES as readonly string[]).includes(anchorCode)) {
    return anchorCode as CasiErrorName;
  }

  const logs = Array.isArray(e.logs) ? (e.logs as unknown[]).filter(l => typeof l === 'string').join('\n') : '';
  const text = errorMessage(err) || logs || String(err);

  for (const name of CASI_ERROR_NAMES) {
    if (text.includes(`Error Code: ${name}`)) return name;
    if (text.includes(`CasiError::${name}`))  return name;
  }

  // Fallback: "custom program error: 0x1771" → 0x1771 = 6001 = variant 1.
  const hexMatch = text.match(/custom program error:\s*0x([0-9a-fA-F]+)/);
  if (hexMatch) {
    const code  = parseInt(hexMatch[1], 16);
    const index = code - CASI_ERROR_CODE_BASE;
    if (index >= 0 && index < CASI_ERROR_NAMES.length) return CASI_ERROR_NAMES[index];
  }

  return null;
}

/** True if the user rejected the wallet signing prompt. */
export function isUserRejection(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes('user rejected') ||
    msg.includes('user denied')   ||
    msg.includes('rejected the request')
  );
}

/** True if the failure looks like a stale blockhash / network hiccup. */
export function isTransientRpcError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes('block height exceeded') ||
    msg.includes('blockhash not found')   ||
    msg.includes('timeout')               ||
    msg.includes('timed out')
  );
}

/**
 * True if the RPC rejected the tx because the cluster already has this
 * signature on file. This is NOT a real failure — it means a prior submission
 * of the same signed tx already landed and the state change succeeded. Anchor's
 * `.rpc()` helper can resubmit when confirmation is slow, and wallet adapters
 * occasionally do the same. Callers should treat this as success.
 */
export function isAlreadyProcessed(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes('already been processed') ||
    msg.includes('already processed')
  );
}

/**
 * True if the wallet returned a transaction without the viewer's signature
 * attached — the cluster rejects with "Signature verification failed" /
 * "Missing signature for public key …". This happens with mobile deeplink
 * wallets (Phantom Mobile via mobile Chrome/Brave) where the deeplink
 * round-trip drops the partial signature on the way back. The wallet's
 * own in-app browser doesn't have this issue.
 */
export function isWalletSignatureMissing(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes('signature verification failed') ||
    msg.includes('missing signature for public key') ||
    msg.includes('missing signer')
  );
}

/**
 * Produce a short toast-ready string for any error thrown during a CASI
 * escrow tx. Precedence:
 *   1. User rejected in wallet → "Transaction cancelled"
 *   2. Wallet signature missing (mobile deeplink) → mobile-aware copy
 *   3. Mapped CasiError        → friendly copy from FRIENDLY
 *   4. Transient RPC error     → "Network issue — please try again"
 *   5. Fallback                → trimmed err.message (max 140 chars)
 *
 * Note: callers should check `isAlreadyProcessed(err)` BEFORE calling this —
 * that's a false alarm (the first submission landed), not a real error, so
 * it should short-circuit to the happy path instead of being formatted.
 */
export function formatEscrowError(err: unknown): string {
  if (isUserRejection(err)) return 'Transaction cancelled';

  if (isWalletSignatureMissing(err)) {
    return 'Wallet didn\'t return a signature. On mobile, open this page from your wallet\'s built-in browser (Phantom → Browser → paste casi.gg/...) and try again.';
  }

  const code = parseCasiError(err);
  if (code) return FRIENDLY[code];

  if (isTransientRpcError(err)) return 'Network issue — please try again';

  const raw = errorMessage(err).trim() || 'Unknown error';
  return raw.length > 140 ? raw.slice(0, 137) + '…' : raw;
}
