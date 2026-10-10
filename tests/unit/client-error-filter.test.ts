import { expect } from 'chai';
import { isIgnorableClientError } from '../../src/lib/client-error-filter';

describe('isIgnorableClientError', () => {
  const cspMsg = "unhandledrejection: Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script";

  it('ignores CSP eval errors injected by headless automation', () => {
    const stack = 'EvalError: Refused...\n    at eval (<anonymous>)\n    at predicate (eval at evaluate (:234:30), <anonymous>:11:37)';
    expect(isIgnorableClientError(cspMsg, stack)).to.equal(true);
  });

  it('ignores puppeteer / playwright evaluation frames', () => {
    expect(isIgnorableClientError('x', 'at __puppeteer_evaluation_script__:3:1')).to.equal(true);
    expect(isIgnorableClientError('x', 'at __playwright_evaluation_script__:3:1')).to.equal(true);
  });

  it('keeps real app errors, including CSP errors from our own code', () => {
    expect(isIgnorableClientError('TypeError: x is undefined', 'at Overlay (/_next/static/chunks/app.js:1:2)')).to.equal(false);
    expect(isIgnorableClientError(cspMsg, 'EvalError\n    at /_next/static/chunks/vendor.js:1:2')).to.equal(false);
    expect(isIgnorableClientError('boom', undefined)).to.equal(false);
  });
});
