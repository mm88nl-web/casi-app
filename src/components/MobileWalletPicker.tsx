'use client';

import { useMemo } from 'react';
import {
  buildConnectUrl,
  regenerateDappKeypair,
  setPreferredDeeplinkWallet,
  DEEPLINK_WALLETS,
  type DeeplinkWallet,
} from '@/lib/phantom-connect';
import { WALLET_ADAPTER_CLUSTER } from '@/lib/solana-network';
import SolanaIcon from './icons/SolanaIcon';

/** Build the connect deeplink for a given wallet, with a return marker that
 *  tells the overlay return handler which wallet's response to parse
 *  (`casi_wallet`). Rendered inside an `<a href>` so the OS treats the tap as
 *  a real user gesture — Android Chrome won't open a wallet app from a
 *  JS-driven navigation that's lost the gesture context. */
function connectUrlFor(wallet: DeeplinkWallet): string {
  const sep = window.location.search ? '&' : '?';
  const here =
    window.location.origin +
    window.location.pathname +
    window.location.search +
    `${sep}phantom_action=connect-resume&casi_wallet=${wallet}`;
  return buildConnectUrl({ wallet, cluster: WALLET_ADAPTER_CLUSTER, redirectTo: here });
}

/**
 * Mobile (non-in-app-browser) wallet connect picker. Replaces the old
 * single hardcoded-Phantom anchor with one anchor per supported deeplink
 * wallet (Phantom, Solflare). Each surface passes its own button class so the
 * picker matches that surface's styling.
 *
 * On tap we remember the chosen wallet so a later cold booking (book before
 * connecting) hands off to the same wallet; the connect itself is fully
 * determined by the href + `casi_wallet` marker regardless.
 */
export default function MobileWalletPicker({
  anchorClassName,
  stacked = false,
}: {
  anchorClassName: string;
  /** Lay wallets out as full-width stacked rows (for a dropdown/modal
   *  panel) instead of the default inline-wrapped pill row. */
  stacked?: boolean;
}) {
  // This panel mounts fresh each time the "Connect Wallet" dropdown opens
  // (see WalletPill/WalletNav: rendered conditionally on pickerOpen, not
  // kept mounted) — so a regenerate here happens exactly once per real
  // connect attempt. useMemo (not a plain call in the body) keeps it from
  // re-firing on incidental re-renders while the panel stays open, which
  // would otherwise silently invalidate a keypair a still-visible button's
  // href already embeds. Solflare's own docs recommend a new dapp keypair
  // per connect session; this codebase used to reuse one forever. See
  // regenerateDappKeypair's doc comment in phantom-connect.ts.
  useMemo(() => { regenerateDappKeypair(); }, []);
  return (
    // data-paper="light" + the --ink/--paper shadow pin this to Casi's
    // fixed chrome palette — the wallet/balance pill is chrome everywhere
    // it's mounted (nav, /overlay, /studio/settings), never the active
    // streamer skin. Mirrors WalletPill.tsx's own connected/disconnected
    // states; see the --chrome-* comment in globals.css for the mechanism.
    <span
      data-paper="light"
      style={{
        display: stacked ? 'flex' : 'inline-flex',
        flexDirection: stacked ? 'column' : 'row',
        gap: stacked ? 0 : 6,
        flexWrap: stacked ? 'nowrap' : 'wrap',
        ['--ink' as string]: 'var(--chrome-ink)',
        ['--paper' as string]: 'var(--chrome-paper)',
      }}>
      {DEEPLINK_WALLETS.map(({ wallet, label }) => (
        <a
          key={wallet}
          href={connectUrlFor(wallet)}
          className={anchorClassName}
          style={{ textDecoration: 'none' }}
          onClick={() => setPreferredDeeplinkWallet(wallet)}
        >
          <SolanaIcon size={12} />
          {label}
        </a>
      ))}
    </span>
  );
}
