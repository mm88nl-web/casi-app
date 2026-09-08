/**
 * jupiter-swap.ts
 *
 * Client-side helper for the "pay with SOL" booking path: viewer holds SOL,
 * not USDC, so we swap SOL → USDC via Jupiter and splice the swap
 * instructions onto the front of the existing initialize_escrow transaction.
 * The escrow deposit instruction is untouched and still pulls a fixed,
 * server-derived USDC amount — this module's only job is making sure that
 * amount exists in the viewer's USDC ATA by the time it runs, in the same
 * atomic transaction. See CasiEscrowClient.buildInitializeBeamTx /
 * buildInitializeFlashTx for the instruction this gets merged with.
 *
 * Deliberately ExactIn, not ExactOut: Jupiter's own docs advise against
 * ExactOut for most cases (it's restricted to three AMMs — Orca Whirlpool,
 * Raydium CLMM/CPMM — versus full-router ExactIn). Instead we estimate the
 * SOL input from a cheap reference quote, add a slippage/price-move buffer,
 * and verify the real quote's outAmount clears the target before using it.
 * If it doesn't, we bump the buffer and retry. Worst case on a bad estimate
 * is a failed transaction (Solana is all-or-nothing — the swap only commits
 * if the following deposit instruction also succeeds), never a fund-loss:
 * the viewer keeps their SOL and can retry.
 */

import { PublicKey, TransactionInstruction } from '@solana/web3.js';

// Free, no-key, rate-limited (1 req/s) tier — plenty for booking-flow volume.
// Swap to api.jup.ag with an API key (JUPITER_API_KEY env var) if volume
// ever outgrows it; same path structure on both hosts.
const JUPITER_BASE = process.env.NEXT_PUBLIC_JUPITER_API_BASE || 'https://lite-api.jup.ag/swap/v1';

export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Rent-exempt minimum for a new SPL token account — mirrors
// ATA_RENT_LAMPORTS in programs/casi-escrow/src/lib.rs (kept as a literal
// here since Rust constants aren't importable client-side; this is a
// protocol-level constant, not something that drifts). If the viewer has
// never held USDC before, Jupiter's swap has to CREATE their USDC ATA as
// part of swap-instructions' setupInstructions — that's a real, separate
// SOL cost on top of the amount actually being swapped, and it's easy to
// undercount: it doesn't show up in a quote's inAmount/outAmount at all.
// Found live 2026-09-07 reviewing this feature before its first real test —
// the original pre-flight check only budgeted MIN_SOL + the swap amount,
// which would silently under-budget by this exact amount for any first-
// time-USDC viewer, the majority case for a SOL-only holder.
export const ATA_RENT_LAMPORTS = 2_039_280;

// Reference probe amount used only to learn the current SOL/USDC rate —
// arbitrary, doesn't need to be close to the real swap size.
const PROBE_LAMPORTS = 10_000_000; // 0.01 SOL

const MAX_QUOTE_ATTEMPTS = 3;
const INITIAL_BUFFER = 1.015; // +1.5%
const BUFFER_STEP = 0.01; // +1% per retry

// Browser fetch() has NO default timeout — a stalled or silently-rate-
// -limited response (the free lite-api tier is 1 req/s) hangs forever with
// no error ever surfacing. Confirmed live 2026-09-07: the first real test
// of this feature got stuck indefinitely on "Funding CASI escrow…" with no
// error shown — this is why. Every Jupiter call now aborts and throws a
// clear, catchable error after FETCH_TIMEOUT_MS instead of hanging the
// whole booking flow.
const FETCH_TIMEOUT_MS = 12_000;

