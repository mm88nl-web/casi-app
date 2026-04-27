'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { NETWORK_LABEL } from '@/lib/solana-network';
import { useWalletBalances } from '@/lib/wallet-balances';
import { needsMobileHandoff, phantomBrowseUrl, solflareBrowseUrl } from '@/lib/mobile-wallet';

/**
 * Official Solana mark — three diagonal parallel bars with the brand
 * purple→cyan→green gradient. Used in both the disconnected "Connect
 * Wallet" CTA and the connected pill's network segment.
 */
function SolanaMark({ size = 14 }: { size?: number }) {
  const id = `solana-mark-grad-${size}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size * (101 / 397)}
      viewBox="0 0 397 101"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#9945FF" />
          <stop offset="50%" stopColor="#14F195" />
          <stop offset="100%" stopColor="#9945FF" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        d="M64.6 6.5h324.7c4.7 0 7.1 5.7 3.7 9.1L348.7 60.1c-1.6 1.6-3.7 2.5-6 2.5H18.1c-4.7 0-7.1-5.7-3.7-9.1L58.6 9c1.6-1.6 3.7-2.5 6-2.5z"
        transform="translate(0 32)"
      />
      <path
        fill={`url(#${id})`}
        d="M64.6.5h324.7c4.7 0 7.1 5.7 3.7 9.1L348.7 54.1c-1.6 1.6-3.8 2.5-6 2.5H18.1c-4.7 0-7.1-5.7-3.7-9.1L58.6 3c1.6-1.6 3.7-2.5 6-2.5z"
      />
      <path
        fill={`url(#${id})`}
        d="M348.7 41.6c-1.6-1.6-3.8-2.5-6-2.5H18.1c-4.7 0-7.1 5.7-3.7 9.1l44.2 44.2c1.6 1.6 3.7 2.5 6 2.5h324.7c4.7 0 7.1-5.7 3.7-9.1l-44.3-44.2z"
        transform="translate(0 5)"
      />
    </svg>
  );
}

