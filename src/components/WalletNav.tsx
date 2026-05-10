'use client';
import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { useStoredPhantomConnectSession, clearSession as clearPhantomConnectSession } from '@/lib/phantom-connect';
import { PublicKey } from '@solana/web3.js';
import { NETWORK_LABEL } from '@/lib/solana-network';
import { useWalletBalances, refreshWalletBalances } from '@/lib/wallet-balances';
// (mobile-wallet handoff helpers removed — Phantom Connect handles mobile signing directly now)
import SolanaIcon from './icons/SolanaIcon';
import UsdcIcon from './icons/UsdcIcon';

// Back-compat export: every existing `refreshWalletNav()` call site now
// routes through the shared balance store. Kept as a named export so the
// overlay/admin pages don't need to change their imports.
export function refreshWalletNav() { refreshWalletBalances(); }

const CSS = `
  .wn-connect {
    display: inline-flex; align-items: center; gap: 8px;
    background: #0f0f0f;
    border: 1px solid rgba(153,69,255,0.3);
    border-radius: 10px;
    padding: 9px 16px;
    font-family: var(--font-casi-mono), monospace;
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
    font-family: var(--font-casi-mono), monospace;
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
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 12px; color: #e8e8e8; letter-spacing: 0.5px;
    padding-right: 10px; border-right: 1px solid #1a1a1a; margin-right: 10px;
  }
  .wn-sol-sym { display: inline-flex; align-items: center; }
  .wn-usdc { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #14F195; letter-spacing: 0.5px; }
  .wn-usdc-sym { display: inline-flex; align-items: center; opacity: 0.85; }
  .wn-loading { color: #333; }

  .wn-key-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 9px 12px;
    background: none; border: none; cursor: pointer;
    font-family: var(--font-casi-mono), monospace; font-size: 12px; letter-spacing: 0.5px;
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
    font-family: var(--font-casi-mono), monospace; font-size: 10px; letter-spacing: 0.5px;
    color: #444; word-break: break-all; border-bottom: 1px solid #1a1a1a;
    line-height: 1.6;
  }
  .wn-drop-addr-label {
    font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #333; display: block; margin-bottom: 6px;
  }

  .wn-drop-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-bottom: 1px solid #111;
    font-family: var(--font-casi-mono), monospace; font-size: 11px;
  }
  .wn-drop-row-label { color: #333; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; }
  .wn-drop-row-val { color: #e8e8e8; }

  .wn-disconnect {
    display: flex; align-items: center; justify-content: center;
    width: 100%; padding: 12px 16px;
    background: none; border: none; cursor: pointer;
    font-family: var(--font-casi-mono), monospace; font-size: 11px; letter-spacing: 1px;
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
  const { setVisible } = useWalletModal();
  // Phantom Connect deeplink session — when present, the user is connected
  // via the encrypted-deeplink path even if wallet-adapter publicKey is null
  // (this happens on mobile Chrome when wallet-adapter's deeplink connect
  // times out before Phantom returns).
  const pcSession = useStoredPhantomConnectSession();
  const effectivePublicKey = publicKey ?? (pcSession ? new PublicKey(pcSession.walletPublicKey) : null);
  const isConnected = connected || !!pcSession;

  // Single source of truth — the same values feed every other balance
  // surface in the app (the overlay booking-form "Your balance" line,
  // any future admin card). Backed by one WS subscription + 10s poll.
  const { sol: solBal, usdc: usdcBal } = useWalletBalances();

  const [dropOpen, setDropOpen]  = useState(false);
  const [dropPos, setDropPos]    = useState<{ top: number; right: number }>({ top: 56, right: 12 });
  const dropRef = useRef<HTMLDivElement>(null);

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
    // Also clear any Phantom Connect session — otherwise the user would
    // appear "connected via Phantom Mobile" right after they disconnected.
    clearPhantomConnectSession();
    setDropOpen(false);
  };

  /* ── Disconnected / connecting ── */
  if (!isConnected || !effectivePublicKey) {
    // On mobile the wallet-adapter's deeplink-based connect frequently
    // times out before the user is even back from Phantom. Give them a
    // direct "Connect via Phantom Mobile" path that uses Phantom Connect
    // — the encrypted deeplink protocol that's reliable regardless of
    // what the WebView bridge does. The button handler lives in the
    // page (it calls into phantom-connect.ts with a redirect URL we
    // pick up on return).
    const onPhantomMobileConnect = async () => {
      const pc = await import('@/lib/phantom-connect');
      const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta'
        ? 'mainnet-beta' : 'devnet') as 'devnet' | 'mainnet-beta';
      const here = window.location.origin + window.location.pathname + window.location.search;
      window.location.href = pc.buildConnectUrl({
        cluster,
        redirectTo: `${here}#phantom-connect-resume`,
      });
    };
    const isMobileUA = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

    return (
      <>
        <style>{CSS}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <button
            className="wn-connect"
            onClick={openWalletModal}
            disabled={connecting}
            style={{ opacity: connecting ? 0.6 : 1, cursor: connecting ? 'not-allowed' : 'pointer' }}
          >
            <SolanaIcon size={12} />
            {connecting ? 'Connecting…' : 'Connect Wallet'}
          </button>
          {isMobileUA && (
            <button
              type="button"
              onClick={onPhantomMobileConnect}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontFamily: 'var(--font-casi-mono), monospace',
                fontSize: 9, letterSpacing: 1, color: '#9945FF', textDecoration: 'underline',
              }}
            >
              Mobile? Connect via Phantom →
            </button>
          )}
        </div>
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
            <span className="wn-sol-sym"><SolanaIcon size={10} /></span>
            {solStr ?? <span className="wn-loading">…</span>}
          </span>
          <span className="wn-usdc">
            <span className="wn-usdc-sym"><UsdcIcon size={11} /></span>
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
          {truncate(effectivePublicKey)}
          <span className={`wn-chevron${dropOpen ? ' open' : ''}`}>▾</span>
        </button>

        {/* Dropdown */}
        {dropOpen && (
          <div className="wn-drop" style={{ top: dropPos.top, right: dropPos.right }}>
            <div className="wn-drop-addr">
              <span className="wn-drop-addr-label">Wallet address</span>
              {effectivePublicKey.toBase58()}
            </div>
            <div className="wn-drop-row">
              <span className="wn-drop-row-label">SOL</span>
              <span className="wn-drop-row-val" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <SolanaIcon size={10} /> {solStr ?? '…'}
              </span>
            </div>
            <div className="wn-drop-row">
              <span className="wn-drop-row-label">USDC</span>
              <span className="wn-drop-row-val" style={{ color: '#14F195', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <UsdcIcon size={11} mono="currentColor" /> {usdcStr ?? '…'}
              </span>
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
