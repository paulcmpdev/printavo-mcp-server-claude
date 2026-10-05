import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerLineItemTools } from '../src/tools/line-items.js';
import { AddLineItemSchema, UpdateLineItemSizesSchema } from '../src/schemas/index.js';
import { _resetRateLimiterForTests } from '../src/services/printavo-client.js';
import {
  LINE_ITEM_CREATE_MUTATION,
  LINE_ITEM_UPDATE_MUTATION,
} from '../src/services/queries.js';

const invalidSizes = [
  {}, { S: -1 }, { S: 1.5 }, { S: '' }, { S: ' ' }, { S: '12shirts' },
  { S: '1.5' }, { S: '-1' }, { S: '1e2' }, { S: '0x10' },
  { S: 'NaN' }, { S: 'Infinity' }, { S: '9007199254740992' },
  { S: 1, size_s: 0 }, { XXL: 2, '2XL': 2 }, { FOO: null },
  { OTHER: null, S: 5, M: 'bad' }, { S: true }, { S: [] }, { S: {} },
  { S: 2147483648 }, { S: '2147483648' },
];

const prototypeKeyMaps = ['__proto__', 'constructor', 'prototype'].map(
  (key) => JSON.parse(`{"${key}":1}`) as Record<string, number>,
);

describe('size update schemas', () => {
  it('accepts null clears only for updates', () => {
    expect(UpdateLineItemSizesSchema.parse({ id: 'local-test', position: 1, sizes: { S: null } }).sizes).toEqual({ S: null });
    expect(AddLineItemSchema.safeParse({ line_item_group_id: 'local-group', description: 'Tee', position: 1, sizes: { S: null } }).success).toBe(false);
  });
  it.each([...invalidSizes, { S: NaN }, { S: Infinity }, { S: -Infinity }])('rejects invalid update map %j', (sizes) => {
    expect(UpdateLineItemSizesSchema.safeParse({ id: 'local-test', position: 1, sizes }).success).toBe(false);
  });
  it.each(prototypeKeyMaps)('rejects own prototype-related keys before record parsing %j', (sizes) => {
    expect(UpdateLineItemSizesSchema.safeParse({ id: 'local-test', position: 1, sizes }).success).toBe(false);
  });
  it('rejects inherited and non-plain size maps before record parsing', () => {
    const inherited = Object.create({ S: 1 }) as Record<string, number>;
    inherited.M = 2;
    expect(UpdateLineItemSizesSchema.safeParse({ id: 'local-test', position: 1, sizes: inherited }).success).toBe(false);
    expect(AddLineItemSchema.safeParse({
      line_item_group_id: 'local-group', description: 'Tee', position: 1, sizes: inherited,
    }).success).toBe(false);
    expect(UpdateLineItemSizesSchema.safeParse({ id: 'local-test', position: 1, sizes: new Map([['S', 1]]) }).success).toBe(false);
  });
});

