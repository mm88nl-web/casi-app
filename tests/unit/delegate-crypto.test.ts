import { expect } from 'chai';
import { randomBytes } from 'node:crypto';
import { sealSessionSecret, openSessionSecret } from '../../src/lib/delegate-crypto';

/**
 * The crypto helper is tiny but safety-critical: a bug in seal/open silently
 * breaks every delegate the moment the key rotates, so we round-trip every
 * branch (fresh nonce, tamper detection, length validation, missing env var).
 *
 * We generate the key in-process and set DELEGATE_ENCRYPTION_KEY from each
 * test — never run these against a real production key, and always restore
 * the env var afterwards to keep other test files isolated.
 */
describe('delegate-crypto', () => {
  const originalKey = process.env.DELEGATE_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.DELEGATE_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.DELEGATE_ENCRYPTION_KEY;
    else process.env.DELEGATE_ENCRYPTION_KEY = originalKey;
  });

  it('round-trips a 64-byte ed25519 secret key', () => {
    const secret = randomBytes(64);
    const blob   = sealSessionSecret(secret);
    const opened = openSessionSecret(blob);
    expect(Buffer.from(opened).equals(secret)).to.equal(true);
  });

  it('produces a fresh nonce on each seal (two ciphertexts differ)', () => {
    const secret = randomBytes(64);
    const a = sealSessionSecret(secret);
    const b = sealSessionSecret(secret);
    expect(a).to.not.equal(b);
  });

  it('accepts a hex-encoded key as well as base64', () => {
    process.env.DELEGATE_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    const secret = randomBytes(64);
    const blob   = sealSessionSecret(secret);
    const opened = openSessionSecret(blob);
    expect(Buffer.from(opened).equals(secret)).to.equal(true);
  });

  it('rejects a tampered ciphertext (auth tag mismatch)', () => {
    const secret = randomBytes(64);
    const blob   = sealSessionSecret(secret);
    // Flip a byte inside the ciphertext region (after nonce, before tag).
    const buf = Buffer.from(blob, 'base64url');
    buf[20] ^= 0x01;
    const tampered = buf.toString('base64url');
    expect(() => openSessionSecret(tampered)).to.throw();
  });

  it('rejects a blob that is too short to contain nonce + tag', () => {
    const tiny = Buffer.from('abc').toString('base64url');
    expect(() => openSessionSecret(tiny)).to.throw(/too short/);
  });

  it('throws loudly when DELEGATE_ENCRYPTION_KEY is unset', () => {
    delete process.env.DELEGATE_ENCRYPTION_KEY;
    expect(() => sealSessionSecret(randomBytes(64))).to.throw(/unset/);
  });

  it('throws loudly when DELEGATE_ENCRYPTION_KEY is the wrong length', () => {
    process.env.DELEGATE_ENCRYPTION_KEY = randomBytes(16).toString('base64');
    expect(() => sealSessionSecret(randomBytes(64))).to.throw(/32 bytes/);
  });
});
