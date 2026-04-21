import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatAddress,
  formatSizes,
  parseSizesToInput,
  truncateMarkdown,
} from '../src/services/formatters.js';

describe('formatCurrency', () => {
  it('handles numbers and numeric strings', () => {
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(12.5)).toBe('$12.50');
    expect(formatCurrency('99.99')).toBe('$99.99');
  });
  it('handles null/undefined', () => {
    expect(formatCurrency(null)).toBe('N/A');
    expect(formatCurrency(undefined)).toBe('N/A');
  });
  it('falls back to string for non-numeric input', () => {
    expect(formatCurrency('abc')).toBe('abc');
  });
});

describe('formatDate', () => {
  it('formats ISO dates', () => {
    expect(formatDate('2026-04-21T00:00:00Z')).toMatch(/Apr.*2026/);
  });
  it('handles null', () => {
    expect(formatDate(null)).toBe('N/A');
  });
});

describe('formatAddress', () => {
  it('joins address parts', () => {
    expect(
      formatAddress({ address1: '123 Main', city: 'Austin', state: 'TX', zipCode: '78701' }),
    ).toBe('123 Main, Austin, TX, 78701');
  });
  it('returns null for missing input', () => {
    expect(formatAddress(null)).toBeNull();
  });
  it('omits missing parts cleanly', () => {
    expect(formatAddress({ address1: '123 Main' })).toBe('123 Main');
  });
});

describe('formatSizes', () => {
  it('renders non-zero sizes', () => {
    expect(
      formatSizes([
        { size: 'S', count: 5 },
        { size: 'M', count: 0 },
        { size: 'L', count: 3 },
      ]),
    ).toBe('S:5 L:3');
  });
});

describe('parseSizesToInput', () => {
  it('maps friendly names to enum values', () => {
    const result = parseSizesToInput({ S: 5, M: 10, '2XL': 2 });
    expect(result).toEqual([
      { size: 'size_s', count: 5 },
      { size: 'size_m', count: 10 },
      { size: 'size_2xl', count: 2 },
    ]);
  });
  it('accepts already-enum values', () => {
    const result = parseSizesToInput({ size_xl: 1 });
    expect(result).toEqual([{ size: 'size_xl', count: 1 }]);
  });
  it('throws on unknown sizes', () => {
    expect(() => parseSizesToInput({ FOO: 5 })).toThrow(/Unknown size/);
  });
  it('skips negative or NaN counts silently', () => {
    expect(parseSizesToInput({ S: -1 })).toEqual([]);
    expect(parseSizesToInput({ S: 'abc' })).toEqual([]);
  });
});

describe('truncateMarkdown', () => {
  it('passes through short text', () => {
    expect(truncateMarkdown('hello', 100)).toBe('hello');
  });
  it('truncates long text with notice', () => {
    const long = 'a'.repeat(200);
    const result = truncateMarkdown(long, 50);
    expect(result.length).toBeGreaterThan(50);
    expect(result).toContain('truncated');
  });
});
