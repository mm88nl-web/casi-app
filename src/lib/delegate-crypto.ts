/**
 * delegate-crypto.ts
 *
 * AES-256-GCM wrapper around the ephemeral session-key secrets stored in
 * `streamer_delegates.encrypted_secret`. Symmetric: the same server process
 * that seals a secret also opens it, so the key lives in a single env var.
 *
 * Wire format (base64url): nonce(12) || ciphertext(64) || tag(16)  = 92 bytes
 * raw → ~124 base64url chars. Node's `crypto.createCipheriv('aes-256-gcm')`
 * returns tag separately via getAuthTag/setAuthTag; we concatenate on seal
 * and slice on open so the on-disk string is a single opaque blob.
 *
 * Key handling: DELEGATE_ENCRYPTION_KEY is a 32-byte (256-bit) key, encoded
 * as base64 or hex in the env var. We accept either form and reject anything
 * else loudly at module load. Zero fallback — misconfig must fail, never
 * silently encrypt with a predictable key.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from 'node:crypto';

const ALGO: CipherGCMTypes = 'aes-256-gcm';
const NONCE_BYTES = 12;       // NIST-recommended GCM IV length
const TAG_BYTES   = 16;       // GCM auth tag — fixed-size
const KEY_BYTES   = 32;       // AES-256

function loadKey(): Buffer {
  const raw = process.env.DELEGATE_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'DELEGATE_ENCRYPTION_KEY is unset. Generate with: ' +
      `openssl rand -base64 ${KEY_BYTES}`,
    );
  }
  // Accept either base64 or hex. 32 raw bytes = 44 base64 chars (with pad) or 64 hex chars.
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    buf = Buffer.from(raw, 'hex');
  } else {
    try {
      buf = Buffer.from(raw, 'base64');
    } catch {
      throw new Error('DELEGATE_ENCRYPTION_KEY is not valid base64 or hex');
    }
  }
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `DELEGATE_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${buf.length})`,
    );
  }
  return buf;
}

/**
 * Encrypt a session-key secret and return a base64url blob safe to store as
 * text. Each call uses a fresh random nonce — NEVER reuse a nonce with the
 * same key (GCM failure mode: tag forgery if you do).
 */
export function sealSessionSecret(secret: Uint8Array): string {
  const key   = loadKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGO, key, nonce);
  const ct  = Buffer.concat([cipher.update(secret), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: nonce || ct || tag   (tag last so slicing is trivial on open)
  return Buffer.concat([nonce, ct, tag]).toString('base64url');
}

/**
 * Open a blob produced by `sealSessionSecret`. Throws on tamper (auth-tag
 * mismatch) — callers should NOT catch-and-continue; a failed open means the
 * ciphertext was altered, the key was rotated without re-encrypt, or the
 * wrong env var is loaded.
 */
export function openSessionSecret(blob: string): Uint8Array {
  const key = loadKey();
  const buf = Buffer.from(blob, 'base64url');
  if (buf.length < NONCE_BYTES + TAG_BYTES + 1) {
    throw new Error('encrypted_secret blob is too short to be valid');
  }
  const nonce = buf.subarray(0, NONCE_BYTES);
  const tag   = buf.subarray(buf.length - TAG_BYTES);
  const ct    = buf.subarray(NONCE_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return new Uint8Array(pt);
}
