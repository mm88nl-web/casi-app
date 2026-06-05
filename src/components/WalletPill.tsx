'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { NETWORK_LABEL } from '@/lib/solana-network';
import { useStoredPhantomConnectSession, clearSession as clearPhantomConnectSession } from '@/lib/phantom-connect';
import { needsMobileHandoff } from '@/lib/mobile-wallet';
import MobileWalletPicker from './MobileWalletPicker';
import { useWalletBalances } from '@/lib/wallet-balances';
// (mobile-wallet handoff helpers removed — Phantom Connect deeplink path now handles mobile signing)
import UsdcIcon from './icons/UsdcIcon';
import SolanaIcon from './icons/SolanaIcon';


const CSS = `
  /* Disconnected CTA — v9 inverse-ink slab. Same palette as the v9
     Connect-wallet pill in NavBar (.casi-v9-wlt-connect) but with the
     Solana-purple accent kept on the icon for brand recognition. */
  .wp-connect {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 9px 14px;
    font-family: var(--M);
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--on-ink);
    background: var(--ink);
    border: 1px solid var(--ink);
    cursor: pointer;
    transition: filter .14s;
    white-space: nowrap;
  }
  .wp-connect:hover { filter: brightness(1.1); }
  .wp-connect:disabled { opacity: 0.6; cursor: not-allowed; }

  /* Connected pill — three segments separated by --line dividers,
     ink-04 wash on the network segment, sharp corners. Mirrors v9
     .wlt-btn / .wlt-net / .wlt-balance / .wlt-identity. */
  .wp-row {
    display: inline-flex; align-items: stretch; gap: 0;
    background: var(--surf);
    border: 1px solid var(--line);
    font-family: var(--M);
    font-size: 11px;
    position: relative;
    transition: border-color .14s, box-shadow .14s;
  }
  .wp-row:hover { border-color: var(--ink-40); box-shadow: 0 0 0 3px var(--ink-08); }
  .wp-row.open  { border-color: var(--ink); box-shadow: 0 0 0 3px var(--ink-08); }

  .wp-net {
    display: flex; align-items: center; gap: 7px;
    padding: 0 12px; height: 38px;
    border-right: 1px solid var(--line);
    background: var(--ink-04);
  }
  .wp-net-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: #22c55e;
    flex-shrink: 0;
    box-shadow: 0 0 0 2px color-mix(in oklab, #22c55e 30%, transparent);
    margin-left: 2px;
  }
  .wp-net-lbl {
    font-size: 9.5px; font-weight: 700; line-height: 1;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--ink);
  }

  .wp-balance {
    display: flex; align-items: center; gap: 8px;
    padding: 0 13px; height: 38px;
    border-right: 1px solid var(--line);
  }
  .wp-usdc { font-size: 11px; color: var(--text); font-weight: 500; letter-spacing: 0.01em; font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 4px; }
  .wp-usdc-sym { flex-shrink: 0; }
  .wp-usdc-unit { font-size: 9px; color: var(--text-4); letter-spacing: 0.12em; text-transform: uppercase; margin-left: 4px; }
  .wp-bal-sep { width: 1px; height: 14px; background: var(--line); align-self: center; flex-shrink: 0; }
  .wp-sol { font-size: 10.5px; color: var(--text-3); font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 4px; }
  .wp-sol-sym { flex-shrink: 0; }
  .wp-loading { color: var(--text-4); }

  .wp-identity {
    display: flex; align-items: center; gap: 8px;
    padding: 0 12px; height: 38px;
    background: none; border: none; cursor: pointer;
    color: var(--text-3); font: inherit;
    transition: color .14s;
  }
  .wp-identity:hover { color: var(--text); }
  .wp-avatar-img {
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
    object-fit: cover; background: var(--paper);
    box-shadow: inset 0 0 0 1.5px var(--paper);
  }
  /* Conic-gradient avatar — v9 .wlt-avatar pattern, ink-derived so it
     adopts the streamer's brand color automatically. */
  .wp-avatar-fallback {
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
    background: conic-gradient(from 220deg at 65% 35%,
      color-mix(in oklab, var(--ink) 40%, white) 0deg,
      var(--ink) 90deg,
      color-mix(in oklab, var(--ink) 60%, black) 200deg,
      color-mix(in oklab, var(--ink) 40%, white) 360deg);
    box-shadow: inset 0 0 0 1.5px var(--paper);
  }
  .wp-addr { color: var(--text-3); letter-spacing: 0.04em; font-weight: 500; }
  .wp-caret { font-size: 9px; opacity: 0.55; margin-left: 1px; transition: transform .15s; }
  .wp-caret.open { transform: rotate(180deg); opacity: 1; color: var(--ink); }

  /* Dropdown — sharp panel matching v9 .wlt-drop. */
  .wp-drop {
    position: fixed; min-width: 260px;
    background: var(--surf);
    border: 1px solid var(--line-2);
    overflow: hidden;
    z-index: 9999;
    box-shadow: 0 20px 50px color-mix(in oklab, var(--paper) 60%, black);
    animation: wp-drop-in .14s ease;
  }
  @keyframes wp-drop-in { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }

  .wp-drop-head {
    padding: 16px 18px;
    border-bottom: 1px solid var(--line);
    background: var(--ink-04);
  }
  .wp-drop-id {
    display: flex; align-items: center; gap: 11px;
    margin-bottom: 4px;
  }
  .wp-drop-id-img {
    width: 34px; height: 34px; border-radius: 0; flex-shrink: 0;
    object-fit: cover; background: var(--paper);
  }
  .wp-drop-id-fallback {
    width: 34px; height: 34px; border-radius: 0; flex-shrink: 0;
    background: var(--ink);
  }
  .wp-drop-name {
    font-family: var(--B);
    font-size: 13.5px; font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
  }
  .wp-drop-addr {
    font-family: var(--M);
    font-size: 10.5px; letter-spacing: 0.04em;
    color: var(--text-3);
    word-break: break-all; line-height: 1.55;
  }
  .wp-drop-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid var(--line);
    transition: background .12s;
  }
  .wp-drop-row:hover { background: var(--ink-04); }
  .wp-drop-lbl {
    font-family: var(--M);
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--text-4);
  }
  .wp-drop-val {
    font-family: var(--M);
    font-size: 12.5px; font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .wp-disconnect {
    display: flex; align-items: center; justify-content: center;
    width: 100%; padding: 12px 18px;
    background: none; border: none; cursor: pointer;
    font-family: var(--M);
    font-size: 10.5px; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: #f87171;
    transition: background .12s;
  }
  .wp-disconnect:hover { background: color-mix(in oklab, #f87171 6%, var(--surf)); }

  /* Mobile: collapse to identity-only pill — matches WalletNav. */
  @media (max-width: 768px) {
    .wp-balance, .wp-net-lbl { display: none; }
    .wp-net { padding: 0 9px; }
    .wp-identity { padding: 0 11px; }
  }
  /* iPhone-class: hide the address text so the pill collapses to just the
     net-dot + avatar; the dropdown still shows the full address. Keeps
     the overlay nav from exceeding 375px when a viewer chip is also
     present alongside it. */
  @media (max-width: 420px) {
    .wp-addr, .wp-caret { display: none; }
    .wp-identity { padding: 0 9px; gap: 0; }
  }
`;

