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
 * Shape presets surfaced in the admin slot editor. Kept in one place so the
 * inline BeamCtrlPanel and the full SlotInfoPanel render the exact same
 * pill list — if a preset is added here, it shows up in both surfaces.
 */
export const SHAPE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'rect',     label: 'Rectangle' },
  { id: 'circle',   label: 'Circle'    },
  { id: 'custom',   label: 'Custom'    },
  { id: 'banner',   label: 'Banner'    },
  { id: 'backdrop', label: 'Backdrop'  },
];

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

/**
 * Server-side validation for a viewer-supplied media URL (image/video).
 *
 * The overlay renders this as <img src> / <video src>; browsers don't execute
 * `javascript:` / `data:` as script through a media `src`, so this isn't an
 * XSS gate — it's defence-in-depth: reject anything that isn't a plain
 * absolute http(s) URL so weird schemes (blob:, data:, file:, javascript:)
 * never land in the DB, mixed-content http is caught, and the door stays shut
 * if a server-side fetch of this URL is ever added (SSRF).
 *
 * Empty / null input is valid (text-only and banner bookings have no media).
 * Throws-free: invalid input returns { ok: false }.
 */
export function validateMediaUrl(
  url: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (url == null) return { ok: true, value: null };
  if (typeof url !== 'string') return { ok: false, error: 'Invalid media URL' };
  const trimmed = url.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > 2048) return { ok: false, error: 'Media URL is too long' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Media URL must be an absolute http(s) URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Media URL must use http or https' };
  }
  return { ok: true, value: trimmed };
}

// Per-booking customization clamps — kept in one place so the three
// /api/bookings/create-* routes can't drift, and the same bounds match
// the DB check constraints in 20260430000000_booking_customization.sql.
// Defaults (BANNER_DEFAULT_*, MEDIA_DEFAULT_*) describe what the render
// path falls back to when the booking row's column is null.
export const BANNER_FONT_PX_RANGE   = { min: 16, max: 96, default: 28 } as const;
export const BANNER_SPEED_SECS_RANGE = { min: 5,  max: 60, default: 20 } as const;
export const MEDIA_OFFSET_RANGE     = { min: 0,  max: 100, default: 50 } as const;
export const MEDIA_ZOOM_RANGE       = { min: 1,  max: 4,   default: 1  } as const;

function clampOrNull(v: unknown, lo: number, hi: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

export type BookingCustomization = {
  banner_font_px: number | null;
  banner_speed_secs: number | null;
  media_offset_x: number | null;
  media_offset_y: number | null;
  media_zoom: number | null;
};

/**
 * Clamp + normalize the five customization fields off a request body.
 * Returns nulls for fields the client didn't send (so the DB falls back
 * to defaults at render time). Banner fields only matter for banner slots
 * but we don't gate on shape here — the render path already ignores them
 * for non-banner shapes.
 */
export function sanitizeBookingCustomization(body: Record<string, unknown>): BookingCustomization {
  const fontRaw  = body.banner_font_px;
  const speedRaw = body.banner_speed_secs;
  const offXRaw  = body.media_offset_x;
  const offYRaw  = body.media_offset_y;
  const zoomRaw  = body.media_zoom;
  return {
    banner_font_px:    fontRaw  == null ? null : clampOrNull(fontRaw,  BANNER_FONT_PX_RANGE.min,    BANNER_FONT_PX_RANGE.max),
    banner_speed_secs: speedRaw == null ? null : clampOrNull(speedRaw, BANNER_SPEED_SECS_RANGE.min, BANNER_SPEED_SECS_RANGE.max),
    media_offset_x:    offXRaw  == null ? null : clampOrNull(offXRaw,  MEDIA_OFFSET_RANGE.min,      MEDIA_OFFSET_RANGE.max),
    media_offset_y:    offYRaw  == null ? null : clampOrNull(offYRaw,  MEDIA_OFFSET_RANGE.min,      MEDIA_OFFSET_RANGE.max),
    media_zoom:        zoomRaw  == null ? null : clampOrNull(zoomRaw,  MEDIA_ZOOM_RANGE.min,        MEDIA_ZOOM_RANGE.max),
  };
}
