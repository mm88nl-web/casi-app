/**
 * casi-escrow-decoder.ts
 *
 * Pure functions for identifying which CASI escrow instruction was invoked
 * from a Helius enhanced-webhook payload. Keeps the webhook route small and
 * makes the parsing logic unit-testable without pulling in Anchor or the IDL
 * at request time.
 *
 * The webhook payload includes each instruction as `{ programId, accounts,
 * data }` where `data` is base58-encoded raw instruction data. Anchor encodes
 * the first 8 bytes as a discriminator = sha256("global:<ix_name>")[0..8].
 * Matching bytes → instruction name is sufficient; we don't need to decode
 * the argument payload because the `escrow_state` PDA is present in the
 * instruction's account list and we look up bookings by that.
 *
 * Discriminators are hard-coded from src/idl/casi_escrow.json. If the IDL
 * changes (new instruction added, existing one renamed), refresh this file.
 */
export type CasiIxKind =
  | 'initialize_escrow'
  | 'start_beam'
  | 'start_beam_delegated'
  | 'settle_beam'
  | 'settle_beam_delegated'
  | 'cancel_escrow'
  | 'cancel_stale_pending'
  | 'approve_flash'
  | 'approve_flash_delegated'
  | 'deny_flash'
  | 'deny_flash_delegated'
  | 'set_delegate'
  | 'revoke_delegate';

/** First 8 bytes of sha256("global:<ix_name>"), sourced from the Anchor IDL. */
export const CASI_IX_DISCRIMINATORS: Record<CasiIxKind, readonly number[]> = {
  initialize_escrow:       [243, 160,  77, 153,  11,  92,  48, 209],
  start_beam:              [187,  39,  92, 123, 231, 162, 107,  84],
  start_beam_delegated:    [195, 222, 233, 170, 211, 183, 120,  78],
  settle_beam:             [168,  38,  48, 236,  91, 235, 124,  50],
  settle_beam_delegated:   [108, 137,  86,  59,  53, 140, 189,  92],
  cancel_escrow:           [156, 203,  54, 179,  38,  72,  33,  21],
  cancel_stale_pending:    [109, 239, 233,  36,  66,  98, 100, 244],
  approve_flash:           [147, 245, 112, 105, 129, 130,  96, 236],
  approve_flash_delegated: [ 95, 196,  73, 135, 138,  39,   3, 114],
  deny_flash:              [ 29,  88,  56, 249, 152, 228, 136,  97],
  deny_flash_delegated:    [ 45, 240,  57,  94,  62,  69,   5,  73],
  set_delegate:            [242,  30,  46,  76, 108, 235, 128, 181],
  revoke_delegate:         [142,  66,  98, 126, 102,  60,  92, 163],
};

// Reverse lookup: 8-byte key → instruction name. Keyed by comma-joined bytes
// since Uint8Array isn't hashable as a Map key.
const DISC_TO_KIND: Map<string, CasiIxKind> = new Map(
  (Object.entries(CASI_IX_DISCRIMINATORS) as [CasiIxKind, readonly number[]][])
    .map(([kind, bytes]) => [bytes.join(','), kind]),
);

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Precompute char → value map; -1 for chars outside the alphabet.
const BASE58_VALUES = (() => {
  const arr = new Int8Array(128).fill(-1);
  for (let i = 0; i < BASE58_ALPHABET.length; i++) {
    arr[BASE58_ALPHABET.charCodeAt(i)] = i;
  }
  return arr;
})();

/**
 * Decode a base58-encoded string to bytes. Throws on invalid characters.
 *
 * Inlined (rather than pulling bs58 as a dep) because this file's only
 * consumer is the webhook route — no reason to add a top-level dependency
 * for ~20 lines of well-understood code.
 */
export function decodeBase58(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);

  // Count leading '1' chars — each represents a leading zero byte.
  let zeros = 0;
  while (zeros < input.length && input[zeros] === '1') zeros++;

  // Base-256 accumulator, big-endian. Allocate generously: log(58)/log(256) ≈ 0.733.
  const size = Math.ceil(input.length * 0.733) + 1;
  const b256 = new Uint8Array(size);

  for (let i = zeros; i < input.length; i++) {
    const code = input.charCodeAt(i);
    const val = code < 128 ? BASE58_VALUES[code] : -1;
    if (val < 0) throw new Error(`Invalid base58 character: ${input[i]}`);

    let carry = val;
    for (let j = size - 1; j >= 0; j--) {
      carry += 58 * b256[j];
      b256[j] = carry & 0xff;
      carry >>= 8;
    }
  }

  // Skip leading zero bytes in the accumulator, then prepend the zeros we
  // counted up front.
  let start = 0;
  while (start < size && b256[start] === 0) start++;
  const out = new Uint8Array(zeros + (size - start));
  out.set(b256.subarray(start), zeros);
  return out;
}