function truncate(pk: PublicKey): string {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export default function WalletPill() {
  const { connected, publicKey, disconnect, wallet, connect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const { sol: solBal, usdc: usdcBal } = useWalletBalances();
  // Phantom Connect deeplink session — viewer connected via the encrypted
  // mobile path won't have a wallet-adapter publicKey but they DO have a
  // session pubkey. Treat that as connected.
  const pcSession = useStoredPhantomConnectSession();
  const effectivePublicKey = publicKey ?? (pcSession ? new PublicKey(pcSession.walletPublicKey) : null);
  const isConnected = connected || !!pcSession;

  const [dropOpen, setDropOpen] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; right: number }>({ top: 56, right: 12 });
  // Defer needsMobileHandoff() check to after mount — see WalletNav.
  const [useDeeplink, setUseDeeplink] = useState(false);
  useEffect(() => { setUseDeeplink(needsMobileHandoff()); }, []);
  const rowRef = useRef<HTMLDivElement>(null);

  // Wallet Standard auto-registers Phantom into `wallet` on page load. Only
  // call connect() in response to a user click — never silently.
  const userInitiatedConnect = useRef(false);
  useEffect(() => {
    if (wallet && !connected && !connecting && userInitiatedConnect.current) {
      userInitiatedConnect.current = false;
      connect().catch(() => {});
    }
  }, [wallet, connected, connecting, connect]);

  const openWalletModal = () => {
    userInitiatedConnect.current = true;
    if (wallet) connect().catch(() => {});
    else setVisible(true);
  };

  const openDrop = () => {
    if (rowRef.current) {
      const rect = rowRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setDropOpen(o => !o);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDisconnect = () => {
    disconnect().catch(() => {});
    // Also clear any Phantom Connect deeplink session — without this the
    // pill would re-render as "connected" via the session right after the
    // user disconnected.
    clearPhantomConnectSession();
    setDropOpen(false);
  };

  /* ── Disconnected ── */
  if (!isConnected || !effectivePublicKey) {
    // See WalletNav for rationale. Mobile-not-in-wallet-browser users get a
    // small picker of .wp-connect anchors, one per supported deeplink wallet.
    if (useDeeplink && typeof window !== 'undefined') {
      return (
        <>
          <style>{CSS}</style>
          <MobileWalletPicker anchorClassName="wp-connect" />
        </>
      );
    }

    return (
      <>
        <style>{CSS}</style>
        <button className="wp-connect" onClick={openWalletModal} disabled={connecting}>
          <SolanaIcon size={12} />
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
      </>
    );
  }

  /* ── Connected ── */
  const solStr = solBal !== null ? solBal.toFixed(3) : null;
  const usdcStr = usdcBal !== null ? usdcBal.toFixed(2) : null;
  const walletIcon = wallet?.adapter?.icon ?? null;
  const walletName = wallet?.adapter?.name ?? 'Wallet';

  return (
    <>
      <style>{CSS}</style>
      <div className={`wp-row${dropOpen ? ' open' : ''}`} ref={rowRef}>

        <div className="wp-net">
          <span className="wp-net-dot" />
          <span className="wp-net-lbl">{NETWORK_LABEL}</span>
        </div>

        <div className="wp-balance">
          <span className="wp-usdc">
            <UsdcIcon size={13} className="wp-usdc-sym" />
            {usdcStr ?? <span className="wp-loading">…</span>}
            <span className="wp-usdc-unit">USDC</span>
          </span>
          <span className="wp-bal-sep" />
          <span className="wp-sol">
            <SolanaIcon size={11} className="wp-sol-sym" />
            {solStr ?? <span className="wp-loading">…</span>}
          </span>
        </div>

        <button
          className="wp-identity"
          onClick={openDrop}
          aria-expanded={dropOpen}
          aria-label="Wallet menu"
        >
          {walletIcon ? (
            // wallet-adapter ships icons as data URLs — using the literal
            // string keeps Next.js's Image optimizer out of the way.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="wp-avatar-img" src={walletIcon} alt={`${walletName} icon`} />
          ) : (
            <span className="wp-avatar-fallback" />
          )}
          <span className="wp-addr">{truncate(effectivePublicKey)}</span>
          <span className={`wp-caret${dropOpen ? ' open' : ''}`}>▾</span>
        </button>

        {dropOpen ? (
          <div className="wp-drop" style={{ top: dropPos.top, right: dropPos.right }}>
            <div className="wp-drop-head">
              <div className="wp-drop-id">
                {walletIcon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="wp-drop-id-img" src={walletIcon} alt={`${walletName} icon`} />
                ) : (
                  <span className="wp-drop-id-fallback" />
                )}
                <div className="wp-drop-name">{walletName}</div>
              </div>
              <div className="wp-drop-addr">{effectivePublicKey.toBase58()}</div>
            </div>
            <div className="wp-drop-row">
              <span className="wp-drop-lbl">USDC</span>
              <span className="wp-drop-val" style={{ color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <UsdcIcon size={12} />
                {usdcStr ?? '…'}
              </span>
            </div>
            <div className="wp-drop-row">
              <span className="wp-drop-lbl">SOL</span>
              <span className="wp-drop-val" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <SolanaIcon size={10} />
                {solStr ?? '…'}
              </span>
            </div>
            <button className="wp-disconnect" onClick={handleDisconnect}>
              ✕ Disconnect
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
