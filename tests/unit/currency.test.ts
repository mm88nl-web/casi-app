import { expect } from 'chai';
import { fiatSymbol, formatFiat, getFiatConfig, toStripeAmount } from '../../src/lib/currency';

describe('currency', () => {
  describe('getFiatConfig', () => {
    it('returns the matching config for a known ISO code', () => {
      const cfg = getFiatConfig('gbp');
      expect(cfg.iso).to.equal('gbp');
      expect(cfg.symbol).to.equal('£');
      expect(cfg.stripeDecimals).to.equal(2);
    });

    it('is case-insensitive', () => {
      expect(getFiatConfig('EUR').symbol).to.equal('€');
      expect(getFiatConfig('Jpy').symbol).to.equal('¥');
    });

    it('falls back to USD on unknown / null / empty input', () => {
      expect(getFiatConfig(null).iso).to.equal('usd');
      expect(getFiatConfig(undefined).iso).to.equal('usd');
      expect(getFiatConfig('').iso).to.equal('usd');
      expect(getFiatConfig('xyz').iso).to.equal('usd');
    });

    it('flags JPY as zero-decimal with a ¥100 rate step', () => {
      const jpy = getFiatConfig('jpy');
      expect(jpy.stripeDecimals).to.equal(0);
      expect(jpy.rateStep).to.equal(100);
    });
  });

  describe('formatFiat', () => {
    it('drops trailing .0 on whole values', () => {
      expect(formatFiat('usd', 5)).to.equal('$5');
      expect(formatFiat('gbp', 12)).to.equal('£12');
    });

    it('keeps two decimals on fractional values', () => {
      expect(formatFiat('eur', 5.42)).to.equal('€5.42');
      expect(formatFiat('aud', 0.99)).to.equal('A$0.99');
    });

    it('renders JPY with no decimals and thousand-separators', () => {
      expect(formatFiat('jpy', 1500)).to.equal('¥1,500');
      // JPY is zero-decimal — fractional input rounds.
      expect(formatFiat('jpy', 100.7)).to.equal('¥101');
    });

    it('falls back to $ on unknown currencies', () => {
      expect(formatFiat('xyz', 5)).to.equal('$5');
    });
  });

  describe('toStripeAmount', () => {
    it('converts standard-decimal currencies to minor units', () => {
      expect(toStripeAmount('usd', 5)).to.equal(500);
      expect(toStripeAmount('eur', 12.5)).to.equal(1250);
      expect(toStripeAmount('gbp', 0.99)).to.equal(99);
    });

    it('passes JPY through as integer (zero-decimal)', () => {
      expect(toStripeAmount('jpy', 1500)).to.equal(1500);
      expect(toStripeAmount('jpy', 100.4)).to.equal(100);
    });

    it('rounds to the nearest minor unit', () => {
      expect(toStripeAmount('usd', 1.234)).to.equal(123);
      expect(toStripeAmount('usd', 1.236)).to.equal(124);
      expect(toStripeAmount('usd', 0.001)).to.equal(0);
    });
  });

  describe('fiatSymbol', () => {
    it('returns the symbol for a known code', () => {
      expect(fiatSymbol('cad')).to.equal('C$');
      expect(fiatSymbol('brl')).to.equal('R$');
    });

    it('falls back to $', () => {
      expect(fiatSymbol(null)).to.equal('$');
    });
  });
});
