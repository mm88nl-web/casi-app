'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import SettingsSection from './SettingsSection';
import DelegateKeyCard from '@/app/studio/_components/DelegateKeyCard';
import { WALLET_ADAPTER_CLUSTER } from '@/lib/solana-network';

type Props = {
  supabase: SupabaseClient;
  /** Saved Solana wallet from profiles.solana_wallet — used to gate
   *  walletReady (the connected wallet must match the saved address). */
  savedSolanaWallet: string | null;
};

export default function SessionKeySection({ supabase, savedSolanaWallet }: Props) {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const connectedAddr = publicKey?.toBase58() ?? null;
  const walletReady =
    !!publicKey
    && !!signTransaction
    && !!savedSolanaWallet
    && connectedAddr === savedSolanaWallet;

  const onInstalled = async (sessionPubkey: string, expiresAt: number) => {
    if (!publicKey || !signTransaction) {
      throw new Error('Connect your streamer wallet to finalize the session key');
    }
    if (savedSolanaWallet && connectedAddr !== savedSolanaWallet) {
      throw new Error('Connected wallet is not the streamer wallet on file');
    }

    // Build the AnchorWallet shim the CasiEscrowClient needs. Same shape as
    // admin/page.tsx::buildAnchorWalletForEscrow — kept inline here so the
    // settings card stays self-contained.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anchorWallet: any = {
      publicKey,
      signTransaction,
      signAllTransactions:
        signAllTransactions ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (async (txs: any[]) => {
          const out = [];
          for (const tx of txs) out.push(await signTransaction(tx));
          return out;
        }),
    };

    const { CasiEscrowClient } = await import('@/lib/casi-escrow');
    const { PublicKey } = await import('@solana/web3.js');
    const client = new CasiEscrowClient(connection, anchorWallet, WALLET_ADAPTER_CLUSTER);
    const { solscanUrl } = await client.setDelegate({
      sessionKey: new PublicKey(sessionPubkey),
      expiresAt,
    });
    return { solscanUrl };
  };

  return (
    <SettingsSection
      id="session-key"
      title="Session key"
      desc={
        <>
          Turn this on and approving a booking takes one tap. No wallet popup every time.
          <br /><br />
          <b>How it works.</b> You sign one quick transaction now. After that, CASI can approve
          and end beams on your behalf, but <i>only</i> those two things. It can&apos;t move your
          money, can&apos;t change your settings, can&apos;t do anything else. Flip it off any time.
          <br /><br />
          <b>Who pays the fees?</b> CASI does. Every Solana action has a tiny fee — we cover it,
          not you. If we ever can&apos;t, the wallet popups come back on their own. Nothing gets
          stuck either way.
        </>
      }
    >
      <DelegateKeyCard
        supabase={supabase}
        walletReady={walletReady}
        onInstalled={onInstalled}
      />
    </SettingsSection>
  );
}
