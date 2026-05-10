'use client';

// Shared wallet-balance store.
//
// Every component that needs the connected wallet's SOL + USDC balance reads
// them via useWalletBalances() — each mount subscribes to a single module-
// level store, not its own RPC subscription. Every surface (the top-right
// WalletNav, the overlay booking-form "Your balance" display, any future
// admin card) therefore shows the same number in lockstep; the number
// updates live via WebSocket onAccountChange the moment the chain emits a
// state change (same mechanism Phantom uses internally) with a 10s HTTP
// poll backstop in case the WS drops silently.
//
// The "wallet is the truth" invariant: getParsedTokenAccountsByOwner on the
// viewer's pubkey returns only what sits in THEIR ATAs — escrow PDAs are
// owned by the escrow program, not the viewer, so funds locked in a vault
// are correctly excluded. Redeeming / refund lands USDC back in the ATA and
// the WS callback fires immediately → UI reflects the new spendable number.

import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { USDC_MINT } from '@/lib/solana-network';

export type WalletBalances = { sol: number | null; usdc: number | null };

let currentConn:    Connection | null = null;
let currentWallet:  PublicKey  | null = null;
let currentState:   WalletBalances    = { sol: null, usdc: null };
let solSubId:       number | null     = null;
let usdcSubId:      number | null     = null;
let pollInterval:   ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(s: WalletBalances) => void>();

function publish(next: WalletBalances) {
  currentState = next;
  listeners.forEach(l => l(currentState));
}

async function fetchBalances() {
  if (!currentConn || !currentWallet) return;

  // Parallel fetch — cuts cold-mount latency in half versus sequential.
  const [solSettled, usdcSettled] = await Promise.allSettled([
    currentConn.getBalance(currentWallet, 'confirmed'),
    currentConn.getParsedTokenAccountsByOwner(
      currentWallet,
      { mint: new PublicKey(USDC_MINT) },
      'confirmed',
    ),
  ]);

  let sol  = currentState.sol;
  let usdc = currentState.usdc;

  if (solSettled.status === 'fulfilled') {
    sol = solSettled.value / 1e9;
  }
  if (usdcSettled.status === 'fulfilled') {
    usdc = usdcSettled.value.value[0]
      ?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
  }

  if (sol !== currentState.sol || usdc !== currentState.usdc) {
    publish({ sol, usdc });
  }
}

function teardown() {
  if (currentConn && solSubId  !== null) currentConn.removeAccountChangeListener(solSubId ).catch(() => {});
  if (currentConn && usdcSubId !== null) currentConn.removeAccountChangeListener(usdcSubId).catch(() => {});
  if (pollInterval) clearInterval(pollInterval);
  solSubId = usdcSubId = null;
  pollInterval = null;
  currentConn   = null;
  currentWallet = null;
}

function setup(conn: Connection, wallet: PublicKey) {
  currentConn   = conn;
  currentWallet = wallet;

  try {
    solSubId = conn.onAccountChange(
      wallet,
      () => { fetchBalances(); },
      'confirmed',
    );
  } catch (err) {
    console.warn('[wallet-balances] SOL onAccountChange failed — polling only', err);
  }

  try {
    const usdcAta = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), wallet);
    usdcSubId = conn.onAccountChange(
      usdcAta,
      () => { fetchBalances(); },
      'confirmed',
    );
  } catch (err) {
    console.warn('[wallet-balances] USDC onAccountChange failed — polling only', err);
  }

  pollInterval = setInterval(fetchBalances, 10_000);

  // Retry burst: a single fetch right at tx confirmation can land on an RPC
  // replica that's a beat behind the leader; four fetches over ~6s close
  // that propagation window without hammering the RPC.
  (async () => {
    for (const delay of [0, 600, 1800, 3600]) {
      if (delay) await new Promise(r => setTimeout(r, delay));
      // Abort if the wallet changed out from under us mid-burst.
      if (currentWallet?.toBase58() !== wallet.toBase58()) return;
      await fetchBalances();
    }
  })();
}

/**
 * Force-refresh the subscribed wallet's balances. Callers that have just
 * confirmed a tx can call this to nudge the UI faster than the WebSocket
 * callback would arrive on a lagging replica. No-op if no wallet connected.
 */
export function refreshWalletBalances() {
  if (currentConn && currentWallet) fetchBalances();
}

/**
 * React hook — subscribes to the shared balance store. Every component that
 * calls this receives identical values in lockstep. The chain subscription
 * is per-wallet, not per-mount, so two dozen `useWalletBalances()` calls
 * incur exactly one WS sub + one poll interval on the network.
 */
export function useWalletBalances(): WalletBalances {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [state, setState] = useState<WalletBalances>(currentState);

  // (Re)wire the store only when the connected wallet / connection changes.
  // Subsequent mounts for the SAME wallet are no-ops — the store keeps
  // running so numbers stay in sync across route changes and remounts.
  useEffect(() => {
    if (!connected || !publicKey) {
      if (currentWallet !== null) {
        teardown();
        publish({ sol: null, usdc: null });
      }
      return;
    }
    const alreadyConfigured =
      currentWallet?.toBase58() === publicKey.toBase58() && currentConn === connection;
    if (alreadyConfigured) return;

    teardown();
    publish({ sol: null, usdc: null });
    setup(connection, publicKey);
  }, [connection, connected, publicKey]);

  // Register this component's setter with the store.
  useEffect(() => {
    listeners.add(setState);
    // Seed with the latest snapshot (another mount may already have data).
    setState(currentState);
    return () => { listeners.delete(setState); };
  }, []);

  return state;
}
