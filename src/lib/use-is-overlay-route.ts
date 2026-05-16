'use client';

import { usePathname } from 'next/navigation';

// Routes that render as OBS browser sources, not as UI for a human to click
// through. UI chrome (cookie notice, future toasts, support widgets, banners)
// should not render on these — the streamer can't dismiss them without going
// into OBS Interact mode and the copy is meaningless on a stream canvas.
const OVERLAY_PREFIXES = ['/overlay', '/obs'];

export function isOverlayRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return OVERLAY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function useIsOverlayRoute(): boolean {
  return isOverlayRoute(usePathname());
}
