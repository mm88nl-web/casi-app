// Per-viewer storage helpers. Viewers are anonymous, so we use localStorage
// for:
//   - their chosen display name (VIEWER_NAME_KEY)
//   - per-booking cancel_tokens (BOOKING_TOKENS_KEY) — the only credential
//     that proves they own a pending booking to /api/stripe/cancel and
//     /api/bookings/viewer-deny. viewer_name is publicly readable, so it
//     cannot be used for auth.

export const VIEWER_NAME_KEY = 'casi_viewer_name';
export const BOOKING_TOKENS_KEY = 'casi_booking_tokens';

export function readBookingTokens(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BOOKING_TOKENS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function rememberBookingToken(bookingId: string, token: string) {
  try {
    const map = readBookingTokens();
    map[bookingId] = token;
    localStorage.setItem(BOOKING_TOKENS_KEY, JSON.stringify(map));
  } catch {}
}

export function forgetBookingToken(bookingId: string) {
  try {
    const map = readBookingTokens();
    delete map[bookingId];
    localStorage.setItem(BOOKING_TOKENS_KEY, JSON.stringify(map));
  } catch {}
}

const ADJECTIVES = ['Cool','Fast','Bold','Wild','Epic','Slick','Dark','Neon','Hyper','Ultra','Turbo','Mega','Swift','Storm','Blaze'];
const ANIMALS    = ['Tiger','Panda','Fox','Wolf','Hawk','Bear','Shark','Eagle','Viper','Lynx','Raven','Cobra','Falcon','Bison','Orca'];

export function generateRandomName(): string {
  const adj    = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj}${animal}${Math.floor(Math.random() * 99) + 1}`;
}
