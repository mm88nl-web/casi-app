'use client';

import { useMemo, useEffect, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';
import { SOLANA_RPC } from '@/lib/solana-network';

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

  // Empty wallets array — Wallet Standard auto-discovers every modern Solana
  // wallet (Phantom, Solflare, Backpack, etc.) via window.navigator.wallets
  // without explicit imports. That works on desktop extensions AND inside
  // mobile wallet in-app browsers (which inject their namespace eagerly).
  //
  // We previously also included SolanaMobileWalletAdapter (MWA) to cover the
  // Android Saga-style native handoff path. In practice every CASI mobile
  // user goes through Phantom's in-app browser (see src/lib/mobile-wallet.ts
  // for how we route them there), so MWA was only being listed but not used
  // — and its authorization-token session model was triggering spurious
  // "sign this message" prompts on WebView blur events (picking a file,
  // switching tabs, etc.) that wrecked the viewer upload UX. Removing the
  // adapter keeps the in-app-browser path identical and eliminates those
  // prompts.
  const wallets = useMemo(() => [], []);

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
