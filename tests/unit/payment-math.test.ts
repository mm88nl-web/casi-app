import { expect } from 'chai';
import { calcAmountCents, proRataCaptureCents } from '../../src/lib/payment-math';

describe('calcAmountCents', () => {
  it('per-minute: 2 EUR/min × 10 min = 2000 cents', () => {
    expect(calcAmountCents(2, 'min', 10)).to.equal(2000);
  });

  it('per-hour: 60 EUR/hr × 30 min = 3000 cents (via /60)', () => {
    expect(calcAmountCents(60, 'hr', 30)).to.equal(3000);
  });

  it('rounds half to even integer cents', () => {
    // 0.123 / min × 7 min × 100 = 86.1 → 86
    expect(calcAmountCents(0.123, 'min', 7)).to.equal(86);
  });

  it('zero / negative price returns 0', () => {
    expect(calcAmountCents(0, 'min', 10)).to.equal(0);
    expect(calcAmountCents(-1, 'min', 10)).to.equal(0);
  });

  it('zero / negative duration returns 0', () => {
    expect(calcAmountCents(5, 'min', 0)).to.equal(0);
    expect(calcAmountCents(5, 'min', -3)).to.equal(0);
  });

  it('unknown unit falls back to per-minute', () => {
    expect(calcAmountCents(3, 'banana' as any, 4)).to.equal(1200);
  });

  it('string numeric inputs are coerced (PostgREST returns NUMERIC as string)', () => {
    expect(calcAmountCents('2.5' as any, 'min', 4)).to.equal(1000);
  });

  it('null / undefined inputs return 0 without throwing', () => {
    expect(calcAmountCents(null, 'min', 5)).to.equal(0);
    expect(calcAmountCents(undefined, 'min', 5)).to.equal(0);
    expect(calcAmountCents(5, null, 5)).to.equal(2500); // null unit → per-minute fallback
  });

  describe('currency-aware minor units', () => {
    it('USD defaults to 2 decimals (* 100)', () => {
      expect(calcAmountCents(5, 'min', 4, 'usd')).to.equal(2000);
    });

    it('GBP, EUR, AUD, CAD, BRL, SGD all use 2 decimals', () => {
      for (const c of ['gbp', 'eur', 'aud', 'cad', 'brl', 'sgd']) {
        expect(calcAmountCents(5, 'min', 4, c)).to.equal(2000);
      }
    });

    it('JPY is zero-decimal — no * 100 multiplier', () => {
      // 500 JPY/min × 4 min = ¥2000 (NOT ¥200000)
      expect(calcAmountCents(500, 'min', 4, 'jpy')).to.equal(2000);
    });

    it('unknown / null currency falls back to USD-shaped minor units', () => {
      expect(calcAmountCents(5, 'min', 4, 'xyz')).to.equal(2000);
      expect(calcAmountCents(5, 'min', 4, null)).to.equal(2000);
      expect(calcAmountCents(5, 'min', 4)).to.equal(2000);
    });
  });
});

describe('proRataCaptureCents', () => {
  it('0 minutes elapsed → 0 cents', () => {
    expect(proRataCaptureCents(2000, 10, 0)).to.equal(0);
  });

  it('full duration → full original amount', () => {
    expect(proRataCaptureCents(2000, 10, 10)).to.equal(2000);
  });

  it('half duration → ~half amount', () => {
    expect(proRataCaptureCents(2000, 10, 5)).to.equal(1000);
  });

  it('elapsed > total is clamped to original (no overcharge possible)', () => {
    expect(proRataCaptureCents(2000, 10, 100)).to.equal(2000);
  });

  it('zero original amount returns 0', () => {
    expect(proRataCaptureCents(0, 10, 5)).to.equal(0);
  });

  it('zero total minutes returns 0', () => {
    expect(proRataCaptureCents(2000, 0, 5)).to.equal(0);
  });

  it('negative elapsed is clamped to 0', () => {
    expect(proRataCaptureCents(2000, 10, -5)).to.equal(0);
  });
});
