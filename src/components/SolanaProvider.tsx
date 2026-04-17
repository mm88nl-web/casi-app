'use client';

import { useMemo, useEffect, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-adapter-mobile';
import '@solana/wallet-adapter-react-ui/styles.css';
import { SOLANA_RPC, WALLET_ADAPTER_CLUSTER } from '@/lib/solana-network';

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
  const endpoint = useMemo(() => SOLANA_RPC, []);

  // Only SolanaMobileWalletAdapter — Wallet Standard handles desktop
  // auto-discovery (Phantom, Solflare, etc.) without explicit imports.
  const wallets = useMemo(
    () => [
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: { name: 'Casi', uri: 'https://casi.gg' },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: WALLET_ADAPTER_CLUSTER,
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
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
