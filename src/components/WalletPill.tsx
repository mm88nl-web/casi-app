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
  .wp-usdc { font-size: 11px; color: var(--text); font-weight: 500; letter-spacing: 0.01em; font-variant-numeric: tabular-nums; }
  .wp-usdc-sym { color: var(--ink); margin-right: 2px; font-weight: 700; }
  .wp-usdc-unit { font-size: 9px; color: var(--text-4); letter-spacing: 0.12em; text-transform: uppercase; margin-left: 4px; }
  .wp-bal-sep { width: 1px; height: 14px; background: var(--line); align-self: center; flex-shrink: 0; }
  .wp-sol { font-size: 10.5px; color: var(--text-3); font-variant-numeric: tabular-nums; }
  .wp-sol-sym { color: #9945FF; margin-right: 2px; font-weight: 700; }
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
      <div className={`wp-row${dropOpen ? ' open' : ''}`} ref={rowRef}>

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
