'use client';

// Mobile-browser wallet handoff.
//
// Why this file exists: wallet-adapter on mobile tries to deeplink between
// the mobile browser (Chrome/Safari) and the wallet app (Phantom, Solflare)
// for both connect AND sign. Connect mostly works (one-shot handshake).
// Sign frequently doesn't — on the return leg from the wallet app back to
// the browser, the signed transaction gets lost or arrives without the
// viewer's signature. The dApp then submits an unsigned tx and Solana
// rejects it with "Missing signature for public key [<viewer>]", which
// looks like a chain or balance error but is really a mobile-handshake bug.
//
// The reliable workaround is to open the dApp INSIDE the wallet's own
// in-app browser (Phantom's "Browse" tab, Solflare's equivalent). Inside
// that browser the wallet injects `window.phantom.solana` directly, so
// connect/sign become synchronous in-process calls — exactly the same
// code path that works on desktop.
//
// Every mobile wallet ships a "universal link" that opens any URL inside
// their in-app browser. If the wallet isn't installed, the OS falls back
// to the App Store / Play Store listing. This file just wraps those links
// and exports a single `needsMobileHandoff()` gate for UI to key off.

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

// Phantom: https://phantom.app/ul/browse/<target>?ref=<referrer>
// The `ref` is shown as the back-arrow destination in Phantom's browser.
export function phantomBrowseUrl(target: string, ref?: string): string {
  const t = encodeURIComponent(target);
  const r = encodeURIComponent(ref ?? safeOrigin(target));
  return `https://phantom.app/ul/browse/${t}?ref=${r}`;
}

// Solflare: https://solflare.com/ul/v1/browse/<target>?ref=<referrer>
export function solflareBrowseUrl(target: string, ref?: string): string {
  const t = encodeURIComponent(target);
  const r = encodeURIComponent(ref ?? safeOrigin(target));
  return `https://solflare.com/ul/v1/browse/${t}?ref=${r}`;
}

function safeOrigin(href: string): string {
  try { return new URL(href).origin; }
  catch { return href; }
}
