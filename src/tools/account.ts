/**
 * Account-level tool handlers (statuses, account info).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeQuery } from '../services/printavo-client.js';
import {
  LIST_STATUSES_QUERY,
  GET_ACCOUNT_INFO_QUERY,
} from '../services/queries.js';
import {
  ListStatusesSchema,
  GetAccountInfoSchema,
  type ListStatusesInput,
  type GetAccountInfoInput,
} from '../schemas/index.js';
import { ResponseFormat, type AccountResponse, type StatusesResponse } from '../types.js';
import { toolResult } from './_helpers.js';

export function registerAccountTools(server: McpServer): void {
  server.registerTool(
    'printavo_list_statuses',
    {
      title: 'List Printavo Order Statuses',
      description: `List all order statuses configured in the Printavo account.

Each status has an ID, name, color, position, and type. Use the status IDs in
search_invoices, get_order_stats, get_production_schedule, etc.`,
      inputSchema: ListStatusesSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: ListStatusesInput = ListStatusesSchema.parse(rawArgs);
      const data = await executeQuery<StatusesResponse>(LIST_STATUSES_QUERY, {});
      const statuses = data.statuses?.nodes ?? [];

      const sorted = [...statuses].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const text =
        args.response_format === ResponseFormat.JSON
          ? JSON.stringify({ count: sorted.length, statuses: sorted }, null, 2)
          : sorted.length === 0
            ? 'No statuses found.'
            : [
                `# Order Statuses (${sorted.length})`,
                '',
                ...sorted.map(
                  (s) =>
                    `- **${s.name}** (ID: \`${s.id}\`) — Color: ${s.color ?? 'N/A'} | Type: ${
                      s.type ?? 'N/A'
                    }`,
                ),
              ].join('\n');

      return toolResult(text, { count: sorted.length, statuses: sorted });
    },
  );

  server.registerTool(
    'printavo_get_account_info',
    {
      title: 'Get Printavo Account Info',
      description: `Get basic Printavo account information: company name, contact info, address.`,
      inputSchema: GetAccountInfoSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: GetAccountInfoInput = GetAccountInfoSchema.parse(rawArgs);
      const data = await executeQuery<AccountResponse>(GET_ACCOUNT_INFO_QUERY, {});
      const a = data.account;
      if (!a) return toolResult('Could not retrieve account info.', { found: false });

      let text: string;
      if (args.response_format === ResponseFormat.JSON) {
        text = JSON.stringify(a, null, 2);
      } else {
        const addr = a.address;
        const addressStr = addr
          ? [addr.address1, addr.city, addr.state, addr.zipCode].filter(Boolean).join(', ')
          : null;
        const lines: string[] = [`# ${a.companyName ?? 'N/A'}`];
        if (a.companyEmail) lines.push(`**Email**: ${a.companyEmail}`);
        if (a.phone) lines.push(`**Phone**: ${a.phone}`);
        if (a.website) lines.push(`**Website**: ${a.website}`);
        if (addressStr) lines.push(`**Address**: ${addressStr}`);
        text = lines.join('\n');
      }

      return toolResult(text, a);
    },
  );
}
