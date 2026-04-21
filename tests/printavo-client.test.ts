import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executeQuery, _resetRateLimiterForTests, PrintavoApiError } from '../src/services/printavo-client.js';

beforeEach(() => {
  _resetRateLimiterForTests();
  process.env.PRINTAVO_EMAIL = 'test@example.com';
  process.env.PRINTAVO_API_TOKEN = 'test-token';
});

function makeFetch(response: { status: number; body: unknown; ok?: boolean }): typeof fetch {
  return vi.fn(async () => {
    return {
      status: response.status,
      ok: response.ok ?? (response.status >= 200 && response.status < 300),
      async json() {
        return response.body;
      },
      async text() {
        return JSON.stringify(response.body);
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('executeQuery', () => {
  it('returns data on success', async () => {
    const fetchImpl = makeFetch({
      status: 200,
      body: { data: { account: { id: '1', companyName: 'Acme' } } },
    });
    const result = await executeQuery<{ account: { id: string } }>(
      'query { account { id } }',
      {},
      { fetchImpl },
    );
    expect(result.account.id).toBe('1');
  });

  it('throws PrintavoApiError on GraphQL errors', async () => {
    const fetchImpl = makeFetch({
      status: 200,
      body: { errors: [{ message: 'Boom' }] },
    });
    await expect(executeQuery('query { x }', {}, { fetchImpl })).rejects.toThrow(PrintavoApiError);
  });

  it('throws on missing credentials', async () => {
    delete process.env.PRINTAVO_API_TOKEN;
    await expect(executeQuery('query { x }', {})).rejects.toThrow(/credentials not configured/);
  });

  it('throws on non-2xx HTTP', async () => {
    const fetchImpl = makeFetch({ status: 500, body: { error: 'oops' }, ok: false });
    await expect(executeQuery('query { x }', {}, { fetchImpl })).rejects.toThrow(/HTTP 500/);
  });
});
