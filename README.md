# Printavo MCP Server (TypeScript)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that wraps Printavo's GraphQL API v2. Designed for use as a remote connector with Claude, Perplexity, or any MCP-compatible client.

This is a TypeScript rewrite of the original [`watson-pierbras/printavo-mcp-server`](https://github.com/watson-pierbras/printavo-mcp-server) with stricter typing, Zod-validated inputs, timing-safe authentication, structured logging, and tests.

## Scope

This server exposes **14 tools** — 11 read-only and 3 mutations (line items only).

| # | Tool | Read / Write |
|---|------|--------------|
| 1 | `printavo_search_invoices` | Read |
| 2 | `printavo_get_invoice_detail` | Read |
| 3 | `printavo_search_customers` | Read |
| 4 | `printavo_get_customer_detail` | Read |
| 5 | `printavo_list_statuses` | Read |
| 6 | `printavo_get_account_info` | Read |
| 7 | `printavo_get_order_stats` | Read |
| 8 | `printavo_get_production_schedule` | Read |
| 9 | `printavo_list_pricing_matrices` | Read |
| 10 | `printavo_get_pricing_matrix` | Read |
| 11 | `printavo_calculate_matrix_price` | Read (calculator only) |
| 12 | `printavo_add_line_item` | **Write** |
| 13 | `printavo_update_line_item` | **Write** |
| 14 | `printavo_update_line_item_sizes` | **Write** |

Mutations only touch line items on existing orders; they cannot create or delete invoices, customers, or any other top-level objects.

## Features

- Streamable HTTP transport in stateless mode — works with multi-instance deployments and remote MCP clients.
- Bearer-token authentication on `/mcp`, compared with `crypto.timingSafeEqual`.
- Configurable CORS origins (`ALLOWED_ORIGINS=https://...,https://...` or `*`).
- Built-in Printavo rate limiting (sliding window, ≤8 req/5s) with exponential backoff on 429.
- Structured logging via Pino — pretty in dev, JSON in production.
- Zod-validated tool inputs with `.strict()` to catch typos.
- All tools support `response_format: "markdown" | "json"` for human or programmatic consumption.
- Vitest test suite for formatters, schemas, auth, and the API client.
- Multi-stage Docker build, runs as a non-root user.

## Setup

### Prerequisites

- Node.js 18+ (or Docker)
- A Printavo account with API access (token at **My Account → API**)

### Install and configure

```bash
git clone <your-repo> printavo-mcp-server-claude
cd printavo-mcp-server-claude
npm install
cp .env.example .env
# edit .env — see below
```

Required environment variables:

| Variable | Purpose |
|----------|---------|
| `PRINTAVO_EMAIL` | Your Printavo login email |
| `PRINTAVO_API_TOKEN` | Your Printavo API token |
| `OAUTH_ISSUER_URL` | Public base URL of this server (e.g. `https://your-app.up.railway.app`), no trailing slash |
| `OAUTH_JWT_SECRET` | Signing secret for access-token JWTs (32+ bytes random) |
| `OAUTH_USERS` | JSON array of `{"email", "password_hash"}` — the humans allowed to log in |

Optional:

| Variable | Default | Purpose |
|----------|---------|---------|
| `MCP_API_KEY` | _(unset)_ | Static Bearer key accepted alongside OAuth JWTs — debug/curl fallback |
| `PORT` | `3000` | HTTP port |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS origins |
| `LOG_LEVEL` | `info` | Pino log level |
| `NODE_ENV` | `development` | `production` switches Pino to JSON |

Generate secrets:

```bash
# JWT signing secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# bcrypt hash for a new user
node -e "console.log(require('bcryptjs').hashSync('the-password', 12))"
```

## Authentication

The server accepts two auth methods on `POST /mcp`:

1. **OAuth 2.1 Bearer (primary, used by Claude).** Clients discover the authorization server via `/.well-known/oauth-protected-resource`, optionally auto-register via `POST /register` (RFC 7591 Dynamic Client Registration), redirect the user to `/authorize` for email/password login + PKCE, then exchange the code at `/token` for an HS256 JWT access token and rotating refresh token. The JWT is presented on every `/mcp` call.

2. **Static `MCP_API_KEY` (optional).** If the env var is set, any matching Bearer token is accepted. Intended for curl testing, CI, or recovery — leave unset in production for OAuth-only operation.

Access tokens are JWTs (`aud` = `<issuer>/mcp`, `iss` = issuer URL, `sub` = user email, 1h expiry). Refresh tokens are opaque random strings with 30-day expiry. All OAuth state (registered clients, auth codes, refresh tokens) is in-memory — a redeploy forces re-authentication. For persistence, swap in a Postgres-backed store (`src/oauth/store.ts`).

Adding more users:

```bash
# 1. Generate a hash for the new user's password:
node -e "console.log(require('bcryptjs').hashSync('their-password', 12))"
# 2. Append their entry to OAUTH_USERS in Railway / your env:
# [{"email":"a@x.com","password_hash":"$2b$..."},{"email":"b@x.com","password_hash":"$2b$..."}]
# 3. Redeploy.
```

### Build and run

```bash
npm run build
npm start
# or in dev with auto-reload:
npm run dev
```

The server listens on port 3000 by default. Health check: `GET http://localhost:3000/`.

### Tests and typecheck

```bash
npm run typecheck
npm test
```

## Deployment

### Docker

```bash
docker build -t printavo-mcp-claude .
docker run -d -p 3000:3000 \
  -e PRINTAVO_EMAIL=you@example.com \
  -e PRINTAVO_API_TOKEN=your_token \
  -e MCP_API_KEY=your_secret \
  --name printavo-mcp-claude \
  printavo-mcp-claude
```

### Railway / Render / Fly.io

Push to a Git repo, point the platform at the Dockerfile, set the three required env vars in the platform's secrets panel. Health check path is `/`.

## Connecting an MCP client

### Perplexity

1. **Settings → Connectors → Add custom connector**
2. **URL**: `https://your-deployment.example.com/mcp`
3. **Authentication**: API Key
4. **API Key**: your `MCP_API_KEY` value

Perplexity sends `Authorization: Bearer <key>` on every request.

### Generic MCP HTTP client

```
POST https://your-deployment.example.com/mcp
Authorization: Bearer <MCP_API_KEY>
Content-Type: application/json
Accept: application/json
```

## API Reference

See [`src/schemas/index.ts`](src/schemas/index.ts) for the authoritative input schemas. Every tool also accepts `response_format: "markdown" | "json"`.

### Read tools — quick reference

| Tool | Required | Optional |
|------|----------|----------|
| `printavo_search_invoices` | – | `start_date`, `end_date`, `status_ids`, `payment_status` (PAID/UNPAID/PARTIAL), `query`, `limit`, `after` |
| `printavo_get_invoice_detail` | `visual_id` | – |
| `printavo_search_customers` | – | `query`, `limit`, `after` |
| `printavo_get_customer_detail` | `id` | – |
| `printavo_list_statuses` | – | – |
| `printavo_get_account_info` | – | – |
| `printavo_get_order_stats` | `start_date`, `end_date` | `status_ids` |
| `printavo_get_production_schedule` | – | `start_date`, `end_date`, `exclude_status_ids` |
| `printavo_list_pricing_matrices` | – | `type_of_work`, `name_contains` |
| `printavo_get_pricing_matrix` | one of `id`/`name` | – |
| `printavo_calculate_matrix_price` | `matrix_column_id`, `quantity` | `additional_column_ids`, `type_of_work_id`, `blank_cost`, `details` |

### Mutation tools

| Tool | Required | Optional |
|------|----------|----------|
| `printavo_add_line_item` | `line_item_group_id`, `description`, `position` | `item_number`, `color`, `price`, `taxed`, `sizes` |
| `printavo_update_line_item` | `id`, `position` | `description`, `item_number`, `color`, `price`, `taxed` |
| `printavo_update_line_item_sizes` | `id`, `position`, `sizes` | – |

## Architecture

```
Client (Claude/Perplexity/etc) → POST /mcp (Bearer auth) → Express
                                                              ↓
                                              McpServer (stateless, per-request)
                                                              ↓
                                                   tool handler (Zod-validated)
                                                              ↓
                                            Printavo GraphQL API (rate-limited)
```

A fresh `McpServer` and `StreamableHTTPServerTransport` are created for every HTTP request and discarded after the response. This keeps the design compatible with horizontal scaling and serverless platforms.

## Project layout

```
src/
├── index.ts              # Express app, transport, bootstrap
├── auth.ts               # Timing-safe Bearer middleware
├── logger.ts             # Pino logger
├── constants.ts          # Endpoints, rate limits, CHARACTER_LIMIT
├── types.ts              # GraphQL response types and ResponseFormat enum
├── schemas/
│   └── index.ts          # All Zod input schemas
├── services/
│   ├── printavo-client.ts  # GraphQL client, rate limiter, paginator
│   ├── queries.ts          # GraphQL query/mutation strings
│   └── formatters.ts       # Currency, date, sizes, truncation helpers
└── tools/
    ├── index.ts          # registerAllTools()
    ├── _helpers.ts       # toolResult() helper
    ├── invoices.ts
    ├── customers.ts
    ├── account.ts
    ├── stats.ts
    ├── pricing.ts
    └── line-items.ts
tests/                    # Vitest suites
Dockerfile                # Multi-stage, non-root
```

## Security notes

- Mutations exist. Tools 12–14 modify line items on existing orders. Annotations expose `readOnlyHint: false` so MCP clients can prompt the user before invoking them.
- Bearer tokens are compared with `crypto.timingSafeEqual` to avoid timing attacks.
- Printavo credentials are read from environment variables and never echoed in responses.
- The container runs as a non-root user.
- CORS defaults to `*` for ease of setup. **Set `ALLOWED_ORIGINS` to a specific list in production.**
- Rate limiting is client-side (≤8 req/5s) plus exponential backoff on 429 — protects you from accidentally tripping Printavo's 10 req/5s limit.

## License

MIT — see [LICENSE](LICENSE).
