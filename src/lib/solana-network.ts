// ── Solana network switch ───────────────────────────────────────────────────
//
// This module is the single source of truth for which Solana cluster the app
// talks to. Every other file imports from here — the hardcoded devnet strings
// that used to live in overlay/admin/webhook routes are gone.
//
// ─── HOW TO FLIP TO MAINNET ────────────────────────────────────────────────
//
// 1. Change the NETWORK constant below from 'devnet' to 'mainnet'.
// 2. In Vercel environment variables:
//      - (Optional) Set NEXT_PUBLIC_SOLANA_RPC to a paid RPC (Helius, QuickNode,
//        Triton) — the public `api.mainnet-beta.solana.com` rate-limits hard
//        and will cause booking failures under load.
// 3. Update the Helius webhook dashboard so it filters mainnet transactions
//    (the webhook ID stays the same; change the cluster setting in Helius UI).
// 4. Re-onboard any existing streamers who have a devnet-only wallet, or warn
//    them that their `solana_wallet` column may point at an address with no
//    mainnet USDC ATA.
//
// Everything else — UI labels, Solscan explorer URLs, faucet hints, error
// messages — adapts automatically based on this constant.
//
// ───────────────────────────────────────────────────────────────────────────

type Network = 'devnet' | 'mainnet';

// ⇩ FLIP THIS. ⇩
export const NETWORK: Network = 'devnet';

export const IS_MAINNET = (NETWORK as Network) === 'mainnet';

// RPC endpoint used by the Anchor `Connection`. Override via env var
// for paid providers (required on mainnet under real load).
export const SOLANA_RPC: string =
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  (IS_MAINNET ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');

// USDC mint addresses. Devnet uses the standard test mint reachable from
// spl-token-faucet.com; mainnet uses the canonical Circle-issued USDC mint.
export const USDC_MINT: string = IS_MAINNET
  ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// Solana wallet adapter network string + wallet-adapter RPC endpoint.
// Static strings so we don't import @solana/web3.js here (keeps the module
// usable from both client and server contexts without bundling concerns).
export const WALLET_ADAPTER_CLUSTER: 'devnet' | 'mainnet-beta' =
  IS_MAINNET ? 'mainnet-beta' : 'devnet';

// Appended to Solscan URLs. Mainnet needs no cluster param.
export const EXPLORER_CLUSTER_QUERY: string = IS_MAINNET ? '' : '?cluster=devnet';

export const NETWORK_LABEL: string = IS_MAINNET ? 'Mainnet' : 'Devnet';