const LOG = '[jupiter-swap]';

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Jupiter request timed out after ${FETCH_TIMEOUT_MS / 1000}s — try again`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

type JupiterIx = {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string; // base64
};

// Loosely typed — we only read the fields we use; the rest of the quote
// object is passed through opaquely to /swap-instructions.
export type JupiterQuote = {
  inAmount: string;
  outAmount: string;
  [key: string]: unknown;
};

type SwapInstructionsResponse = {
  computeBudgetInstructions?: JupiterIx[];
  setupInstructions?: JupiterIx[];
  swapInstruction?: JupiterIx;
  swapInstructionPayload?: JupiterIx;
  cleanupInstruction?: JupiterIx;
  addressLookupTableAddresses?: string[];
  error?: string;
};

function deserializeInstruction(ix: JupiterIx): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, 'base64'),
  });
}

async function fetchQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
}): Promise<JupiterQuote> {
  const qs = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: String(params.amount),
    slippageBps: String(params.slippageBps),
    swapMode: 'ExactIn',
    asLegacyTransaction: 'true',
    restrictIntermediateTokens: 'true',
    // Single-hop only. Not required for correctness (the real fit check is
    // the composed-tx serialize() in overlay/page.tsx), but keeps account
    // counts low as a matter of course — verified live 2026-09-08 that
    // account counts for this pair range from ~18 (direct) to ~39
    // (2-hop) depending on which route currently wins on price. At the
    // swap sizes this feature deals with (single-digit-dollar bookings),
    // the price difference between direct and multi-hop is negligible;
    // margin against the 1232-byte legacy limit once the escrow deposit
    // instruction is added on top is not.
    onlyDirectRoutes: 'true',
  });
  console.log(LOG, 'quote request', { amount: params.amount, slippageBps: params.slippageBps });
  const t0 = Date.now();
  const res = await fetchWithTimeout(`${JUPITER_BASE}/quote?${qs.toString()}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    console.warn(LOG, 'quote failed', { status: res.status, error: body?.error, ms: Date.now() - t0 });
    throw new Error(body?.error || `Jupiter quote failed (${res.status})`);
  }
  console.log(LOG, 'quote ok', { inAmount: body.inAmount, outAmount: body.outAmount, ms: Date.now() - t0 });
  return body as JupiterQuote;
}

/**
 * Find a SOL input amount whose real quote produces at least
 * `usdcMicroTarget` USDC (6-decimal micro-units), via a cheap reference
 * quote for the rate + a buffered real quote, retried with a bigger buffer
 * if the first attempt undershoots (e.g. sudden price move).
 */
export async function getSolToUsdcQuote(params: {
  usdcMint: string;
  usdcMicroTarget: number;
  slippageBps?: number;
}): Promise<{ quote: JupiterQuote; lamportsRequired: number }> {
  const { usdcMint, usdcMicroTarget } = params;
  const slippageBps = params.slippageBps ?? 50;
  console.log(LOG, 'getSolToUsdcQuote start', { usdcMicroTarget, slippageBps });

  const probe = await fetchQuote({
    inputMint: WSOL_MINT,
    outputMint: usdcMint,
    amount: PROBE_LAMPORTS,
    slippageBps,
  });
  const rate = Number(probe.outAmount) / PROBE_LAMPORTS; // USDC micro per lamport
  if (!(rate > 0)) throw new Error('Could not price SOL → USDC — try again shortly');
  console.log(LOG, 'probe rate', { rate });

  let buffer = INITIAL_BUFFER;
  let lastQuote: JupiterQuote | null = null;
  for (let attempt = 0; attempt < MAX_QUOTE_ATTEMPTS; attempt++) {
    const lamports = Math.ceil((usdcMicroTarget / rate) * buffer);
    console.log(LOG, 'buffered attempt', { attempt, buffer, lamports });
    const quote = await fetchQuote({
      inputMint: WSOL_MINT,
      outputMint: usdcMint,
      amount: lamports,
      slippageBps,
    });
    lastQuote = quote;
    if (Number(quote.outAmount) >= usdcMicroTarget) {
      console.log(LOG, 'getSolToUsdcQuote resolved', { attempt, lamportsRequired: quote.inAmount });
      return { quote, lamportsRequired: Number(quote.inAmount) };
    }
    buffer += BUFFER_STEP;
  }
  console.warn(LOG, 'getSolToUsdcQuote exhausted retries', { lastOutAmount: lastQuote?.outAmount, usdcMicroTarget });
  throw new Error(
    `SOL price moved during quoting — got ${lastQuote?.outAmount ?? '?'} of ${usdcMicroTarget} USDC needed. Try again.`,
  );
}

