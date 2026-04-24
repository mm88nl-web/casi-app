'use client';

import SolanaProvider from '@/components/SolanaProvider';
import { UserSkinProvider } from '@/components/UserSkinProvider';
import type { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <UserSkinProvider>
      <SolanaProvider>{children}</SolanaProvider>
    </UserSkinProvider>
  );
}
