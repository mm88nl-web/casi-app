import { expect } from 'chai';
import {
  parseCasiError,
  isUserRejection,
  isTransientRpcError,
  formatEscrowError,
  CASI_ERROR_NAMES,
  CASI_ERROR_CODE_BASE,
} from '../../src/lib/casi-errors';

describe('parseCasiError', () => {
  it('pulls the variant name out of an AnchorError-shaped throw', () => {
    const err = { error: { errorCode: { code: 'NotActive' } } };
    expect(parseCasiError(err)).to.equal('NotActive');
  });

  it('ignores anchor code values that are not known variants', () => {
    const err = { error: { errorCode: { code: 'SomethingElse' } } };
    expect(parseCasiError(err)).to.equal(null);
  });

  it('matches "Error Code: Foo" in the message', () => {
    const err = new Error('Simulation failed. Error Code: Unauthorized. Logs: []');
    expect(parseCasiError(err)).to.equal('Unauthorized');
  });

  it('matches "CasiError::Foo" in the message', () => {
    const err = new Error('CasiError::AlreadySettled: flash already settled');
    expect(parseCasiError(err)).to.equal('AlreadySettled');
  });

  it('maps hex custom program error to variant by index', () => {
    // 6001 = 0x1771 → variant index 1 = InvalidDuration
    const err = new Error('Program failed: custom program error: 0x1771');
    expect(parseCasiError(err)).to.equal('InvalidDuration');
  });

  it('returns null for unrecognized errors', () => {
    expect(parseCasiError(new Error('RPC timeout'))).to.equal(null);
    expect(parseCasiError(null)).to.equal(null);
    expect(parseCasiError(undefined)).to.equal(null);
    expect(parseCasiError('string')).to.equal(null);
  });

  it('error code base + index covers every named variant', () => {
    CASI_ERROR_NAMES.forEach((name, idx) => {
      const hex = (CASI_ERROR_CODE_BASE + idx).toString(16);
      const err = new Error(`custom program error: 0x${hex}`);
      expect(parseCasiError(err)).to.equal(name);
    });
  });
});

describe('isUserRejection', () => {
  it('detects "User rejected the request"', () => {
    expect(isUserRejection(new Error('User rejected the request.'))).to.equal(true);
  });
  it('detects "User denied transaction signature"', () => {
    expect(isUserRejection(new Error('User denied transaction signature'))).to.equal(true);
  });
  it('detects "rejected the request"', () => {
    expect(isUserRejection(new Error('Wallet: rejected the request'))).to.equal(true);
  });
  it('returns false for non-rejection errors', () => {
    expect(isUserRejection(new Error('Blockhash not found'))).to.equal(false);
    expect(isUserRejection(null)).to.equal(false);
  });
});

describe('isTransientRpcError', () => {
  it('detects block-height-exceeded', () => {
    expect(isTransientRpcError(new Error('Transaction block height exceeded'))).to.equal(true);
  });
  it('detects blockhash not found', () => {
    expect(isTransientRpcError(new Error('Blockhash not found'))).to.equal(true);
  });
  it('detects timeout variants', () => {
    expect(isTransientRpcError(new Error('Request timeout'))).to.equal(true);
    expect(isTransientRpcError(new Error('timed out after 30s'))).to.equal(true);
  });
  it('returns false for unrelated errors', () => {
    expect(isTransientRpcError(new Error('User rejected the request'))).to.equal(false);
  });
});

describe('formatEscrowError', () => {
  it('user rejection beats CasiError mapping', () => {
    const err = new Error('User rejected the request. Error Code: NotActive.');
    expect(formatEscrowError(err)).to.equal('Transaction cancelled');
  });

  it('mapped CasiError returns friendly copy', () => {
    const err = new Error('Error Code: InvalidAmount.');
    expect(formatEscrowError(err)).to.equal('Flash amount must be greater than zero.');
  });

  it('transient RPC error returns retry message', () => {
    const err = new Error('Blockhash not found');
    expect(formatEscrowError(err)).to.equal('Network issue — please try again');
  });

  it('fallback trims long messages to 140 chars with ellipsis', () => {
    const longMsg = 'x'.repeat(500);
    const out = formatEscrowError(new Error(longMsg));
    expect(out.length).to.be.at.most(140);
    expect(out.endsWith('…')).to.equal(true);
  });

  it('empty / unknown error falls back to "Unknown error"', () => {
    expect(formatEscrowError(new Error(''))).to.equal('Unknown error');
  });
});
