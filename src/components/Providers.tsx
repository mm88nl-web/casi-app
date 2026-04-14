'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import SolanaProvider from '@/components/SolanaProvider';
import Header from '@/components/Header';
import type { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#F58220',
        },
        embeddedWallets: {
          solana: { createOnLogin: 'users-without-wallets' },
        },
      }}
    >
      <SolanaProvider>
        <Header />
        {children}
      </SolanaProvider>
    </PrivyProvider>
  );
}
