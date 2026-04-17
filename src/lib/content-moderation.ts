/**
 * Server-side text moderation.
 *
 * Uses `obscenity` with the default English matcher list. Returns a result
 * object so callers can decide whether to reject outright or soft-censor.
 * All checks are deterministic and run in-process — no external API calls.
 */
import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export type ModerationResult =
  | { ok: true }
  | { ok: false; reason: string };

const MAX_VIEWER_NAME = 32;
const MAX_FLASH_MESSAGE = 240;
const MAX_BOOKING_MESSAGE = 240;

function isTooLong(text: string, max: number): boolean {
  return text.length > max;
}

/**
 * Checks a short user-supplied string (viewer name, short message) for
 * profanity, slurs, and obvious spam patterns. Rejects if any match.
 */
export function moderateText(text: string, kind: 'viewer_name' | 'message'): ModerationResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'Empty text not allowed' };

  if (kind === 'viewer_name' && isTooLong(trimmed, MAX_VIEWER_NAME)) {
    return { ok: false, reason: `Name too long (max ${MAX_VIEWER_NAME} chars)` };
  }
  if (kind === 'message' && isTooLong(trimmed, MAX_FLASH_MESSAGE)) {
    return { ok: false, reason: `Message too long (max ${MAX_FLASH_MESSAGE} chars)` };
  }

  if (matcher.hasMatch(trimmed)) {
    return { ok: false, reason: 'Text contains disallowed language. Please rephrase.' };
  }

  return { ok: true };
}

export const LIMITS = {
  viewerName: MAX_VIEWER_NAME,
  flashMessage: MAX_FLASH_MESSAGE,
  bookingMessage: MAX_BOOKING_MESSAGE,
} as const;
