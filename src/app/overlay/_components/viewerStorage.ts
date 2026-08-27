// Per-viewer storage helpers. Viewers are anonymous, so we use localStorage
// for:
//   - their chosen display name (VIEWER_NAME_KEY)
//   - per-booking cancel_tokens (BOOKING_TOKENS_KEY) — the only credential
//     that proves they own a pending booking to /api/stripe/cancel and
//     /api/bookings/viewer-deny. viewer_name is publicly readable, so it
//     cannot be used for auth.
//   - per-flash viewer_tokens (FLASH_TOKENS_KEY) — same idea as
//     BOOKING_TOKENS_KEY, but for /api/flashes/my-status. flashes never had
//     a cancel_token-equivalent until 20260827000000_flashes_viewer_token.sql
//     added one specifically to back this.
//
// Both token maps also back /api/bookings/my-status and
// /api/flashes/my-status — the "is this row mine" read path, not just the
// mutating routes above. anon RLS no longer exposes pending/denied/
// cancelled rows broadly (see 20260827010000_narrow_anon_select_policies.sql),
// so a viewer's own non-public-status rows are only reachable by presenting
// the token minted for them at creation time.

export const VIEWER_NAME_KEY = 'casi_viewer_name';
export const BOOKING_TOKENS_KEY = 'casi_booking_tokens';
export const FLASH_TOKENS_KEY = 'casi_flash_tokens';

function readTokenMap(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function rememberToken(key: string, id: string, token: string) {
  try {
    const map = readTokenMap(key);
    map[id] = token;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}
}

function forgetToken(key: string, id: string) {
  try {
    const map = readTokenMap(key);
    delete map[id];
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}
}

export function readBookingTokens(): Record<string, string> {
  return readTokenMap(BOOKING_TOKENS_KEY);
}

export function rememberBookingToken(bookingId: string, token: string) {
  rememberToken(BOOKING_TOKENS_KEY, bookingId, token);
}

export function forgetBookingToken(bookingId: string) {
  forgetToken(BOOKING_TOKENS_KEY, bookingId);
}

export function readFlashTokens(): Record<string, string> {
  return readTokenMap(FLASH_TOKENS_KEY);
}

export function rememberFlashToken(flashId: string, token: string) {
  rememberToken(FLASH_TOKENS_KEY, flashId, token);
}

export function forgetFlashToken(flashId: string) {
  forgetToken(FLASH_TOKENS_KEY, flashId);
}

const ADJECTIVES = ['Cool','Fast','Bold','Wild','Epic','Slick','Dark','Neon','Hyper','Ultra','Turbo','Mega','Swift','Storm','Blaze'];
const ANIMALS    = ['Tiger','Panda','Fox','Wolf','Hawk','Bear','Shark','Eagle','Viper','Lynx','Raven','Cobra','Falcon','Bison','Orca'];

export function generateRandomName(): string {
  const adj    = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj}${animal}${Math.floor(Math.random() * 99) + 1}`;
}
