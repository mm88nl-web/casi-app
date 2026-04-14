'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';

const CSS = `
  .wc-connect {
    display: inline-flex; align-items: center; gap: 8px;
    background: #18181b; border: 1px solid rgba(153,69,255,0.35);
    border-radius: 8px; padding: 7px 14px;
    font-family: 'DM Mono', monospace; font-size: 10px;
    letter-spacing: 1px; text-transform: uppercase;
    color: #9945FF; cursor: pointer;
    transition: border-color .15s, box-shadow .15s;
    white-space: nowrap;
  }
  .wc-connect:hover {
    border-color: rgba(153,69,255,0.65);
    box-shadow: 0 0 14px rgba(153,69,255,0.18);
  }
  .wc-connect-icon {
    width: 12px; height: 12px; border-radius: 50%;
    background: conic-gradient(from 180deg, #9945FF 0%, #14F195 50%, #9945FF 100%);
    flex-shrink: 0;
  }

  .wc-connected { display: flex; align-items: center; gap: 10px; }
  .wc-addr {
    font-family: 'DM Mono', monospace; font-size: 12px;
    letter-spacing: 0.5px; color: #e4e4e7;
  }
  .wc-disconnect {
    background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.2);
    color: #f87171; font-family: 'DM Mono', monospace;
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    padding: 6px 12px; border-radius: 6px; cursor: pointer;
    transition: background .15s, border-color .15s;
  }
  .wc-disconnect:hover {
    background: rgba(239,68,68,0.13); border-color: rgba(239,68,68,0.38);
  }
`;

function truncate(pk: PublicKey) {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function WalletConnect() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  return (
    <>
      <style>{CSS}</style>
      {connected && publicKey ? (
        <div className="wc-connected">
          <span className="wc-addr">{truncate(publicKey)}</span>
          <button className="wc-disconnect" onClick={() => disconnect()}>
            Disconnect
          </button>
        </div>
      ) : (
        <button className="wc-connect" onClick={() => setVisible(true)}>
          <span className="wc-connect-icon" />
          Connect Wallet
        </button>
      )}
    </>
  );
}
