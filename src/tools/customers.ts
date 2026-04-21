/**
 * Customer / contact tool handlers.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeQuery } from '../services/printavo-client.js';
import {
  SEARCH_CUSTOMERS_QUERY,
  GET_CUSTOMER_DETAIL_QUERY,
} from '../services/queries.js';
import { truncateMarkdown } from '../services/formatters.js';
import {
  SearchCustomersSchema,
  GetCustomerDetailSchema,
  type SearchCustomersInput,
  type GetCustomerDetailInput,
} from '../schemas/index.js';
import { CHARACTER_LIMIT } from '../constants.js';
import {
  ResponseFormat,
  type CustomersResponse,
  type ContactDetailResponse,
  type Customer,
} from '../types.js';
import { toolResult } from './_helpers.js';

function renderCustomersMarkdown(
  nodes: Customer[],
  totalNodes: number | undefined,
  hasMore: boolean,
  endCursor: string | null,
  query?: string,
): string {
  if (nodes.length === 0) {
    return query ? `No customers found matching "${query}".` : 'No customers found.';
  }
  const lines: string[] = [
    `# Customers (${nodes.length}${totalNodes ? ` of ${totalNodes}` : ''})`,
    '',
  ];
  for (const c of nodes) {
    const pc = c.primaryContact;
    lines.push(`## ${c.companyName ?? pc?.fullName ?? 'N/A'}`);
    lines.push(`- **ID**: \`${c.id}\``);
    if (pc?.fullName && c.companyName) lines.push(`- **Contact**: ${pc.fullName}`);
    if (pc?.email) lines.push(`- **Email**: ${pc.email}`);
    if (pc?.phone) lines.push(`- **Phone**: ${pc.phone}`);
    lines.push(`- **Orders**: ${c.orderCount ?? 'N/A'}`);
    lines.push('');
  }
  if (hasMore && endCursor) lines.push(`_Next page cursor: \`${endCursor}\`_`);
  return lines.join('\n');
}

export function registerCustomerTools(server: McpServer): void {
  server.registerTool(
    'printavo_search_customers',
    {
      title: 'Search Printavo Customers',
      description: `Search/list Printavo customers with pagination.

The Printavo customers query does not support a server-side text search, so the
optional \`query\` parameter applies a client-side substring filter on companyName,
primary contact name, and email. For best results pull a wider \`limit\` and filter.

Returns:
  Markdown list (default) or JSON: { count, total, has_more, next_cursor, customers: [...] }`,
      inputSchema: SearchCustomersSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: SearchCustomersInput = SearchCustomersSchema.parse(rawArgs);
      const variables: Record<string, unknown> = { first: args.limit };
      if (args.after) variables.after = args.after;

      const data = await executeQuery<CustomersResponse>(SEARCH_CUSTOMERS_QUERY, variables);
      let nodes = data.customers?.nodes ?? [];
      const pageInfo = data.customers?.pageInfo ?? { hasNextPage: false, endCursor: null };
      const totalNodes = data.customers?.totalNodes;

      if (args.query) {
        const q = args.query.toLowerCase();
        nodes = nodes.filter(
          (c) =>
            c.companyName?.toLowerCase().includes(q) ||
            c.primaryContact?.fullName?.toLowerCase().includes(q) ||
            c.primaryContact?.email?.toLowerCase().includes(q),
        );
      }

      const structured = {
        count: nodes.length,
        total: totalNodes,
        has_more: pageInfo.hasNextPage,
        next_cursor: pageInfo.hasNextPage ? pageInfo.endCursor : undefined,
        customers: nodes,
      };

      const text =
        args.response_format === ResponseFormat.JSON
          ? JSON.stringify(structured, null, 2)
          : renderCustomersMarkdown(
              nodes,
              totalNodes,
              pageInfo.hasNextPage,
              pageInfo.endCursor,
              args.query,
            );

      return toolResult(truncateMarkdown(text, CHARACTER_LIMIT), structured);
    },
  );

  server.registerTool(
    'printavo_get_customer_detail',
    {
      title: 'Get Printavo Customer Detail',
      description: `Get detailed information for a specific Printavo contact by ID.

Returns the contact along with their parent customer (company) including order count
and internal notes.`,
      inputSchema: GetCustomerDetailSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: GetCustomerDetailInput = GetCustomerDetailSchema.parse(rawArgs);
      const data = await executeQuery<ContactDetailResponse>(GET_CUSTOMER_DETAIL_QUERY, {
        id: args.id,
      });
      const c = data.contact;
      if (!c) {
        return toolResult(`No contact found with ID: ${args.id}`, { found: false, id: args.id });
      }

      let text: string;
      if (args.response_format === ResponseFormat.JSON) {
        text = JSON.stringify(c, null, 2);
      } else {
        const lines: string[] = [`# ${c.fullName ?? 'N/A'}`, '', `**ID**: \`${c.id}\``];
        if (c.email) lines.push(`**Email**: ${c.email}`);
        if (c.phone) lines.push(`**Phone**: ${c.phone}`);
        if (c.customer?.companyName) lines.push(`**Company**: ${c.customer.companyName}`);
        if (c.customer?.orderCount != null) lines.push(`**Total Orders**: ${c.customer.orderCount}`);
        if (c.customer?.internalNote) lines.push(`**Internal Note**: ${c.customer.internalNote}`);
        text = lines.join('\n');
      }

      return toolResult(text, c);
    },
  );
}
