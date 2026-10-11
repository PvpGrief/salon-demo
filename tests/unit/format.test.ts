import { describe, expect, it } from 'vitest';
import { formatPhone, formatPrice, normalizePhone } from '../../src/lib/format';

describe('normalizePhone', () => {
  it('adds +371 to Latvian 8-digit numbers', () => {
    expect(normalizePhone('20 000 000')).toBe('+37120000000');
    expect(normalizePhone('67-123-456')).toBe('+37167123456');
  });
  it('keeps international numbers', () => {
    expect(normalizePhone('+371 2000 0000')).toBe('+37120000000');
    expect(normalizePhone('00372 5123 4567')).toBe('+37251234567');
  });
  it('rejects garbage', () => {
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
});

describe('formatPrice', () => {
  it('formats euros the Latvian way', () => {
    expect(formatPrice(35).replace(/\s/g, ' ')).toBe('35 €');
    expect(formatPrice('35.50').replace(/\s/g, ' ')).toBe('35,50 €');
    expect(formatPrice(60, true).replace(/\s/g, ' ')).toBe('no 60 €');
    expect(formatPrice(null)).toBe('pēc vienošanās');
  });
  it('formats phones for display', () => {
    expect(formatPhone('+37120000000')).toBe('+371 20 000 000');
  });
});
