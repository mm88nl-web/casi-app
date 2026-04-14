'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

const CSS = `
  .wc-loading {
    font-family: 'DM Mono', monospace;
    font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
    color: #52525b;
  }

  .wc-connected { display: flex; align-items: center; gap: 10px; }

  .wc-addr-wrap {
    display: flex; flex-direction: column; align-items: flex-end;
    font-family: 'DM Mono', monospace;
  }
  .wc-addr-primary {
    font-size: 12px; letter-spacing: 0.5px; color: #e4e4e7;
  }
  .wc-addr-solana {
    font-size: 10px; letter-spacing: 0.5px; color: #52525b; margin-top: 1px;
  }

  .wc-disconnect {
    background: rgba(239,68,68,0.07);
    border: 1px solid rgba(239,68,68,0.2);
    color: #f87171;
    font-family: 'DM Mono', monospace;
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    padding: 6px 12px; border-radius: 6px; cursor: pointer;
    transition: background .15s, border-color .15s;
    white-space: nowrap;
  }
  .wc-disconnect:hover {
    background: rgba(239,68,68,0.13);
    border-color: rgba(239,68,68,0.38);
  }

  .wc-btns { display: flex; align-items: center; gap: 8px; }

  .wc-btn {
    font-family: 'DM Mono', monospace;
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    padding: 7px 14px; border-radius: 6px; cursor: pointer;
    transition: border-color .15s, color .15s, box-shadow .15s;
    white-space: nowrap;
  }
  .wc-btn-web3 {
    background: #18181b;
    border: 1px solid #3f3f46;
    color: #a1a1aa;
  }
  .wc-btn-web3:hover { border-color: #71717a; color: #e4e4e7; }

  .wc-btn-solana {
    background: #18181b;
    border: 1px solid rgba(153,69,255,0.35);
    color: #9945FF;
  }
  .wc-btn-solana:hover {
    border-color: rgba(153,69,255,0.65);
    box-shadow: 0 0 14px rgba(153,69,255,0.18);
  }
`;

export function WalletConnect() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  return (
    <>
      <style>{CSS}</style>

      {!ready ? (
        <span className="wc-loading">…</span>

      ) : authenticated && connected ? (
        <div className="wc-connected">
          <div className="wc-addr-wrap">
            {user?.wallet?.address && (
              <span className="wc-addr-primary">
                {user.wallet.address.slice(0, 6)}…{user.wallet.address.slice(-4)}
              </span>
            )}
            {publicKey && (
              <span className="wc-addr-solana">
                ◎ {publicKey.toString().slice(0, 4)}…{publicKey.toString().slice(-4)}
              </span>
            )}
          </div>
          <button
            className="wc-disconnect"
            onClick={() => { logout(); disconnect(); }}
          >
            Disconnect
          </button>
        </div>

      ) : (
        <div className="wc-btns">
          <button className="wc-btn wc-btn-web3" onClick={login}>
            Connect
          </button>
          <button className="wc-btn wc-btn-solana" onClick={() => setVisible(true)}>
            Wallet
          </button>
        </div>
      )}
    </>
  );
}
