'use client';

// Mobile-browser detection helpers used by the booking flow to decide
// when to route through the Phantom Connect deeplink protocol (see
// `phantom-connect.ts`) instead of the wallet-adapter's in-page sign
// path. The wallet-adapter's mobile deeplink for SIGN frequently returns
// txs missing the partial signature, and Phantom's in-app browser drops
// approval taps silently — the Phantom Connect protocol is reliable
// regardless of either bridge. We use it only on mobile-NOT-in-wallet-
// browser, since desktop and in-app-browser callers can still sign in
// process.

export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

// True when the current page is already running inside a wallet's in-app
// browser. These browsers inject their wallet namespace onto `window`
// eagerly so dApps can detect them synchronously.
export function isInWalletBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    phantom?:  { solana?: unknown };
    solflare?: unknown;
    backpack?: unknown;
  };
  return !!(w.phantom?.solana || w.solflare || w.backpack);
}

// The one gate the UI keys off: we need a handoff only when the user is
// on a phone AND not yet inside a wallet browser. Desktop users and
// in-app-browser users keep the existing flow unchanged.
export function needsMobileHandoff(): boolean {
  return isMobile() && !isInWalletBrowser();
}

