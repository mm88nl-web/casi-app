import { expect } from 'chai';
import {
  parseCasiError,
  isUserRejection,
  isTransientRpcError,
  isAlreadyProcessed,
  isBenignEscrowRace,
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

describe('isAlreadyProcessed', () => {
  it('detects "This transaction has already been processed"', () => {
    const err = new Error('Transaction simulation failed: This transaction has already been processed.');
    expect(isAlreadyProcessed(err)).to.equal(true);
  });
  it('detects the shortened "already processed" phrasing', () => {
    expect(isAlreadyProcessed(new Error('RPC: already processed'))).to.equal(true);
  });
  it('returns false for unrelated errors', () => {
    expect(isAlreadyProcessed(new Error('Blockhash not found'))).to.equal(false);
    expect(isAlreadyProcessed(new Error('User rejected the request'))).to.equal(false);
  });
});

describe('isBenignEscrowRace', () => {
  it('detects "already processed" (isAlreadyProcessed passthrough)', () => {
    expect(isBenignEscrowRace(new Error('already processed'))).to.equal(true);
  });

  it('detects a real AnchorError shape via .error.errorCode.number', () => {
    // Mirrors what @coral-xyz/anchor's translateError() produces when it
    // successfully matches a "Program log: AnchorError..." line.
    const err = {
      message: 'AnchorError caused by account: escrow_state. Error Code: AccountNotInitialized. Error Number: 3012. Error Message: The program expected this account to be already initialized.',
      error: { errorCode: { code: 'AccountNotInitialized', number: 3012 } },
    };
    expect(isBenignEscrowRace(err)).to.equal(true);
  });

  it('detects AlreadySettled by AnchorError error number (6005)', () => {
    const err = { message: 'AnchorError ... AlreadySettled ...', error: { errorCode: { code: 'AlreadySettled', number: 6005 } } };
    expect(isBenignEscrowRace(err)).to.equal(true);
  });

  it('detects a bare ProgramError shape via .code, even though .message is empty', () => {
    // @coral-xyz/anchor's ProgramError calls super() with NO argument, so
    // .message is ALWAYS '' — this is the case that broke plain
    // message-regex matching and is the whole reason this helper exists.
    class FakeProgramError extends Error {
      code: number;
      constructor(code: number) {
        super();
        this.code = code;
      }
    }
    const err = new FakeProgramError(3012);
    expect(err.message).to.equal('');
    expect(isBenignEscrowRace(err)).to.equal(true);
  });

  it('detects the untranslated raw SendTransactionError text by name', () => {
    const err = new Error('Simulation failed. \nMessage: Transaction simulation failed: Error processing Instruction 0: custom program error: AccountNotInitialized');
    expect(isBenignEscrowRace(err)).to.equal(true);
  });

  it('detects the untranslated raw SendTransactionError text by hex code alone', () => {
    // 0xbc4 = 3012 = AccountNotInitialized, with no readable name anywhere
    // in the message — the exact shape a bare conn.sendRawTransaction()
    // throws when the RPC never echoed a matching Anchor log line.
    const err = new Error('Simulation failed. \nMessage: Transaction simulation failed: Error processing Instruction 0: custom program error: 0xbc4');
    expect(isBenignEscrowRace(err)).to.equal(true);
  });

  it('detects CasiError::AlreadySettled by hex code alone (0x1775 = 6005)', () => {
    const err = new Error('custom program error: 0x1775');
    expect(isBenignEscrowRace(err)).to.equal(true);
  });

  it('does not false-positive on an unrelated hex code', () => {
    // 0x1771 = 6001 = InvalidDuration — a real error, not a benign race.
    const err = new Error('custom program error: 0x1771');
    expect(isBenignEscrowRace(err)).to.equal(false);
  });

  it('returns false for a genuine, unrelated failure', () => {
    expect(isBenignEscrowRace(new Error('User rejected the request'))).to.equal(false);
    expect(isBenignEscrowRace(new Error('Blockhash not found'))).to.equal(false);
    expect(isBenignEscrowRace(null)).to.equal(false);
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
