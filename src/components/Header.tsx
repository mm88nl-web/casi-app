'use client';
import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
// NOTE: @privy-io/react-auth must be installed for WalletConnect to work:
//   npm install @privy-io/react-auth
// The balance display below works with Solana Wallet Adapter alone.
import { WalletConnect } from 'bonk-ui-source/templates/components/wallet/components/wallet-connect';

const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14xA64RMBuMBWFnG7u15Wp9xZ2GnN1';

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap');

  .hd {
    position: sticky; top: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    height: 52px; padding: 0 24px;
    background: #18181b;
    border-bottom: 1px solid #27272a;
    gap: 16px;
  }

  /* ── Logo ── */
  .hd-logo {
    display: flex; align-items: center; gap: 8px;
    text-decoration: none; flex-shrink: 0;
  }
  .hd-wordmark {
    font-family: 'Syne', sans-serif;
    font-size: 18px; font-weight: 800; letter-spacing: -1px;
    color: #F58220;
  }

  /* ── Nav links ── */
  .hd-nav {
    display: flex; align-items: center; gap: 24px;
    flex: 1; margin: 0 16px;
  }
  .hd-link {
    font-family: 'DM Mono', monospace;
    font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
    color: #52525b; text-decoration: none; transition: color .15s;
  }
  .hd-link:hover { color: #a1a1aa; }

  /* ── Right cluster ── */
  .hd-right {
    display: flex; align-items: center; gap: 0;
    flex-shrink: 0;
  }

  /* Thin vertical divider */
  .hd-sep {
    width: 1px; height: 20px;
    background: #27272a; flex-shrink: 0;
  }

  /* ── Devnet indicator ── */
  .hd-devnet {
    display: flex; align-items: center; gap: 6px;
    padding: 0 14px;
  }
  .hd-devnet-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #16a34a;
    box-shadow: 0 0 5px rgba(22,163,74,0.55);
    animation: hd-pulse 2s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes hd-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 5px rgba(22,163,74,0.55); }
    50%       { opacity: 0.35; box-shadow: 0 0 2px rgba(22,163,74,0.2); }
  }
  .hd-devnet-label {
    font-family: 'DM Mono', monospace;
    font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
    color: #16a34a; opacity: 0.85;
  }

  /* ── Balance display ── */
  .hd-bals {
    display: flex; align-items: center; gap: 0;
    padding: 0 4px;
  }
  .hd-bal {
    display: flex; flex-direction: column; align-items: flex-end;
    padding: 4px 12px;
  }
  .hd-bal-label {
    font-family: 'DM Mono', monospace;
    font-size: 8px; letter-spacing: 1.5px; text-transform: uppercase;
    color: #3f3f46; line-height: 1; margin-bottom: 2px;
  }
  .hd-bal-value {
    font-family: 'DM Mono', monospace;
    font-size: 12px; letter-spacing: 0.5px;
    color: #e4e4e7;
  }
  .hd-bal-sym { color: #71717a; margin-right: 2px; }
  .hd-bal-loading { color: #3f3f46; }

  /* ── Wallet connect wrapper ── */
  .hd-wallet { padding: 0 8px 0 14px; }

  /* ── Mobile ── */
  @media (max-width: 640px) {
    .hd { padding: 0 16px; height: 48px; }
    .hd-nav { display: none; }
    .hd-devnet-label { display: none; }
    .hd-bal-label { display: none; }
    .hd-bal { padding: 4px 8px; }
  }
`;

function Logo({ scale = 0.18 }: { scale?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width={400 * scale} height={200 * scale}>
      <g stroke="#F58220" fill="#F58220" strokeWidth="16" strokeLinecap="round">
        <line x1="50" y1="60" x2="350" y2="60" />
        <line x1="20" y1="100" x2="380" y2="100" />
        <line x1="50" y1="140" x2="350" y2="140" />
      </g>
      <path fill="#F58220" stroke="none" d="M 90,100 C 130,30 270,30 310,100 C 270,170 130,170 90,100 Z" />
      <circle fill="#18181b" cx="200" cy="100" r="45" />
    </svg>
  );
}

export default function Header() {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();

  const [solBal, setSolBal]   = useState<number | null>(null);
  const [usdcBal, setUsdcBal] = useState<number | null>(null);

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

  const solStr  = solBal  !== null ? solBal.toFixed(3)  : null;
  const usdcStr = usdcBal !== null ? usdcBal.toFixed(2) : null;

  return (
    <>
      <style>{CSS}</style>
      <header className="hd">

        {/* Logo */}
        <a href="/" className="hd-logo">
          <Logo />
          <span className="hd-wordmark">casi</span>
        </a>

        {/* Nav */}
        <nav className="hd-nav">
          <a href="/" className="hd-link">Home</a>
          <a href="/admin" className="hd-link">Studio</a>
        </nav>

        {/* Right cluster */}
        <div className="hd-right">

          {/* Devnet dot */}
          <div className="hd-devnet">
            <span className="hd-devnet-dot" />
            <span className="hd-devnet-label">Devnet</span>
          </div>

          {/* Balances — only shown when Solana wallet connected */}
          {connected && publicKey && (
            <>
              <div className="hd-sep" />
              <div className="hd-bals">
                <div className="hd-bal">
                  <span className="hd-bal-label">SOL</span>
                  <span className="hd-bal-value">
                    <span className="hd-bal-sym">◎</span>
                    {solStr ?? <span className="hd-bal-loading">…</span>}
                  </span>
                </div>
                <div className="hd-sep" />
                <div className="hd-bal">
                  <span className="hd-bal-label">USDC</span>
                  <span className="hd-bal-value">
                    <span className="hd-bal-sym">$</span>
                    {usdcStr ?? <span className="hd-bal-loading">…</span>}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="hd-sep" />

          {/* Wallet connect button from bonk-ui-source */}
          <div className="hd-wallet">
            <WalletConnect />
          </div>

        </div>
      </header>
    </>
  );
}
