import { describe, expect, it } from 'vitest';
import { buildProductionScheduleVariables, filterUsableOrders } from '../src/tools/stats.js';
import type { Quote } from '../src/types.js';

describe('filterUsableOrders', () => {
  it('removes empty GraphQL union placeholder objects without dropping real zero-dollar or zero-quantity orders', () => {
    const orders = [
      { id: '21984210', visualId: '14383', total: 5342.4, totalQuantity: 160 },
      {},
      { id: '22609445', visualId: '14709', total: 30, totalQuantity: 0 },
      { id: '22219212', visualId: '14530', total: 0, totalQuantity: 0 },
      {},
    ] as Quote[];

    const result = filterUsableOrders(orders);

    expect(result.orders.map((order) => order.visualId)).toEqual(['14383', '14709', '14530']);
    expect(result.omittedEmptyRecords).toBe(2);
  });
});

describe('buildProductionScheduleVariables', () => {
  it('treats end_date as an inclusive calendar day when querying Printavo', () => {
    const variables = buildProductionScheduleVariables('2026-05-08', '2026-05-08');

    expect(variables).toMatchObject({
      first: 25,
      inProductionAfter: '2026-05-08',
      inProductionBefore: '2026-05-09',
    });
  });
});
