'use client';

import { useMemo, useEffect, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { SolanaMobileWalletAdapter } from '@solana-mobile/wallet-adapter-mobile';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';

/** Logs wallet state changes so you can see exactly where connection stalls. */
function WalletDiagnostic() {
  const { connected, connecting, wallet } = useWallet();
  useEffect(() => {
    console.log('Wallet state:', {
      connected,
      connecting,
      wallet: wallet?.adapter.name ?? null,
    });
  }, [connected, connecting, wallet]);
  return null;
}

export default function SolanaProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => clusterApiUrl('devnet'), []);

  // Only SolanaMobileWalletAdapter — Wallet Standard handles desktop
  // auto-discovery (Phantom, Solflare, etc.) without explicit imports.
  const wallets = useMemo(
    () => [
      new SolanaMobileWalletAdapter({
        appIdentity: { name: 'Casi', uri: 'https://casi.gg' },
      }),
    ],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <WalletDiagnostic />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
