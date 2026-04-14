'use client';
import { useState, useEffect, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';

const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

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
    position: absolute; top: calc(100% + 6px); right: 0; min-width: 240px;
    background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 12px;
    overflow: hidden; z-index: 500;
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
`;

function truncate(pk: PublicKey): string {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export default function WalletNav() {
  const { connected, publicKey, disconnect } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const [solBal, setSolBal]   = useState<number | null>(null);
  const [usdcBal, setUsdcBal] = useState<number | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Fetch balances whenever wallet connects / pubkey changes
  useEffect(() => {
    if (!connected || !publicKey) { setSolBal(null); setUsdcBal(null); return; }
    let cancelled = false;

    const fetchBalances = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        if (!cancelled) setSolBal(lamports / 1e9);
      } catch { /* ignore */ }

      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          mint: new PublicKey(USDC_DEVNET_MINT),
        });
        const amount = tokenAccounts.value[0]
          ?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
        if (!cancelled) setUsdcBal(amount);
      } catch { if (!cancelled) setUsdcBal(0); }
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [connected, publicKey, connection]);

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

  /* ── Disconnected ── */
  if (!connected || !publicKey) {
    return (
      <>
        <style>{CSS}</style>
        <button className="wn-connect" onClick={() => setVisible(true)}>
          <span className="wn-connect-icon" />
          Connect Wallet
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

        {/* Devnet indicator */}
        <div className="wn-devnet">
          <span className="wn-devnet-dot" />
          <span className="wn-devnet-label">Devnet</span>
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
          onClick={() => setDropOpen(o => !o)}
          aria-expanded={dropOpen}
        >
          {truncate(publicKey)}
          <span className={`wn-chevron${dropOpen ? ' open' : ''}`}>▾</span>
        </button>

        {/* Dropdown */}
        {dropOpen && (
          <div className="wn-drop">
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
