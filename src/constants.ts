/**
 * Shared constants for the Printavo MCP server.
 */

export const PRINTAVO_ENDPOINT = 'https://www.printavo.com/api/v2';

/** Maximum response size in characters before truncation. */
export const CHARACTER_LIMIT = 25_000;

/**
 * Rate limiting: Printavo allows 10 req / 5s. We target 8 to leave headroom.
 */
export const RATE_WINDOW_MS = 5_000;
export const MAX_REQUESTS_PER_WINDOW = 8;

/** Maximum retry attempts on 429 before giving up. */
export const MAX_RETRY_ATTEMPTS = 4;

/** Delay between paginated query pages (ms). */
export const PAGINATION_PAGE_DELAY_MS = 500;

/** Default safety limit on paginated query pages. */
export const DEFAULT_MAX_PAGES = 50;
