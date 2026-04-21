import { describe, it, expect } from 'vitest';
import {
  SearchInvoicesSchema,
  GetInvoiceDetailSchema,
  CalculateMatrixPriceSchema,
  AddLineItemSchema,
  GetPricingMatrixSchema,
} from '../src/schemas/index.js';

describe('SearchInvoicesSchema', () => {
  it('accepts an empty input and applies defaults', () => {
    const parsed = SearchInvoicesSchema.parse({});
    expect(parsed.limit).toBe(25);
  });
  it('validates ISO dates', () => {
    expect(() => SearchInvoicesSchema.parse({ start_date: 'not-a-date' })).toThrow();
  });
  it('clamps limit to max 25', () => {
    expect(() => SearchInvoicesSchema.parse({ limit: 999 })).toThrow();
  });
  it('rejects unknown fields with .strict()', () => {
    expect(() => SearchInvoicesSchema.parse({ foo: 'bar' })).toThrow();
  });
});

describe('GetInvoiceDetailSchema', () => {
  it('requires visual_id', () => {
    expect(() => GetInvoiceDetailSchema.parse({})).toThrow();
  });
  it('accepts a visual id string', () => {
    expect(GetInvoiceDetailSchema.parse({ visual_id: '12345' }).visual_id).toBe('12345');
  });
});

describe('CalculateMatrixPriceSchema', () => {
  it('requires matrix_column_id and quantity', () => {
    expect(() => CalculateMatrixPriceSchema.parse({})).toThrow();
  });
  it('rejects negative quantity', () => {
    expect(() =>
      CalculateMatrixPriceSchema.parse({ matrix_column_id: 'col', quantity: 0 }),
    ).toThrow();
  });
});

describe('AddLineItemSchema', () => {
  it('requires line_item_group_id, description, position', () => {
    expect(() => AddLineItemSchema.parse({})).toThrow();
    expect(() =>
      AddLineItemSchema.parse({ line_item_group_id: 'g1', description: 'shirt' }),
    ).toThrow(); // position missing
  });
  it('accepts a complete input', () => {
    const result = AddLineItemSchema.parse({
      line_item_group_id: 'g1',
      description: 'Tee',
      position: 1,
      sizes: { S: 5, M: 10 },
    });
    expect(result.position).toBe(1);
  });
});

describe('GetPricingMatrixSchema', () => {
  it('requires id or name', () => {
    expect(() => GetPricingMatrixSchema.parse({})).toThrow(/id.*name/);
  });
  it('accepts id alone', () => {
    expect(GetPricingMatrixSchema.parse({ id: 'm1' }).id).toBe('m1');
  });
  it('accepts name alone', () => {
    expect(GetPricingMatrixSchema.parse({ name: 'Standard' }).name).toBe('Standard');
  });
});