describe('registered MCP size tool and real GraphQL serialization (mock HTTP)', () => {
  let server: McpServer;
  let client: Client;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    _resetRateLimiterForTests();
    vi.stubEnv('PRINTAVO_EMAIL', 'local-test@example.invalid');
    vi.stubEnv('PRINTAVO_API_TOKEN', 'local-test-not-a-token');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    server = new McpServer({ name: 'local-size-test', version: '1.0.0' });
    registerLineItemTools(server);
    client = new Client({ name: 'local-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });
  function respondWith(lineItemUpdate: unknown): void {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { lineItemUpdate } }), { status: 200 }));
  }
  function structured(result: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> {
    return result.structuredContent as Record<string, unknown>;
  }
  afterEach(async () => {
    await client.close();
    await server.close();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('advertises nullable outbound clears, bounded counts and destructive mutation annotations', async () => {
    const { tools } = await client.listTools();
    const update = tools.find((tool) => tool.name === 'printavo_update_line_item_sizes')!;
    const add = tools.find((tool) => tool.name === 'printavo_add_line_item')!;
    expect(JSON.stringify(update.inputSchema.properties?.sizes)).toContain('"type":"null"');
    expect(JSON.stringify(add.inputSchema.properties?.sizes)).not.toContain('"type":"null"');
    expect(update.description).toMatch(/null.*clear request/i);
    expect(update.description).toMatch(/omitted.*not sent/i);
    expect(update.description).toMatch(/persistence.*unverified/i);
    expect(update.description).not.toMatch(/replace|set to 0/i);
    expect(JSON.stringify(update.inputSchema.properties?.sizes)).toContain('2147483647');
    expect(update.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true });
    expect(add.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
  });
  it('advertises zero-based bounded positions and optional category identifiers for all three tools', async () => {
    const { tools } = await client.listTools();
    for (const name of [
      'printavo_add_line_item',
      'printavo_update_line_item',
      'printavo_update_line_item_sizes',
    ]) {
      const tool = tools.find((candidate) => candidate.name === name)!;
      expect(tool.inputSchema.properties?.position).toMatchObject({
        type: 'integer', minimum: 0, maximum: 2147483647,
      });
    }
    for (const name of ['printavo_add_line_item', 'printavo_update_line_item']) {
      const tool = tools.find((candidate) => candidate.name === name)!;
      expect(tool.inputSchema.properties?.category_id).toMatchObject({ type: 'string', minLength: 1 });
      expect(tool.inputSchema.required).not.toContain('category_id');
    }
  });
  it('passes position zero unchanged in add, update, and size-update HTTP bodies', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { lineItemCreate: { id: 'synthetic-new', position: 0 } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { lineItemUpdate: { id: 'synthetic-update', position: 0 } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { lineItemUpdate: {
        id: 'synthetic-size', position: 0, sizes: [{ size: 'size_s', count: 1 }],
      } } }), { status: 200 }));

    await client.callTool({ name: 'printavo_add_line_item', arguments: {
      line_item_group_id: 'synthetic-group', description: 'Synthetic fixture', position: 0,
    } });
    await client.callTool({ name: 'printavo_update_line_item', arguments: {
      id: 'synthetic-update', position: 0,
    } });
    await client.callTool({ name: 'printavo_update_line_item_sizes', arguments: {
      id: 'synthetic-size', position: 0, sizes: { S: 1 },
    } });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).variables.input.position))
      .toEqual([0, 0, 0]);
  });
  it.each([
    ['printavo_add_line_item', { line_item_group_id: 'synthetic-group', description: 'Synthetic fixture' }],
    ['printavo_update_line_item', { id: 'synthetic-update' }],
    ['printavo_update_line_item_sizes', { id: 'synthetic-size', sizes: { S: 1 } }],
  ] as const)('rejects invalid positions for %s before HTTP', async (name, base) => {
    for (const position of [-1, 1.5, 2147483648]) {
      const result = await client.callTool({ name, arguments: { ...base, position } });
      expect(result.isError).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('serializes category as IDInput on add/update and keeps omission absent', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { lineItemCreate: { id: 'synthetic-add', position: 0 } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { lineItemUpdate: { id: 'synthetic-update', position: 0 } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { lineItemCreate: { id: 'synthetic-omit', position: 0 } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { lineItemUpdate: { id: 'synthetic-omit', position: 0 } } }), { status: 200 }));

    await client.callTool({ name: 'printavo_add_line_item', arguments: {
      line_item_group_id: 'synthetic-group', description: 'Synthetic fixture', position: 0,
      category_id: ' synthetic-category ',
    } });
    await client.callTool({ name: 'printavo_update_line_item', arguments: {
      id: 'synthetic-update', position: 0, category_id: 'synthetic-category',
    } });
    await client.callTool({ name: 'printavo_add_line_item', arguments: {
      line_item_group_id: 'synthetic-group', description: 'Synthetic fixture', position: 0,
    } });
    await client.callTool({ name: 'printavo_update_line_item', arguments: {
      id: 'synthetic-omit', position: 0,
    } });

    const inputs = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).variables.input);
    expect(inputs[0]).toMatchObject({ category: { id: ' synthetic-category ' } });
    expect(inputs[0]).not.toHaveProperty('categoryId');
    expect(inputs[1]).toMatchObject({ category: { id: 'synthetic-category' } });
    expect(inputs[2]).not.toHaveProperty('category');
    expect(inputs[3]).not.toHaveProperty('category');
    expect(LINE_ITEM_CREATE_MUTATION).toMatch(/category\s*\{\s*id\s+name\s*\}/);
    expect(LINE_ITEM_UPDATE_MUTATION).toMatch(/category\s*\{\s*id\s+name\s*\}/);
  });
  it.each(['', ' ', '\t\n'])('rejects invalid category %j before HTTP', async (category_id) => {
    for (const [name, arguments_] of [
      ['printavo_add_line_item', {
        line_item_group_id: 'synthetic-group', description: 'Synthetic fixture', position: 0, category_id,
      }],
      ['printavo_update_line_item', { id: 'synthetic-update', position: 0, category_id }],
    ] as const) {
      const result = await client.callTool({ name, arguments: arguments_ });
      expect(result.isError).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('serializes synthetic youth values with required fields', async () => {
    // Position and description are synthetic test data, NOT a business-write plan.
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: {
      lineItemCreate: { id: 'synthetic-youth', position: 7 },
    } }), { status: 200 }));
    const result = await client.callTool({ name: 'printavo_add_line_item', arguments: {
      line_item_group_id: 'synthetic-group', item_number: 'SYNTHETIC-SKU', price: 55,
      category_id: 'synthetic-category', sizes: { M: 3, L: 3 },
      position: 7, description: 'SYNTHETIC fixture only, not approved business description',
    } });
    expect(result.isError).not.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).variables).toEqual({
      lineItemGroupId: 'synthetic-group', input: {
        itemNumber: 'SYNTHETIC-SKU', price: 55, category: { id: 'synthetic-category' },
        sizes: [{ size: 'size_m', count: 3 }, { size: 'size_l', count: 3 }],
        position: 7, description: 'SYNTHETIC fixture only, not approved business description',
      },
    });
  });
  it('models a synthetic split-size case without inventing pending fields', async () => {
    const fixture = {
      visual_id: 'synthetic-visual', internal_id: 'synthetic-order',
      adult: {
        id: 'synthetic-adult', position: 0,
        sizes: { OTHER: null, XS: 8, S: 9, M: 17, L: 5, '2XL': 1 },
      },
      youth_pending_create: {
        line_item_group_id: 'synthetic-group', item_number: 'SYNTHETIC-SKU', price: 55,
        category_id: 'synthetic-category', sizes: { M: 3, L: 3 },
      },
    } as const;
    respondWith({ id: fixture.adult.id, position: 0, sizes: [
      { size: 'size_other', count: null }, { size: 'size_xs', count: 8 },
      { size: 'size_s', count: 9 }, { size: 'size_m', count: 17 },
      { size: 'size_l', count: 5 }, { size: 'size_2xl', count: 1 },
    ] });
    const result = await client.callTool({ name: 'printavo_update_line_item_sizes', arguments: fixture.adult });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).variables).toEqual({
      id: 'synthetic-adult', input: { position: 0, sizes: [
        { size: 'size_other', count: null }, { size: 'size_xs', count: 8 },
        { size: 'size_s', count: 9 }, { size: 'size_m', count: 17 },
        { size: 'size_l', count: 5 }, { size: 'size_2xl', count: 1 },
      ] },
    });
    expect(fixture.youth_pending_create).toEqual({
      line_item_group_id: 'synthetic-group', item_number: 'SYNTHETIC-SKU', price: 55,
      category_id: 'synthetic-category', sizes: { M: 3, L: 3 },
    });
    expect(fixture.youth_pending_create).not.toHaveProperty('position');
    expect(fixture.youth_pending_create).not.toHaveProperty('description');
    expect(fixture.youth_pending_create).not.toHaveProperty('color');
    expect(fixture.youth_pending_create).not.toHaveProperty('taxed');
  });
  it.each([2147483647, '2147483647'])('sends GraphQL Int maximum %s', async (count) => {
    respondWith({ id: 'local-test', position: 1, sizes: [{ size: 'size_s', count: 2147483647 }] });
    const result = await client.callTool({ name: 'printavo_update_line_item_sizes', arguments: {
      id: 'local-test', position: 1, sizes: { S: count },
    } });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).variables.input.sizes).toEqual([
      { size: 'size_s', count: 2147483647 },
    ]);
  });
  it('sends only explicit slots, retaining null and zero in the actual HTTP body', async () => {
    respondWith({ id: 'local-test', position: 1, sizes: [
      { size: 'size_3xl', count: null }, { size: 'size_other', count: null },
      { size: 'size_s', count: 0 }, { size: 'size_m', count: 12 },
    ] });
    const result = await client.callTool({ name: 'printavo_update_line_item_sizes', arguments: {
      id: 'local-test', position: 1, sizes: { '3XL': null, OTHER: null, S: 0, M: '012' }, response_format: 'json',
    } });
    expect(result.isError).not.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      query: LINE_ITEM_UPDATE_MUTATION,
      variables: { id: 'local-test', input: { position: 1, sizes: [
        { size: 'size_3xl', count: null }, { size: 'size_other', count: null },
        { size: 'size_s', count: 0 }, { size: 'size_m', count: 12 },
      ] } },
    });
  });
  it('accepts exact returned null and zero evidence and renders both in mutation Markdown', async () => {
    respondWith({ id: 'local-test', position: 1, sizes: [
      { size: 'size_s', count: null }, { size: 'size_m', count: 0 },
    ] });
    const result = await client.callTool({ name: 'printavo_update_line_item_sizes', arguments: {
      id: 'local-test', position: 1, sizes: { S: null, M: 0 },
    } });
    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('**Sizes**: size_s:(blank) size_m:0') }]);
  });
  it.each([
    ['ignored clear', { id: 'local-test', sizes: [{ size: 'size_s', count: 4 }] }],
    ['coerced clear to zero', { id: 'local-test', sizes: [{ size: 'size_s', count: 0 }] }],
    ['numeric mismatch', { id: 'local-test', sizes: [{ size: 'size_s', count: 6 }] }],
    ['missing requested slot', { id: 'local-test', sizes: [] }],
    ['missing sizes', { id: 'local-test' }],
    ['null sizes', { id: 'local-test', sizes: null }],
    ['non-array sizes', { id: 'local-test', sizes: {} }],
    ['malformed entry', { id: 'local-test', sizes: [{ size: 'size_s' }] }],
    ['malformed count', { id: 'local-test', sizes: [{ size: 'size_s', count: '5' }] }],
    ['wrong returned ID', { id: 'other-item', sizes: [{ size: 'size_s', count: 5 }] }],
  ])('returns reconciliation evidence for %s', async (name, observed) => {
    respondWith(observed);
    const requested = name === 'ignored clear' || name === 'coerced clear to zero'
      ? { S: null }
      : { S: 5 };
    const result = await client.callTool({ name: 'printavo_update_line_item_sizes', arguments: {
      id: 'local-test', position: 1, sizes: requested,
    } });
    expect(result.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(structured(result)).toEqual({
      status: 'reconciliation_required',
      target: { id: 'local-test' },
      requested: [{ size: 'size_s', count: requested.S }],
      observed,
    });
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect((result.content[0] as { text: string }).text).toMatch(/reconciliation required/i);
  });
  it.each([null, undefined, [], 'bad response'])('rejects invalid mutation result shape %j', async (observed) => {
    respondWith(observed);
    const result = await client.callTool({ name: 'printavo_update_line_item_sizes', arguments: {
      id: 'local-test', position: 1, sizes: { S: 5 },
    } });
    expect(result.isError).toBe(true);
    expect(structured(result)).toEqual({
      status: 'reconciliation_required', target: { id: 'local-test' },
      requested: [{ size: 'size_s', count: 5 }], observed: observed ?? null,
    });
  });
  it.each(invalidSizes)('rejects invalid map before any HTTP call %j', async (sizes) => {
    const result = await client.callTool({ name: 'printavo_update_line_item_sizes', arguments: { id: 'local-test', position: 1, sizes } });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    [{ FOO: 1 }, ['Unknown size:', 'FOO', 'Valid:']],
    [{ XXL: 1, '2XL': 2 }, ['Duplicate size:', '2XL', 'maps to size_2xl']],
  ] as const)('returns an actionable validation error for %j', async (sizes, messages) => {
    const result = await client.callTool({ name: 'printavo_update_line_item_sizes', arguments: {
      id: 'local-test', position: 1, sizes,
    } });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    for (const message of messages) expect(text).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(prototypeKeyMaps)('rejects own prototype-related map in the registered tool %j', async (sizes) => {
    const result = await client.callTool({ name: 'printavo_update_line_item_sizes', arguments: {
      id: 'local-test', position: 1, sizes,
    } });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps create compatible with numeric strings and zero', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { lineItemCreate: { id: 'local-new', position: 1 } } }), { status: 200 }));
    const result = await client.callTool({ name: 'printavo_add_line_item', arguments: {
      line_item_group_id: 'local-group', description: 'Tee', position: 1, sizes: { S: ' 012 ', M: 0 },
    } });
    expect(result.isError).not.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).variables).toEqual({
      lineItemGroupId: 'local-group', input: { description: 'Tee', position: 1, sizes: [
        { size: 'size_s', count: 12 }, { size: 'size_m', count: 0 },
      ] },
    });
  });
  it('documents and sends an empty create size map as an explicit empty list', async () => {
    respondWith({ id: 'local-new', position: 1, sizes: [] });
    const result = await client.callTool({ name: 'printavo_add_line_item', arguments: {
      line_item_group_id: 'local-group', description: 'Tee', position: 1, sizes: {},
    } });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).variables.input.sizes).toEqual([]);
  });
  it('does not widen create to allow null', async () => {
    const result = await client.callTool({ name: 'printavo_add_line_item', arguments: {
      line_item_group_id: 'local-group', description: 'Tee', position: 1, sizes: { S: null },
    } });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