/**
 * Match the first 8 bytes of an instruction data buffer to a CASI instruction
 * name. Returns null if the buffer is too short or the discriminator is
 * unknown (e.g. a different program instruction, or a new CASI ix we don't
 * have mapped yet).
 */
export function matchDiscriminator(data: Uint8Array): CasiIxKind | null {
  if (data.length < 8) return null;
  const key = `${data[0]},${data[1]},${data[2]},${data[3]},${data[4]},${data[5]},${data[6]},${data[7]}`;
  return DISC_TO_KIND.get(key) ?? null;
}

/**
 * Parse a Helius instruction entry into a recognized CASI instruction, or
 * null if it's not a CASI instruction (wrong program, unknown discriminator,
 * malformed data).
 *
 * `ix.accounts` is passed through unchanged so the caller can match them
 * against `bookings.escrow_pda` without caring about IDL account ordering.
 * `data` is the decoded raw instruction bytes (discriminator included) so
 * callers that need an argument — e.g. `decodeInitializeEscrowAmount` below —
 * don't have to re-decode the base58 string themselves.
 */
export function parseCasiInstruction(
  ix: { programId?: string; data?: string; accounts?: string[] },
  casiProgramId: string,
): { kind: CasiIxKind; accounts: string[]; data: Uint8Array } | null {
  if (!ix || ix.programId !== casiProgramId) return null;
  if (typeof ix.data !== 'string' || ix.data.length === 0) return null;

  let decoded: Uint8Array;
  try {
    decoded = decodeBase58(ix.data);
  } catch {
    return null;
  }

  const kind = matchDiscriminator(decoded);
  if (!kind) return null;

  return {
    kind,
    accounts: Array.isArray(ix.accounts) ? ix.accounts.filter((a): a is string => typeof a === 'string') : [],
    data: decoded,
  };
}

/**
 * Decode the `amount` argument (u64, USDC micro-units) from a raw
 * `initialize_escrow` instruction data buffer.
 *
 * Borsh layout after the 8-byte Anchor discriminator, matching
 * `initialize_escrow(ctx, escrow_id: [u8; 32], amount: u64, duration_secs: u64,
 * escrow_type_val: u8)` in `programs/casi-escrow/src/lib.rs`:
 *   [0..8)   discriminator
 *   [8..40)  escrow_id (32 bytes, fixed array — no length prefix)
 *   [40..48) amount (u64, little-endian)
 *   [48..56) duration_secs (u64, little-endian) — not decoded here
 *   [56]     escrow_type_val (u8) — not decoded here
 *
 * This exists so the webhook can verify the amount actually locked on-chain
 * matches the price the streamer was shown, instead of trusting a
 * transaction signature's mere presence as proof of correct payment (a
 * viewer can sign initialize_escrow directly with any amount — the program,
 * IDL, and client are all public — so "a tx landed" alone proves nothing
 * about how much).
 *
 * Returns null if the buffer is too short to contain the amount field, or if
 * its discriminator isn't initialize_escrow's.
 */
export function decodeInitializeEscrowAmount(data: Uint8Array): bigint | null {
  if (data.length < 48) return null;
  if (matchDiscriminator(data) !== 'initialize_escrow') return null;
  const view = new DataView(data.buffer, data.byteOffset + 40, 8);
  return view.getBigUint64(0, true);
}

/**
 * Computes the USDC micro-units a booking's escrow SHOULD have been funded
 * with, from the same inputs `overlay/page.tsx` uses client-side to build
 * the real `initializeEscrow` call (`totalUsdc = price_unit === 'min'
 * ? price_value * durationMinutes : price_value * (durationMinutes / 60)`,
 * then `Math.round(totalUsdc * 1e6)`). Kept as one exported, tested function
 * rather than inlined in the webhook so the two call sites (client-side
 * amountUsdc, server-side verification) can't silently drift apart.
 */
export function expectedEscrowMicroUsdc(params: {
  priceValue: number;
  priceUnit: string | null;
  durationMinutes: number;
}): bigint {
  const { priceValue, priceUnit, durationMinutes } = params;
  const totalUsdc = priceUnit === 'min'
    ? priceValue * durationMinutes
    : priceValue * (durationMinutes / 60);
  return BigInt(Math.round(totalUsdc * 1_000_000));
}
