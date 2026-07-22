import { describe, expect, it } from 'vitest';
import {
  GET_ORDER_DETAIL_QUERY,
  ORDERS_PAGINATED_QUERY,
  SEARCH_INVOICES_QUERY,
} from '../src/services/queries.js';

describe('Printavo order union queries', () => {
  it.each([
    ['search', SEARCH_INVOICES_QUERY],
    ['detail', GET_ORDER_DETAIL_QUERY],
    ['paginated', ORDERS_PAGINATED_QUERY],
  ])('requests both Invoice and Quote union members for %s', (_name, query) => {
    expect(query).toContain('... on Invoice');
    expect(query).toContain('... on Quote');
  });
});
