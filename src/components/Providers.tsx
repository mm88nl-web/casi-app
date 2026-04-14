'use client';

import SolanaProvider from '@/components/SolanaProvider';
import type { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return <SolanaProvider>{children}</SolanaProvider>;
}
