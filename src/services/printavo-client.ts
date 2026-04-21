/**
 * Printavo GraphQL client with built-in rate limiting and retry logic.
 *
 * Printavo's documented rate limit is 10 req / 5s. We target 8 req / 5s
 * to leave headroom for incidental traffic.
 */

import {
  PRINTAVO_ENDPOINT,
  RATE_WINDOW_MS,
  MAX_REQUESTS_PER_WINDOW,
  MAX_RETRY_ATTEMPTS,
  PAGINATION_PAGE_DELAY_MS,
  DEFAULT_MAX_PAGES,
} from '../constants.js';

interface GraphQLError {
  message: string;
  path?: string[];
  extensions?: Record<string, unknown>;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

/** Custom error type so callers can branch on Printavo failures specifically. */
export class PrintavoApiError extends Error {
  readonly status?: number;
  readonly graphqlErrors?: GraphQLError[];

  constructor(message: string, opts: { status?: number; graphqlErrors?: GraphQLError[] } = {}) {
    super(message);
    this.name = 'PrintavoApiError';
    this.status = opts.status;
    this.graphqlErrors = opts.graphqlErrors;
  }
}

/** Sliding-window rate limiter state — module-scoped so all clients share it. */
const requestTimestamps: number[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  // Purge timestamps outside the window
  while (requestTimestamps.length > 0 && requestTimestamps[0]! <= now - RATE_WINDOW_MS) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = requestTimestamps[0]!;
    const waitUntil = oldest + RATE_WINDOW_MS + 10; // 10ms safety buffer
    const waitMs = waitUntil - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    while (requestTimestamps.length > 0 && requestTimestamps[0]! <= Date.now() - RATE_WINDOW_MS) {
      requestTimestamps.shift();
    }
  }

  requestTimestamps.push(Date.now());
}

interface ExecuteQueryOptions {
  attempt?: number;
  /** Optional custom fetch — useful for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Execute a GraphQL query/mutation against the Printavo API.
 * Retries on 429 with exponential backoff.
 *
 * Throws {@link PrintavoApiError} for any failure mode.
 */
export async function executeQuery<TData = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  options: ExecuteQueryOptions = {},
): Promise<TData> {
  const { attempt = 1, fetchImpl = fetch } = options;

  const email = process.env.PRINTAVO_EMAIL;
  const token = process.env.PRINTAVO_API_TOKEN;
  if (!email || !token) {
    throw new PrintavoApiError(
      'Printavo credentials not configured. Set PRINTAVO_EMAIL and PRINTAVO_API_TOKEN.',
    );
  }

  await waitForRateLimit();

  let response: Response;
  try {
    response = await fetchImpl(PRINTAVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        email,
        token,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (networkError) {
    const msg = networkError instanceof Error ? networkError.message : String(networkError);
    throw new PrintavoApiError(`Network error connecting to Printavo API: ${msg}`);
  }

  // Retry on 429 with exponential backoff
  if (response.status === 429) {
    if (attempt > MAX_RETRY_ATTEMPTS) {
      throw new PrintavoApiError(
        'Printavo API rate limit exceeded after multiple retries. Please try again later.',
        { status: 429 },
      );
    }
    const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 30_000);
    // eslint-disable-next-line no-console
    console.warn(`Printavo rate-limited (attempt ${attempt}). Retrying in ${backoffMs}ms.`);
    await sleep(backoffMs);
    return executeQuery<TData>(query, variables, { ...options, attempt: attempt + 1 });
  }

  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      /* ignore */
    }
    throw new PrintavoApiError(
      `Printavo API HTTP ${response.status}: ${body.slice(0, 200)}`,
      { status: response.status },
    );
  }

  let json: GraphQLResponse<TData>;
  try {
    json = (await response.json()) as GraphQLResponse<TData>;
  } catch (parseError) {
    const msg = parseError instanceof Error ? parseError.message : String(parseError);
    throw new PrintavoApiError(`Failed to parse Printavo API response: ${msg}`);
  }

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map((e) => e.message).join('; ');
    throw new PrintavoApiError(`Printavo GraphQL error: ${messages}`, {
      graphqlErrors: json.errors,
    });
  }

  if (!json.data) {
    throw new PrintavoApiError('Printavo API returned an empty response with no data.');
  }

  return json.data;
}

/**
 * Paginate through all results of a query, fetching up to `maxPages` pages.
 *
 * @param query GraphQL query that accepts an `$after` cursor
 * @param baseVariables Variables to pass on every page (excluding `after`)
 * @param collectionPath Dot-separated path to the connection within the response
 *                       (e.g. `"orders"` to access `data.orders.nodes/pageInfo`)
 */
export async function paginateQuery<TNode = unknown>(
  query: string,
  baseVariables: Record<string, unknown>,
  collectionPath: string,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<TNode[]> {
  const allNodes: TNode[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const variables = { ...baseVariables, after: cursor };
    const data = await executeQuery<Record<string, unknown>>(query, variables);

    // Navigate the dot-separated path
    const collection = collectionPath
      .split('.')
      .reduce<unknown>((obj, key) => (obj as Record<string, unknown> | null)?.[key], data) as
      | { nodes?: TNode[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } }
      | undefined;

    if (!collection) {
      throw new PrintavoApiError(
        `Could not find collection at path "${collectionPath}" in response`,
      );
    }

    allNodes.push(...(collection.nodes ?? []));
    pageCount++;

    if (!collection.pageInfo?.hasNextPage) break;
    cursor = collection.pageInfo.endCursor ?? null;

    if (pageCount < maxPages) {
      await sleep(PAGINATION_PAGE_DELAY_MS);
    }
  }

  return allNodes;
}

/** Reset internal rate-limiter state — exposed for tests only. */
export function _resetRateLimiterForTests(): void {
  requestTimestamps.length = 0;
}
