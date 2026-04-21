/**
 * Invoice / order tool handlers.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeQuery } from '../services/printavo-client.js';
import {
  SEARCH_INVOICES_QUERY,
  GET_ORDER_DETAIL_QUERY,
} from '../services/queries.js';
import {
  formatCurrency,
  formatDate,
  formatAddress,
  formatSizes,
  truncateMarkdown,
} from '../services/formatters.js';
import {
  SearchInvoicesSchema,
  GetInvoiceDetailSchema,
  type SearchInvoicesInput,
  type GetInvoiceDetailInput,
} from '../schemas/index.js';
import { CHARACTER_LIMIT } from '../constants.js';
import { ResponseFormat, type OrdersResponse, type Quote } from '../types.js';
import { toolResult } from './_helpers.js';

function renderInvoicesMarkdown(nodes: Quote[], hasMore: boolean, endCursor: string | null): string {
  if (nodes.length === 0) return 'No invoices found matching the given criteria.';

  const lines: string[] = [
    `# Invoices (${nodes.length}${hasMore ? ', more available' : ''})`,
    '',
  ];
  for (const inv of nodes) {
    lines.push(`## Order #${inv.visualId ?? 'N/A'} (ID: ${inv.id})`);
    if (inv.nickname) lines.push(`- **Name**: ${inv.nickname}`);
    lines.push(`- **Customer**: ${inv.contact?.fullName ?? 'N/A'}`);
    lines.push(`- **Status**: ${inv.status?.name ?? 'N/A'}`);
    lines.push(
      `- **Total**: ${formatCurrency(inv.total)} | Qty: ${inv.totalQuantity ?? 'N/A'} | Paid: ${
        inv.paidInFull ? 'Yes' : 'No'
      }`,
    );
    lines.push(
      `- **Due**: ${formatDate(inv.dueAt)} | Tags: ${(inv.tags ?? []).join(', ') || 'none'}`,
    );
    if (inv.productionNote) lines.push(`- **Note**: ${inv.productionNote}`);
    lines.push('');
  }
  if (hasMore && endCursor) lines.push(`_Next page cursor: \`${endCursor}\`_`);
  return lines.join('\n');
}

export function registerInvoiceTools(server: McpServer): void {
  server.registerTool(
    'printavo_search_invoices',
    {
      title: 'Search Printavo Invoices',
      description: `Search Printavo invoices/orders with optional filters.

Filters: date range (production start/due), status IDs, payment status, free-text query.
Returns paginated list with key details (customer, status, total, qty, due date).

Common uses:
  - "Show unpaid invoices from last month" → payment_status="UNPAID", date range
  - "Find orders for ACME Corp" → query="ACME"
  - "What's due next week?" → start/end_date around target week

Returns:
  Markdown list (default) or JSON: { count, has_more, next_cursor, invoices: [...] }`,
      inputSchema: SearchInvoicesSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: SearchInvoicesInput = SearchInvoicesSchema.parse(rawArgs);
      const variables: Record<string, unknown> = { first: args.limit };
      if (args.after) variables.after = args.after;
      if (args.start_date) variables.inProductionAfter = args.start_date;
      if (args.end_date) variables.inProductionBefore = args.end_date;
      if (args.status_ids?.length) variables.statusIds = args.status_ids;
      if (args.payment_status) variables.paymentStatus = args.payment_status;
      if (args.query) variables.query = args.query;

      const data = await executeQuery<OrdersResponse>(SEARCH_INVOICES_QUERY, variables);
      const nodes = data.orders?.nodes ?? [];
      const pageInfo = data.orders?.pageInfo ?? { hasNextPage: false, endCursor: null };

      const structured = {
        count: nodes.length,
        has_more: pageInfo.hasNextPage,
        next_cursor: pageInfo.hasNextPage ? pageInfo.endCursor : undefined,
        invoices: nodes,
      };

      const text =
        args.response_format === ResponseFormat.JSON
          ? JSON.stringify(structured, null, 2)
          : renderInvoicesMarkdown(nodes, pageInfo.hasNextPage, pageInfo.endCursor);

      return toolResult(truncateMarkdown(text, CHARACTER_LIMIT), structured);
    },
  );

  server.registerTool(
    'printavo_get_invoice_detail',
    {
      title: 'Get Printavo Invoice Detail',
      description: `Get complete detail for a Printavo order by visual ID (e.g. "12345").

Includes: line items with sizes, pricing, categories, imprint methods, fees,
billing/shipping, customer/owner contact info.

Note: visual_id is the customer-facing order number, NOT the internal database ID.

Returns:
  Markdown report (default) or JSON with full order structure.`,
      inputSchema: GetInvoiceDetailSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: GetInvoiceDetailInput = GetInvoiceDetailSchema.parse(rawArgs);
      const data = await executeQuery<OrdersResponse>(GET_ORDER_DETAIL_QUERY, {
        first: 1,
        query: String(args.visual_id),
      });
      const inv = data.orders?.nodes?.[0];
      if (!inv) {
        const msg = `No order found with visual ID: ${args.visual_id}`;
        return toolResult(msg, { found: false, visual_id: args.visual_id });
      }

      let text: string;
      if (args.response_format === ResponseFormat.JSON) {
        text = JSON.stringify(inv, null, 2);
      } else {
        const lines: string[] = [
          `# Order #${inv.visualId ?? 'N/A'} — ${inv.nickname ?? ''}`,
          '',
          `**Status**: ${inv.status?.name ?? 'N/A'}`,
          `**Customer**: ${inv.contact?.fullName ?? 'N/A'} (${inv.contact?.email ?? 'N/A'})`,
          `**Owner**: ${inv.owner?.email ?? 'N/A'}`,
          '',
          `**Total**: ${formatCurrency(inv.total)} | Paid: ${formatCurrency(
            inv.amountPaid,
          )} | Outstanding: ${formatCurrency(inv.amountOutstanding)}`,
          `**Qty**: ${inv.totalQuantity ?? 'N/A'} | Paid in Full: ${
            inv.paidInFull ? 'Yes' : 'No'
          }`,
          `**Created**: ${formatDate(inv.createdAt)} | Start: ${formatDate(
            inv.startAt,
          )} | Due: ${formatDate(inv.dueAt)}`,
          `**Tags**: ${(inv.tags ?? []).join(', ') || 'none'}`,
          `**Delivery**: ${inv.deliveryMethod?.name ?? 'N/A'}`,
          `**Ship to**: ${formatAddress(inv.shippingAddress) ?? 'N/A'}`,
          '',
        ];
        if (inv.productionNote) lines.push(`**Production Note**: ${inv.productionNote}`, '');
        if (inv.customerNote) lines.push(`**Customer Note**: ${inv.customerNote}`, '');

        const groups = inv.lineItemGroups?.nodes ?? [];
        if (groups.length > 0) {
          lines.push('## Line Items');
          for (const g of groups) {
            lines.push(`**Group**: \`${g.id}\``);
            const imprints = (g.imprints?.nodes ?? [])
              .map((i) => [i.typeOfWork?.name, i.details].filter(Boolean).join(': '))
              .filter(Boolean)
              .join('; ');
            if (imprints) lines.push(`**Imprint**: ${imprints}`);
            for (const li of g.lineItems?.nodes ?? []) {
              const prod = li.product;
              const prodStr = [prod?.itemNumber, prod?.description, prod?.brand, prod?.color]
                .filter(Boolean)
                .join(' / ');
              lines.push(
                `- [${li.category?.name ?? 'No Category'}] **${
                  li.description ?? 'N/A'
                }** (Line ID: \`${li.id}\`, Pos: ${li.position ?? 'N/A'})`,
              );
              if (prodStr) lines.push(`    - Product: ${prodStr}`);
              if (li.color) lines.push(`    - Color: ${li.color}`);
              if (li.itemNumber) lines.push(`    - Item #: ${li.itemNumber}`);
              lines.push(
                `    - Qty: ${li.items ?? 'N/A'} @ ${formatCurrency(li.price)} = ${formatCurrency(
                  (li.items ?? 0) * (li.price ?? 0),
                )}`,
              );
              const sizes = formatSizes(li.sizes);
              if (sizes) lines.push(`    - Sizes: ${sizes}`);
            }
            lines.push('');
          }
        }

        const fees = inv.fees?.nodes ?? [];
        if (fees.length > 0) {
          lines.push('## Fees');
          for (const f of fees)
            lines.push(`- ${f.description ?? 'Fee'}: ${formatCurrency(f.amount)}`);
        }

        text = lines.join('\n');
      }

      return toolResult(truncateMarkdown(text, CHARACTER_LIMIT), inv);
    },
  );
}
