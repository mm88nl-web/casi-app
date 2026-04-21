// Banner-slot constants shared between the viewer booking form (enforces
// the cap while typing) and the /api/bookings/create-* server routes
// (enforces the cap again server-side on insert — client caps are just a
// hint, the tamper-proof one is here).
//
// Chosen so a typical banner strip at 20s marquee duration reads at a
// comfortable pace (~12 chars/sec). Longer messages scroll faster because
// they loop at the same 20s; bump the animation duration in
// overlay/page.tsx::beamMarquee if that ever feels too fast.

export const BANNER_MAX_MESSAGE = 160;

/**
 * Server-side gate for banner bookings. Called from every /api/bookings/create-*
 * route after the slot's shape has been read from overlay_elements. The client
 * form also enforces these, but the client is untrusted — this is the one
 * that actually decides whether a row lands in the bookings table.
 *
 * Non-banner slots short-circuit to ok:true without inspecting `message`.
 */
export function validateBannerBooking(
  shape: string | null | undefined,
  message: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (shape !== 'banner') return { ok: true };
  const msg = (message ?? '').trim();
  if (msg.length === 0) {
    return { ok: false, error: 'Banner slots need a message — it scrolls across the banner on stream.' };
  }
  if (msg.length > BANNER_MAX_MESSAGE) {
    return { ok: false, error: `Message too long — max ${BANNER_MAX_MESSAGE} characters.` };
  }
  return { ok: true };
}