const CSS = `
  .wp-connect {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 9px 16px; border-radius: 9px;
    font-family: var(--font-casi-mono), monospace;
    font-size: 11px; letter-spacing: 0.4px;
    color: #9945FF;
    background: var(--casi-surface-2);
    border: 1px solid rgba(153,69,255,0.22);
    cursor: pointer;
    transition: border-color .18s, box-shadow .18s;
    white-space: nowrap;
  }
  .wp-connect:hover {
    border-color: rgba(153,69,255,0.5);
    box-shadow: 0 0 12px rgba(153,69,255,0.14);
  }
  .wp-connect:disabled { opacity: 0.6; cursor: not-allowed; }

  .wp-row {
    display: inline-flex; align-items: center; gap: 0;
    background: var(--casi-surface-2);
    border: 1px solid var(--casi-border);
    border-radius: 10px;
    font-family: var(--font-casi-mono), monospace;
    font-size: 11px;
    position: relative;
    transition: border-color .15s;
  }
  .wp-row:hover { border-color: var(--casi-border-2); }

  .wp-net {
    display: flex; align-items: center; gap: 5px;
    padding: 0 11px; height: 36px;
    border-right: 1px solid var(--casi-border);
  }
  .wp-net-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: #14F195;
    flex-shrink: 0;
    box-shadow: 0 0 6px rgba(20,241,149,0.6);
    animation: wp-pulse 2.4s ease-in-out infinite;
  }
  @keyframes wp-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.55; }
  }
  .wp-net-lbl {
    font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
    color: #14F195; opacity: 0.65;
  }

  .wp-balance {
    display: flex; align-items: center; gap: 7px;
    padding: 0 13px; height: 36px;
    border-right: 1px solid var(--casi-border);
  }
  .wp-usdc { font-size: 12px; color: var(--casi-text); letter-spacing: 0.3px; }
  .wp-usdc-sym { color: var(--casi-accent); margin-right: 1px; }
  .wp-usdc-unit { font-size: 9px; opacity: 0.45; margin-left: 3px; }
  .wp-bal-sep { width: 1px; height: 11px; background: var(--casi-border); flex-shrink: 0; }
  .wp-sol { font-size: 10px; color: var(--casi-text-muted); }
  .wp-sol-sym { color: #9945FF; margin-right: 2px; }
  .wp-loading { color: var(--casi-text-faint); }

  .wp-identity {
    display: flex; align-items: center; gap: 8px;
    padding: 0 13px; height: 36px;
    background: none; border: none; cursor: pointer;
    color: inherit; font: inherit;
    border-radius: 0 9px 9px 0;
    transition: background .15s;
  }
  .wp-identity:hover { background: rgba(255,255,255,0.02); }
  .wp-avatar-img {
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
    object-fit: cover; background: var(--casi-bg);
  }
  .wp-avatar-fallback {
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
    background: conic-gradient(from 60deg, var(--casi-accent) 0%, #14F195 40%, #9945FF 70%, var(--casi-accent) 100%);
  }
  .wp-addr { color: var(--casi-text-muted); letter-spacing: 0.4px; }
  .wp-caret { font-size: 8px; opacity: 0.4; margin-left: 1px; transition: transform .18s; }
  .wp-caret.open { transform: rotate(180deg); }

  .wp-drop {
    position: fixed; min-width: 260px;
    background: var(--casi-surface-2);
    border: 1px solid var(--casi-border-2);
    border-radius: 12px; overflow: hidden;
    z-index: 9999;
    box-shadow: 0 16px 48px rgba(0,0,0,0.55);
    animation: wp-drop-in .14s ease;
  }
  @keyframes wp-drop-in { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }

  .wp-drop-head {
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--casi-border);
  }
  .wp-drop-id {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 6px;
  }
  .wp-drop-id-img {
    width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
    object-fit: cover; background: var(--casi-bg);
  }
  .wp-drop-id-fallback {
    width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
    background: conic-gradient(from 60deg, var(--casi-accent) 0%, #14F195 40%, #9945FF 70%, var(--casi-accent) 100%);
  }
  .wp-drop-name {
    font-size: 12px; font-weight: 600;
    color: var(--casi-text);
    font-family: var(--font-casi-sans), sans-serif;
  }
  .wp-drop-addr {
    font-size: 10px; letter-spacing: 0.3px;
    color: var(--casi-text-dim);
    word-break: break-all; line-height: 1.55;
    font-family: var(--font-casi-mono), monospace;
  }
  .wp-drop-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .wp-drop-lbl {
    font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--casi-text-dim);
  }
  .wp-drop-val {
    font-size: 12.5px; font-weight: 500;
    color: var(--casi-text);
    font-family: var(--font-casi-mono), monospace;
  }
  .wp-disconnect {
    display: flex; align-items: center; justify-content: center;
    width: 100%; padding: 11px 16px;
    background: none; border: none; cursor: pointer;
    font-family: var(--font-casi-mono), monospace;
    font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase;
    color: #f87171;
    transition: background .14s;
  }
  .wp-disconnect:hover { background: rgba(248,113,113,0.06); }

  /* Mobile: collapse to identity-only pill — match WalletNav's behaviour */
  @media (max-width: 768px) {
    .wp-balance, .wp-net-lbl { display: none; }
    .wp-net { padding: 0 9px; }
    .wp-identity { padding: 0 11px; }
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

  const [dropOpen, setDropOpen] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; right: number }>({ top: 56, right: 12 });
  const [mobileHandoff, setMobileHandoff] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  // mobileHandoff() touches navigator + window.phantom — defer to client to
  // avoid hydration mismatch.
  useEffect(() => { setMobileHandoff(needsMobileHandoff()); }, []);

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
    setDropOpen(false);
  };

  /* ── Disconnected ── */
  if (!connected || !publicKey) {
    if (mobileHandoff) {
      const here = typeof window !== 'undefined' ? window.location.href : '';
      return (
        <>
          <style>{CSS}</style>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <a className="wp-connect" href={phantomBrowseUrl(here)} style={{ textDecoration: 'none' }}>
              <SolanaMark size={12} />
              Open in Phantom
            </a>
            <a
              href={solflareBrowseUrl(here)}
              style={{
                fontFamily: 'var(--font-casi-mono), monospace',
                fontSize: 9,
                letterSpacing: 1,
                color: 'var(--casi-text-dim)',
                textDecoration: 'none',
              }}
            >
              or open in Solflare →
            </a>
          </div>
        </>
      );
    }

    return (
      <>
        <style>{CSS}</style>
        <button className="wp-connect" onClick={openWalletModal} disabled={connecting}>
          <SolanaMark size={12} />
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
      <div className="wp-row" ref={rowRef}>

        <div className="wp-net">
          <span className="wp-net-dot" />
          <span className="wp-net-lbl">{NETWORK_LABEL}</span>
        </div>

        <div className="wp-balance">
          <span className="wp-usdc">
            <span className="wp-usdc-sym">$</span>
            {usdcStr ?? <span className="wp-loading">…</span>}
            <span className="wp-usdc-unit">USDC</span>
          </span>
          <span className="wp-bal-sep" />
          <span className="wp-sol">
            <span className="wp-sol-sym">◎</span>
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
          <span className="wp-addr">{truncate(publicKey)}</span>
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
              <div className="wp-drop-addr">{publicKey.toBase58()}</div>
            </div>
            <div className="wp-drop-row">
              <span className="wp-drop-lbl">USDC</span>
              <span className="wp-drop-val" style={{ color: 'var(--casi-accent)' }}>
                ${usdcStr ?? '…'}
              </span>
            </div>
            <div className="wp-drop-row">
              <span className="wp-drop-lbl">SOL</span>
              <span className="wp-drop-val">◎ {solStr ?? '…'}</span>
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
