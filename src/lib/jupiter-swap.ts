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

// Reference probe amount used only to learn the current SOL/USDC rate —
// arbitrary, doesn't need to be close to the real swap size.
const PROBE_LAMPORTS = 10_000_000; // 0.01 SOL

const MAX_QUOTE_ATTEMPTS = 3;
const INITIAL_BUFFER = 1.015; // +1.5%
const BUFFER_STEP = 0.01; // +1% per retry

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
  });
  const res = await fetch(`${JUPITER_BASE}/quote?${qs.toString()}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    throw new Error(body?.error || `Jupiter quote failed (${res.status})`);
  }
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

  const probe = await fetchQuote({
    inputMint: WSOL_MINT,
    outputMint: usdcMint,
    amount: PROBE_LAMPORTS,
    slippageBps,
  });
  const rate = Number(probe.outAmount) / PROBE_LAMPORTS; // USDC micro per lamport
  if (!(rate > 0)) throw new Error('Could not price SOL → USDC — try again shortly');

  let buffer = INITIAL_BUFFER;
  let lastQuote: JupiterQuote | null = null;
  for (let attempt = 0; attempt < MAX_QUOTE_ATTEMPTS; attempt++) {
    const lamports = Math.ceil((usdcMicroTarget / rate) * buffer);
    const quote = await fetchQuote({
      inputMint: WSOL_MINT,
      outputMint: usdcMint,
      amount: lamports,
      slippageBps,
    });
    lastQuote = quote;
    if (Number(quote.outAmount) >= usdcMicroTarget) {
      return { quote, lamportsRequired: Number(quote.inAmount) };
    }
    buffer += BUFFER_STEP;
  }
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
  const res = await fetch(`${JUPITER_BASE}/swap-instructions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: params.quote,
      userPublicKey: params.userPublicKey.toBase58(),
      wrapAndUnwrapSol: true,
    }),
  });
  const body = (await res.json().catch(() => null)) as SwapInstructionsResponse | null;
  if (!res.ok || !body || body.error) {
    throw new Error(body?.error || `Jupiter swap-instructions failed (${res.status})`);
  }
  if (body.addressLookupTableAddresses?.length) {
    throw new Error('Swap route needs address lookup tables — unsupported on this booking path');
  }
  const swapIx = body.swapInstruction ?? body.swapInstructionPayload;
  if (!swapIx) throw new Error('Jupiter response missing swap instruction');

  return [
    ...(body.computeBudgetInstructions ?? []).map(deserializeInstruction),
    ...(body.setupInstructions ?? []).map(deserializeInstruction),
    deserializeInstruction(swapIx),
    ...(body.cleanupInstruction ? [deserializeInstruction(body.cleanupInstruction)] : []),
  ];
}
