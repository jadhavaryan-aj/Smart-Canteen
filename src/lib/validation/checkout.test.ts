import { describe, expect, it } from 'vitest';

import { checkoutDetailsSchema } from './checkout';

describe('checkout details', () => {
  const hidden = checkoutDetailsSchema('hidden', 'Student ID');
  const required = checkoutDetailsSchema('required', 'Roll number');

  it('accepts a simple name and requires terms', () => {
    expect(
      hidden.safeParse({ customerName: 'Priya', studentIdentifier: '', acceptTerms: true }).success,
    ).toBe(true);
    expect(
      hidden.safeParse({ customerName: 'Priya', studentIdentifier: '', acceptTerms: false }).success,
    ).toBe(false);
  });

  it.each(['A', '', '<b>Bold</b>', 'x'.repeat(41)])('rejects the name %j', (customerName) => {
    expect(hidden.safeParse({ customerName, studentIdentifier: '', acceptTerms: true }).success).toBe(false);
  });

  it('accepts names in Indian scripts', () => {
    expect(
      hidden.safeParse({ customerName: 'प्रिया', studentIdentifier: '', acceptTerms: true }).success,
    ).toBe(true);
  });

  it('enforces a required ID with a custom label', () => {
    const result = required.safeParse({ customerName: 'Ravi', studentIdentifier: '', acceptTerms: true });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Roll number is required.');
    expect(
      required.safeParse({ customerName: 'Ravi', studentIdentifier: 'CS/2024-17', acceptTerms: true })
        .success,
    ).toBe(true);
  });
});