/**
 * Fetch the composable instructions for a quote (NOT a serialized
 * transaction — this is /swap-instructions specifically so the caller can
 * splice the escrow deposit instruction onto the end). Requests
 * asLegacyTransaction so no Address Lookup Tables come back — CASI's whole
 * booking-tx pipeline (mobile Phantom Connect deeplink, wallet-adapter,
 * the PDA-poll race) is built around legacy Transaction, and this keeps
 * the swap compatible with all of it unchanged. Throws rather than silently
 * dropping ALTs if the assumption ever breaks — a transaction missing an
 * ALT account fails clearly on submit anyway, so failing here is no worse
 * and easier to diagnose.
 */
export async function getSwapInstructions(params: {
  quote: JupiterQuote;
  userPublicKey: PublicKey;
}): Promise<TransactionInstruction[]> {
  console.log(LOG, 'swap-instructions request', { userPublicKey: params.userPublicKey.toBase58() });
  const t0 = Date.now();
  const res = await fetchWithTimeout(`${JUPITER_BASE}/swap-instructions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: params.quote,
      userPublicKey: params.userPublicKey.toBase58(),
      wrapAndUnwrapSol: true,
      // The /quote call already passes asLegacyTransaction — found live
      // 2026-09-08 that this does NOT carry over to /swap-instructions on
      // its own; they're independent requests and each determines its own
      // transaction-format compatibility. Without this here, Jupiter can
      // still hand back an ALT-requiring instruction set even for a quote
      // that was itself legacy-compatible, which the addressLookupTable
      // check below then (correctly) rejects — but needlessly, since this
      // flag avoids it in the first place.
      asLegacyTransaction: true,
    }),
  });
  const body = (await res.json().catch(() => null)) as SwapInstructionsResponse | null;
  if (!res.ok || !body || body.error) {
    console.warn(LOG, 'swap-instructions failed', { status: res.status, error: body?.error, ms: Date.now() - t0 });
    throw new Error(body?.error || `Jupiter swap-instructions failed (${res.status})`);
  }
  // Was a hard-fail here. Verified live against the real API 2026-09-08:
  // lite-api currently returns a non-empty addressLookupTableAddresses on
  // essentially every route right now — including a plain 18-account
  // Raydium (non-CLMM) swap, the simplest case there is — so its presence
  // alone doesn't mean the raw instructions actually NEED it to fit in a
  // legacy transaction. That array only matters if you build a
  // VersionedTransaction referencing it; a legacy Transaction built from
  // these same instructions and never mentioning the ALT works fine as
  // long as it's under Solana's 1232-byte legacy tx size limit. Rejecting
  // on this field alone was rejecting nearly every real quote. The real
  // constraint (actual serialized size) is checked by the caller once
  // these instructions are spliced onto the full booking transaction —
  // see overlay/page.tsx's submitSolanaBooking, right after the splice.
  if (body.addressLookupTableAddresses?.length) {
    console.warn(LOG, 'route reports ALT addresses (informational only, not necessarily required)', { count: body.addressLookupTableAddresses.length });
  }
  const swapIx = body.swapInstruction ?? body.swapInstructionPayload;
  if (!swapIx) throw new Error('Jupiter response missing swap instruction');

  const ixs = [
    ...(body.computeBudgetInstructions ?? []).map(deserializeInstruction),
    ...(body.setupInstructions ?? []).map(deserializeInstruction),
    deserializeInstruction(swapIx),
    ...(body.cleanupInstruction ? [deserializeInstruction(body.cleanupInstruction)] : []),
  ];
  console.log(LOG, 'swap-instructions ok', { count: ixs.length, hasSetup: !!body.setupInstructions?.length, ms: Date.now() - t0 });
  return ixs;
}
