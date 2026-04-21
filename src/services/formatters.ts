/**
 * Shared formatting helpers used by tool handlers to produce
 * human-readable Markdown output.
 */

import type { Address, SizeCount } from '../types.js';

export function formatCurrency(value: number | string | null | undefined): string {
  if (value == null) return 'N/A';
  const num = typeof value === 'number' ? value : parseFloat(value);
  return Number.isNaN(num) ? String(value) : `$${num.toFixed(2)}`;
}

export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return 'N/A';
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export function formatAddress(addr: Address | null | undefined): string | null {
  if (!addr) return null;
  const cityLine = [addr.city, addr.state, addr.zipCode].filter(Boolean).join(', ');
  return [addr.address1, cityLine].filter(Boolean).join(', ');
}

export function formatSizes(sizes: SizeCount[] | null | undefined): string {
  if (!sizes || !Array.isArray(sizes)) return '';
  return sizes
    .filter((s) => s.count > 0)
    .map((s) => `${s.size}:${s.count}`)
    .join(' ');
}

/**
 * Friendly size names → Printavo `LineItemSize` enum values.
 * Accepts upper, lower, and mixed case. `XXL`/`XXXL` map to `2XL`/`3XL`.
 */
export const SIZE_NAME_TO_ENUM: Record<string, string> = {
  YXS: 'size_yxs',
  YS: 'size_ys',
  YM: 'size_ym',
  YL: 'size_yl',
  YXL: 'size_yxl',
  XS: 'size_xs',
  S: 'size_s',
  M: 'size_m',
  L: 'size_l',
  XL: 'size_xl',
  '2XL': 'size_2xl',
  XXL: 'size_2xl',
  '3XL': 'size_3xl',
  XXXL: 'size_3xl',
  '4XL': 'size_4xl',
  '5XL': 'size_5xl',
  '6XL': 'size_6xl',
  OTHER: 'size_other',
  '6M': 'size_6m',
  '12M': 'size_12m',
  '18M': 'size_18m',
  '24M': 'size_24m',
  '2T': 'size_2t',
  '3T': 'size_3t',
  '4T': 'size_4t',
  '5T': 'size_5t',
};

const VALID_SIZE_ENUMS = new Set(Object.values(SIZE_NAME_TO_ENUM));

const VALID_SIZE_KEYS = Array.from(
  new Set(Object.keys(SIZE_NAME_TO_ENUM).map((k) => k.toUpperCase())),
)
  .sort()
  .join(', ');

export function parseSizesToInput(sizes: Record<string, number | string>): SizeCount[] {
  const result: SizeCount[] = [];
  for (const [key, count] of Object.entries(sizes)) {
    const intCount = typeof count === 'number' ? count : parseInt(String(count), 10);
    if (Number.isNaN(intCount) || intCount < 0) continue;

    const upperKey = key.toUpperCase();
    let enumValue = SIZE_NAME_TO_ENUM[upperKey];
    if (!enumValue && VALID_SIZE_ENUMS.has(key)) enumValue = key;
    if (!enumValue) {
      throw new Error(`Unknown size: "${key}". Valid: ${VALID_SIZE_KEYS}`);
    }
    result.push({ size: enumValue, count: intCount });
  }
  return result;
}

/** CHARACTER_LIMIT-aware truncation helper for Markdown responses. */
export function truncateMarkdown(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  return (
    head +
    `\n\n_… response truncated at ${limit.toLocaleString()} chars. ` +
    `Refine filters or use pagination to see more._`
  );
}
