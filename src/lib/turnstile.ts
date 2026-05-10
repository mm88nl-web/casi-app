/**
 * Cloudflare Turnstile server-side verification.
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * Env:
 *   TURNSTILE_SECRET_KEY              — server secret
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY    — client widget site key
 *
 * If TURNSTILE_SECRET_KEY is unset, verification is SKIPPED (dev mode) and
 * we log a warning once. This lets local dev work without a CF account but
 * forces prod to set the key or every free-tier request fails closed.
 */

const VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

let skipWarningShown = false;

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (!skipWarningShown) {
      console.warn('[turnstile] TURNSTILE_SECRET_KEY not set — verification skipped (dev mode)');
      skipWarningShown = true;
    }
    return { ok: true };
  }

  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'Missing captcha token' };
  }

  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);

  try {
    const res = await fetch(VERIFY_ENDPOINT, { method: 'POST', body });
    const json = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
    if (!json.success) {
      return {
        ok: false,
        reason: `Captcha failed (${(json['error-codes'] || []).join(',') || 'unknown'})`,
      };
    }
    return { ok: true };
  } catch (err) {
    console.error('[turnstile] verify call failed:', err);
    return { ok: false, reason: 'Captcha service unreachable' };
  }
}
