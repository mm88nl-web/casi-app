import { expect } from 'chai';
import {
  decodeBase58,
  matchDiscriminator,
  parseCasiInstruction,
  decodeInitializeEscrowAmount,
  expectedEscrowMicroUsdc,
  CASI_IX_DISCRIMINATORS,
} from '../../src/lib/casi-escrow-decoder';

/**
 * Minimal base58 encoder for test fixtures only. Symmetrical to the decoder
 * in src/lib/casi-escrow-decoder.ts. Not exported from the lib itself because
 * no production code path needs to encode — only decode Helius-delivered
 * base58 instruction data.
 */
const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  // Work in big-endian digits base 58.
  const size = Math.ceil(bytes.length * 1.366) + 1; // log(256)/log(58) ≈ 1.366
  const b58 = new Uint8Array(size);

  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = size - 1; j >= 0; j--) {
      carry += 256 * b58[j];
      b58[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
  }

  let start = 0;
  while (start < size && b58[start] === 0) start++;

  let out = '1'.repeat(zeros);
  for (let i = start; i < size; i++) out += BASE58_ALPHABET[b58[i]];
  return out;
}

const CASI_PROGRAM_ID = 'CasiProgramIdExampleTestFixture111111111111';

describe('casi-escrow-decoder', () => {
  describe('decodeBase58', () => {
    it('decodes an empty string to empty bytes', () => {
      expect(Array.from(decodeBase58(''))).to.deep.equal([]);
    });

    it('preserves leading zeros as leading 1 chars', () => {
      const bytes = new Uint8Array([0, 0, 0, 42]);
      const encoded = encodeBase58(bytes);
      expect(encoded.startsWith('111')).to.equal(true);
      expect(Array.from(decodeBase58(encoded))).to.deep.equal([0, 0, 0, 42]);
    });

    it('round-trips a random 40-byte buffer', () => {
      const bytes = new Uint8Array(40);
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 5) & 0xff;
      const roundTripped = decodeBase58(encodeBase58(bytes));
      expect(Array.from(roundTripped)).to.deep.equal(Array.from(bytes));
    });

    it('throws on invalid characters', () => {
      expect(() => decodeBase58('0OIl')).to.throw(/Invalid base58/);
    });
  });

  describe('matchDiscriminator', () => {
    it('returns the instruction name for each known discriminator', () => {
      for (const [name, bytes] of Object.entries(CASI_IX_DISCRIMINATORS)) {
        const buf = new Uint8Array([...bytes, 0, 0, 0, 0]); // pad with tail bytes
        expect(matchDiscriminator(buf)).to.equal(name);
      }
    });

    it('returns null for buffers shorter than 8 bytes', () => {
      expect(matchDiscriminator(new Uint8Array([1, 2, 3]))).to.equal(null);
    });

    it('returns null for unknown 8-byte prefixes', () => {
      const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(matchDiscriminator(buf)).to.equal(null);
    });
  });

  describe('parseCasiInstruction', () => {
    function ixFor(kind: keyof typeof CASI_IX_DISCRIMINATORS, tail: number[] = []) {
      const disc = CASI_IX_DISCRIMINATORS[kind];
      const bytes = new Uint8Array([...disc, ...tail]);
      return {
        programId: CASI_PROGRAM_ID,
        data: encodeBase58(bytes),
        accounts: ['pda-acct', 'viewer-acct', 'streamer-acct'],
      };
    }

    it('returns null when programId does not match', () => {
      const ix = {
        ...ixFor('start_beam'),
        programId: 'SomeOtherProgramId',
      };
      expect(parseCasiInstruction(ix, CASI_PROGRAM_ID)).to.equal(null);
    });

    it('returns null when data is missing or empty', () => {
      expect(
        parseCasiInstruction({ programId: CASI_PROGRAM_ID, accounts: [] }, CASI_PROGRAM_ID),
      ).to.equal(null);
      expect(
        parseCasiInstruction(
          { programId: CASI_PROGRAM_ID, data: '', accounts: [] },
          CASI_PROGRAM_ID,
        ),
      ).to.equal(null);
    });

    it('returns null when data is not valid base58', () => {
      expect(
        parseCasiInstruction(
          { programId: CASI_PROGRAM_ID, data: '0OIl', accounts: [] },
          CASI_PROGRAM_ID,
        ),
      ).to.equal(null);
    });

    it('returns null when discriminator is unknown', () => {
      const bytes = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]);
      expect(
        parseCasiInstruction(
          { programId: CASI_PROGRAM_ID, data: encodeBase58(bytes), accounts: [] },
          CASI_PROGRAM_ID,
        ),
      ).to.equal(null);
    });

    it('identifies each CASI instruction and forwards accounts', () => {
      for (const kind of Object.keys(CASI_IX_DISCRIMINATORS) as Array<
        keyof typeof CASI_IX_DISCRIMINATORS
      >) {
        const ix = ixFor(kind, [1, 2, 3]);
        const parsed = parseCasiInstruction(ix, CASI_PROGRAM_ID);
        expect(parsed, `parsed ${kind}`).to.not.equal(null);
        expect(parsed!.kind).to.equal(kind);
        expect(parsed!.accounts).to.deep.equal(['pda-acct', 'viewer-acct', 'streamer-acct']);
      }
    });

    it('returns the decoded raw bytes alongside kind/accounts', () => {
      const bytes = new Uint8Array([...CASI_IX_DISCRIMINATORS.settle_beam, 9, 9, 9]);
      const parsed = parseCasiInstruction(
        { programId: CASI_PROGRAM_ID, data: encodeBase58(bytes), accounts: [] },
        CASI_PROGRAM_ID,
      );
      expect(Array.from(parsed!.data)).to.deep.equal(Array.from(bytes));
    });

    it('tolerates missing or malformed accounts arrays', () => {
      const disc = CASI_IX_DISCRIMINATORS.cancel_escrow;
      const data = encodeBase58(new Uint8Array(disc));

      const missing = parseCasiInstruction(
        { programId: CASI_PROGRAM_ID, data },
        CASI_PROGRAM_ID,
      );
      expect(missing?.accounts).to.deep.equal([]);

      const mixed = parseCasiInstruction(
        {
          programId: CASI_PROGRAM_ID,
          data,
          accounts: ['valid', null as unknown as string, 42 as unknown as string, 'also-valid'],
        },
        CASI_PROGRAM_ID,
      );
      expect(mixed?.accounts).to.deep.equal(['valid', 'also-valid']);
    });
  });

  describe('decodeInitializeEscrowAmount', () => {
    /** Little-endian byte encoding of a u64, independent of the impl under test. */
    function amountBytesLE(amount: bigint): number[] {
      const bytes: number[] = [];
      let v = amount;
      for (let i = 0; i < 8; i++) {
        bytes.push(Number(v & 0xffn));
        v >>= 8n;
      }
      return bytes;
    }

    /** Builds a full initialize_escrow-shaped ix data buffer (or another
     *  instruction's discriminator, for the negative case below). */
    function ixFor(amount: bigint, kind: keyof typeof CASI_IX_DISCRIMINATORS = 'initialize_escrow') {
      const disc = CASI_IX_DISCRIMINATORS[kind];
      const escrowId = new Array(32).fill(7); // arbitrary filler
      const amountBytes = amountBytesLE(amount);
      const durationBytes = amountBytesLE(600n); // arbitrary filler
      const escrowType = [1];
      return new Uint8Array([...disc, ...escrowId, ...amountBytes, ...durationBytes, ...escrowType]);
    }

    it('decodes a typical price (50 USDC = 50_000_000 micro-units)', () => {
      expect(decodeInitializeEscrowAmount(ixFor(50_000_000n))).to.equal(50_000_000n);
    });

    it('decodes zero', () => {
      expect(decodeInitializeEscrowAmount(ixFor(0n))).to.equal(0n);
    });

    it('decodes near u64::MAX without precision loss', () => {
      const big = 18_446_744_073_709_551_615n;
      expect(decodeInitializeEscrowAmount(ixFor(big))).to.equal(big);
    });

    it('catches the underpayment attack scenario: 1 micro-USDC instead of a real price', () => {
      expect(decodeInitializeEscrowAmount(ixFor(1n))).to.equal(1n);
    });

    it('returns null for buffers too short to contain the amount field', () => {
      const short = new Uint8Array([...CASI_IX_DISCRIMINATORS.initialize_escrow, 1, 2, 3]);
      expect(decodeInitializeEscrowAmount(short)).to.equal(null);
    });

    it('returns null when the discriminator is not initialize_escrow', () => {
      expect(decodeInitializeEscrowAmount(ixFor(50_000_000n, 'settle_beam'))).to.equal(null);
    });
  });

  describe('expectedEscrowMicroUsdc', () => {
    it('per-minute: 2 USDC/min x 10 min = 20 USDC = 20_000_000 micro-units', () => {
      const got = expectedEscrowMicroUsdc({ priceValue: 2, priceUnit: 'min', durationMinutes: 10 });
      expect(got).to.equal(20_000_000n);
    });

    it('per-hour (any priceUnit other than "min"): 60 USDC/hr x 30 min = 30 USDC', () => {
      const got = expectedEscrowMicroUsdc({ priceValue: 60, priceUnit: 'hour', durationMinutes: 30 });
      expect(got).to.equal(30_000_000n);
    });

    it('matches the attack scenario: a real $50 price must not collapse to 1 micro-USDC', () => {
      const got = expectedEscrowMicroUsdc({ priceValue: 50, priceUnit: 'min', durationMinutes: 1 });
      expect(got).to.equal(50_000_000n);
      expect(got).to.not.equal(1n);
    });

    it('zero price returns zero', () => {
      expect(expectedEscrowMicroUsdc({ priceValue: 0, priceUnit: 'min', durationMinutes: 10 })).to.equal(0n);
    });
  });
});
