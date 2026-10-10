import { describe, expect, it } from 'vitest';

import { formatPaise, paiseToRupeeInput, parseRupeesToPaise, sumPaise } from './money';

describe('money', () => {
  it('formats whole and fractional rupees', () => {
    expect(formatPaise(12000)).toBe('₹120');
    expect(formatPaise(12050)).toBe('₹120.50');
    expect(formatPaise(12345600)).toBe('₹1,23,456');
  });

  it('rejects non-integer paise', () => {
    expect(() => formatPaise(10.5)).toThrow(TypeError);
  });

  it('parses rupee input without floating point errors', () => {
    expect(parseRupeesToPaise('70')).toBe(7000);
    expect(parseRupeesToPaise('70.5')).toBe(7050);
    expect(parseRupeesToPaise('0.29')).toBe(29);
    expect(parseRupeesToPaise(' 1.10 ')).toBe(110);
  });

  it.each(['', 'abc', '-5', '1.234', '1e3', '12,000', '.5'])('rejects invalid input %j', (input) => {
    expect(parseRupeesToPaise(input)).toBeNull();
  });

  it('round-trips form values', () => {
    for (const paise of [0, 5, 100, 7050, 999999]) {
      expect(parseRupeesToPaise(paiseToRupeeInput(paise))).toBe(paise);
    }
  });

  it('sums integers only', () => {
    expect(sumPaise([100, 250])).toBe(350);
    expect(() => sumPaise([1, 0.5])).toThrow();
  });
});
