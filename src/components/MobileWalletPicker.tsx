'use client';

import {
  buildConnectUrl,
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
export default function MobileWalletPicker({ anchorClassName }: { anchorClassName: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
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
