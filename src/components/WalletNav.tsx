'use client';
import { useState, useEffect, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { USDC_MINT, NETWORK_LABEL } from '@/lib/solana-network';

// Module-level refresh signal — allows any page (overlay, admin) to trigger
// an immediate balance re-fetch without prop-drilling or React context.
let _refreshFn: (() => void) | null = null;
export function refreshWalletNav() { _refreshFn?.(); }

const CSS = `
  .wn-connect {
    display: inline-flex; align-items: center; gap: 8px;
    background: #0f0f0f;
    border: 1px solid rgba(153,69,255,0.3);
    border-radius: 10px;
    padding: 9px 16px;
    font-family: 'DM Mono', monospace;
    font-size: 12px; letter-spacing: 0.5px;
    color: #9945FF;
    cursor: pointer;
    transition: border-color .2s, box-shadow .2s, color .2s;
    white-space: nowrap;
    position: relative;
    overflow: hidden;
  }
  .wn-connect::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(circle at 50% 140%, rgba(153,69,255,0.12) 0%, transparent 70%);
    opacity: 0; transition: opacity .25s;
  }
  .wn-connect:hover::before { opacity: 1; }
  .wn-connect:hover {
    border-color: rgba(153,69,255,0.6);
    box-shadow: 0 0 18px rgba(153,69,255,0.3), 0 0 4px rgba(153,69,255,0.2);
    color: #b56eff;
  }
  .wn-connect-icon {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: conic-gradient(from 180deg, #9945FF 0%, #14F195 50%, #9945FF 100%);
    flex-shrink: 0;
  }

  .wn-row {
    display: inline-flex; align-items: center; gap: 0;
    background: #0f0f0f;
    border: 1px solid #1a1a1a;
    border-radius: 10px;
    overflow: visible;
    position: relative;
    font-family: 'DM Mono', monospace;
  }

  .wn-devnet {
    display: flex; align-items: center; gap: 6px;
    padding: 9px 12px;
    border-right: 1px solid #1a1a1a;
  }
  .wn-devnet-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #14F195;
    box-shadow: 0 0 6px rgba(20,241,149,0.6);
    animation: wn-pulse 2s infinite;
    flex-shrink: 0;
  }
  @keyframes wn-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(20,241,149,0.6); }
    50%       { opacity: 0.6; box-shadow: 0 0 2px rgba(20,241,149,0.3); }
  }
  .wn-devnet-label {
    font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
    color: #14F195; opacity: 0.7;
  }

  .wn-bals {
    display: flex; align-items: center; gap: 0;
    padding: 9px 12px;
    border-right: 1px solid #1a1a1a;
  }
  .wn-sol {
    font-size: 12px; color: #e8e8e8; letter-spacing: 0.5px;
    padding-right: 10px; border-right: 1px solid #1a1a1a; margin-right: 10px;
  }
  .wn-sol-sym { color: #9945FF; margin-right: 2px; }
  .wn-usdc { font-size: 12px; color: #14F195; letter-spacing: 0.5px; }
  .wn-usdc-sym { color: #14F195; opacity: 0.6; margin-right: 2px; font-size: 10px; }
  .wn-loading { color: #333; }

  .wn-key-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 9px 12px;
    background: none; border: none; cursor: pointer;
    font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 0.5px;
    color: #666; transition: color .2s, background .2s;
    border-radius: 0 9px 9px 0;
  }
  .wn-key-btn:hover { color: #e8e8e8; background: rgba(255,255,255,0.03); }
  .wn-chevron { font-size: 9px; opacity: 0.5; transition: transform .2s; }
  .wn-chevron.open { transform: rotate(180deg); }

  .wn-drop {
    position: fixed; min-width: 240px;
    background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 12px;
    overflow: hidden; z-index: 9999;
    box-shadow: 0 16px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03);
    animation: wn-drop-in .15s ease;
  }
  @keyframes wn-drop-in { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }

  .wn-drop-addr {
    padding: 14px 16px;
    font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.5px;
    color: #444; word-break: break-all; border-bottom: 1px solid #1a1a1a;
    line-height: 1.6;
  }
  .wn-drop-addr-label {
    font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #333; display: block; margin-bottom: 6px;
  }

  .wn-drop-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-bottom: 1px solid #111;
    font-family: 'DM Mono', monospace; font-size: 11px;
  }
  .wn-drop-row-label { color: #333; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; }
  .wn-drop-row-val { color: #e8e8e8; }

  .wn-disconnect {
    display: flex; align-items: center; justify-content: center;
    width: 100%; padding: 12px 16px;
    background: none; border: none; cursor: pointer;
    font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 1px;
    text-transform: uppercase; color: #f87171;
    transition: background .15s;
  }
  .wn-disconnect:hover { background: rgba(248,113,113,0.06); }

  /* ── Mobile: collapse to dot + address chip only ── */
  @media (max-width: 768px) {
    .wn-bals { display: none; }
    .wn-devnet-label { display: none; }
    .wn-devnet { padding: 8px 10px; }
    .wn-key-btn { padding: 8px 10px; }
    .wn-connect { padding: 7px 12px; font-size: 11px; }
  }
`;

function truncate(pk: PublicKey): string {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export default function WalletNav() {
  const { connected, publicKey, disconnect, wallet, connect, connecting } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const [solBal, setSolBal]     = useState<number | null>(null);
  const [usdcBal, setUsdcBal]   = useState<number | null>(null);
  const [dropOpen, setDropOpen]  = useState(false);
  const [dropPos, setDropPos]    = useState<{ top: number; right: number }>({ top: 56, right: 12 });
  const [refreshTick, setRefreshTick] = useState(0);
  const dropRef = useRef<HTMLDivElement>(null);

  // Register the module-level refresh function so any page can trigger it
  useEffect(() => {
    _refreshFn = () => setRefreshTick(t => t + 1);
    return () => { _refreshFn = null; };
  }, []);

  // Only connect() after an explicit user click — Wallet Standard auto-registers
  // Phantom into `wallet` on page load, but we must not auto-connect silently.
  const userInitiatedConnect = useRef(false);
  useEffect(() => {
    if (wallet && !connected && !connecting && userInitiatedConnect.current) {
      userInitiatedConnect.current = false;
      connect().catch(() => {});
    }
  }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Single-action connect: if a wallet adapter is already selected (Phantom
  // auto-registered via Wallet Standard) call connect() directly.
  // Only open the picker modal when no wallet is pre-selected.
  const openWalletModal = () => {
    userInitiatedConnect.current = true;
    if (wallet) {
      connect().catch(() => {});
    } else {
      setVisible(true);
    }
  };

  // Compute dropdown viewport position when it opens — breaks out of any
  // sticky/stacking context so z-index: 9999 is truly above everything.
  const openDrop = () => {
    if (dropRef.current) {
      const rect = dropRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setDropOpen(o => !o);
  };

  // Keep balances in sync with three signals:
  //   1. WebSocket `onAccountChange` subscriptions on the wallet SOL account
  //      and the derived USDC ATA — fire the instant the chain emits a state
  //      change, matching what Phantom does internally. This is what makes
  //      post-buy / post-refund balances feel "live" instead of lagging.
  //   2. A 10s HTTP poll as backstop — WebSocket subscriptions can drop
  //      silently on flaky networks, and re-subscribing on reconnect isn't
  //      worth the complexity when a poll catches it within 10s.
  //   3. A short retry burst on every effect run (including refreshTick
  //      bumps from `refreshWalletNav()`). This closes the window where a
  //      caller has just confirmed a tx but the RPC replica we hit hasn't
  //      finished propagating the change — a single fetch can read stale.
  //      Four fetches over ~6s covers that window without hammering the RPC.
  // Commitment is 'confirmed' throughout (~2s vs 'finalized' ~13s).
  useEffect(() => {
    if (!connected || !publicKey) { setSolBal(null); setUsdcBal(null); return; }
    let cancelled = false;

    const fetchBalances = async () => {
      try {
        const lamports = await connection.getBalance(publicKey, 'confirmed');
        if (!cancelled) setSolBal(lamports / 1e9);
      } catch { /* ignore */ }

      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { mint: new PublicKey(USDC_MINT) },
          'confirmed',
        );
        const amount = tokenAccounts.value[0]
          ?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
        if (!cancelled) setUsdcBal(amount);
      } catch { if (!cancelled) setUsdcBal(0); }
    };

    // Retry burst — first fetch is immediate; follow-ups cover the
    // confirm→propagate→read window on lagging RPC replicas.
    (async () => {
      for (const delay of [0, 600, 1800, 3600]) {
        if (delay) await new Promise(r => setTimeout(r, delay));
        if (cancelled) return;
        await fetchBalances();
      }
    })();

    // WebSocket subscriptions. `getAssociatedTokenAddressSync` works even
    // when the USDC ATA doesn't exist yet — the subscription fires the
    // moment the account is created, so first-ever USDC arrival is instant.
    let solSubId: number | null  = null;
    let usdcSubId: number | null = null;
    try {
      solSubId = connection.onAccountChange(
        publicKey,
        () => { if (!cancelled) fetchBalances(); },
        'confirmed',
      );
    } catch (err) {
      console.warn('[WalletNav] SOL onAccountChange failed — polling only', err);
    }
    try {
      const usdcAta = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), publicKey);
      usdcSubId = connection.onAccountChange(
        usdcAta,
        () => { if (!cancelled) fetchBalances(); },
        'confirmed',
      );
    } catch (err) {
      console.warn('[WalletNav] USDC onAccountChange failed — polling only', err);
    }

    const interval = setInterval(fetchBalances, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (solSubId  !== null) connection.removeAccountChangeListener(solSubId ).catch(() => {});
      if (usdcSubId !== null) connection.removeAccountChangeListener(usdcSubId).catch(() => {});
    };
  }, [connected, publicKey, connection, refreshTick]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDisconnect = () => {
    disconnect().catch(() => {});
    setDropOpen(false);
  };

  /* ── Disconnected / connecting ── */
  if (!connected || !publicKey) {
    return (
      <>
        <style>{CSS}</style>
        <button
          className="wn-connect"
          onClick={openWalletModal}
          disabled={connecting}
          style={{ opacity: connecting ? 0.6 : 1, cursor: connecting ? 'not-allowed' : 'pointer' }}
        >
          <span className="wn-connect-icon" />
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
      </>
    );
  }

  const solStr  = solBal  !== null ? solBal.toFixed(3)  : null;
  const usdcStr = usdcBal !== null ? usdcBal.toFixed(2) : null;

  /* ── Connected ── */
  return (
    <>
      <style>{CSS}</style>
      <div className="wn-row" ref={dropRef}>

        {/* Network indicator */}
        <div className="wn-devnet">
          <span className="wn-devnet-dot" />
          <span className="wn-devnet-label">{NETWORK_LABEL}</span>
        </div>

        {/* Balances */}
        <div className="wn-bals">
          <span className="wn-sol">
            <span className="wn-sol-sym">◎</span>
            {solStr ?? <span className="wn-loading">…</span>}
          </span>
          <span className="wn-usdc">
            <span className="wn-usdc-sym">$</span>
            {usdcStr ?? <span className="wn-loading">…</span>}
            <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 3 }}>USDC</span>
          </span>
        </div>

        {/* Pubkey button */}
        <button
          className="wn-key-btn"
          onClick={openDrop}
          aria-expanded={dropOpen}
        >
          {truncate(publicKey)}
          <span className={`wn-chevron${dropOpen ? ' open' : ''}`}>▾</span>
        </button>

        {/* Dropdown */}
        {dropOpen && (
          <div className="wn-drop" style={{ top: dropPos.top, right: dropPos.right }}>
            <div className="wn-drop-addr">
              <span className="wn-drop-addr-label">Wallet address</span>
              {publicKey.toBase58()}
            </div>
            <div className="wn-drop-row">
              <span className="wn-drop-row-label">SOL</span>
              <span className="wn-drop-row-val">◎ {solStr ?? '…'}</span>
            </div>
            <div className="wn-drop-row">
              <span className="wn-drop-row-label">USDC</span>
              <span className="wn-drop-row-val" style={{ color: '#14F195' }}>${usdcStr ?? '…'}</span>
            </div>
            <button className="wn-disconnect" onClick={handleDisconnect}>
              ✕ Disconnect
            </button>
          </div>
        )}
      </div>
    </>
  );
}
