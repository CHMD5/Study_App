import { describe, expect, it } from 'vitest';
import { normalizePhone } from './auth';

describe('normalizePhone', () => {
  it('normalizes standard Indian numbers with default country code', () => {
    const res = normalizePhone('+91', '9876543210');
    expect(res.fullPhone).toBe('+919876543210');
    expect(res.cleanDigits).toBe('9876543210');
    expect(res.countryCode).toBe('+91');
  });

  it('handles country code without leading plus', () => {
    const res = normalizePhone('91', '9876543210');
    expect(res.fullPhone).toBe('+919876543210');
    expect(res.cleanDigits).toBe('9876543210');
  });

  it('strips dashes, spaces, and formatting characters', () => {
    const res = normalizePhone('+91', ' 98765 - 43210 ');
    expect(res.fullPhone).toBe('+919876543210');
    expect(res.cleanDigits).toBe('9876543210');
  });

  it('deduplicates country code if user typed it into both fields', () => {
    const res = normalizePhone('+91', '919876543210');
    expect(res.fullPhone).toBe('+919876543210');
    expect(res.cleanDigits).toBe('9876543210');
  });

  it('supports international country codes like US/Canada (+1) and UK (+44)', () => {
    const us = normalizePhone('+1', '(415) 555-2671');
    expect(us.fullPhone).toBe('+14155552671');
    expect(us.cleanDigits).toBe('4155552671');

    const uk = normalizePhone('+44', '07911 123456');
    expect(uk.fullPhone).toBe('+4407911123456');
    expect(uk.countryCode).toBe('+44');
  });
});
