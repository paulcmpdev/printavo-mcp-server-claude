/**
 * Stats and production schedule tool handlers.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { paginateQuery } from '../services/printavo-client.js';
import { ORDERS_PAGINATED_QUERY } from '../services/queries.js';
import { formatCurrency, formatDate, truncateMarkdown } from '../services/formatters.js';
import {
  GetOrderStatsSchema,
  GetProductionScheduleSchema,
  type GetOrderStatsInput,
  type GetProductionScheduleInput,
} from '../schemas/index.js';
import { CHARACTER_LIMIT } from '../constants.js';
import { ResponseFormat, type Quote } from '../types.js';
import { toolResult } from './_helpers.js';

interface StatusBreakdownEntry {
  count: number;
  revenue: number;
  pieces: number;
}

export function registerStatsTools(server: McpServer): void {
  server.registerTool(
    'printavo_get_order_stats',
    {
      title: 'Get Printavo Order Stats',
      description: `Aggregate statistics for orders in a date range.

Returns: total orders, total revenue, total pieces, average order value,
average pieces per order, and a breakdown by status.

Date range applies to the production window (inProductionAfter/Before).
Pagination is automatic — pulls up to 50 pages * 25 = 1,250 orders.`,
      inputSchema: GetOrderStatsSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: GetOrderStatsInput = GetOrderStatsSchema.parse(rawArgs);
      const variables: Record<string, unknown> = {
        first: 25,
        inProductionAfter: args.start_date,
        inProductionBefore: args.end_date,
      };
      if (args.status_ids?.length) variables.statusIds = args.status_ids;

      const nodes = await paginateQuery<Quote>(ORDERS_PAGINATED_QUERY, variables, 'orders', 50);

      if (nodes.length === 0) {
        const msg = `No orders found between ${args.start_date} and ${args.end_date}.`;
        return toolResult(msg, {
          start_date: args.start_date,
          end_date: args.end_date,
          total_orders: 0,
        });
      }

      let totalRevenue = 0;
      let totalPieces = 0;
      const statusBreakdown: Record<string, StatusBreakdownEntry> = {};
      for (const o of nodes) {
        const total = typeof o.total === 'number' ? o.total : parseFloat(String(o.total ?? 0));
        const revenue = Number.isNaN(total) ? 0 : total;
        totalRevenue += revenue;
        const qty = o.totalQuantity ?? 0;
        totalPieces += qty;
        const sName = o.status?.name ?? 'Unknown';
        const entry = statusBreakdown[sName] ?? { count: 0, revenue: 0, pieces: 0 };
        entry.count += 1;
        entry.revenue += revenue;
        entry.pieces += qty;
        statusBreakdown[sName] = entry;
      }

      const structured = {
        start_date: args.start_date,
        end_date: args.end_date,
        total_orders: nodes.length,
        total_revenue: totalRevenue,
        total_pieces: totalPieces,
        avg_order_value: totalRevenue / nodes.length,
        avg_pieces_per_order: totalPieces / nodes.length,
        by_status: statusBreakdown,
      };

      let text: string;
      if (args.response_format === ResponseFormat.JSON) {
        text = JSON.stringify(structured, null, 2);
      } else {
        const lines: string[] = [
          `# Order Stats: ${args.start_date} to ${args.end_date}`,
          '',
          `- **Total Orders**: ${nodes.length}`,
          `- **Total Revenue**: ${formatCurrency(totalRevenue)}`,
          `- **Total Pieces**: ${totalPieces}`,
          `- **Avg Order Value**: ${formatCurrency(totalRevenue / nodes.length)}`,
          `- **Avg Pieces/Order**: ${(totalPieces / nodes.length).toFixed(1)}`,
          '',
          '## By Status',
        ];
        const sorted = Object.entries(statusBreakdown).sort((a, b) => b[1].count - a[1].count);
        for (const [name, s] of sorted) {
          lines.push(
            `- **${name}**: ${s.count} orders | ${formatCurrency(s.revenue)} | ${s.pieces} pcs`,
          );
        }
        text = lines.join('\n');
      }

      return toolResult(truncateMarkdown(text, CHARACTER_LIMIT), structured);
    },
  );

  server.registerTool(
    'printavo_get_production_schedule',
    {
      title: 'Get Printavo Production Schedule',
      description: `Get orders currently in production or due within a date range, sorted by visual ID.

Defaults: start = today, end = today + 14 days. Optionally exclude statuses
(e.g. completed/shipped) via exclude_status_ids.`,
      inputSchema: GetProductionScheduleSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: GetProductionScheduleInput = GetProductionScheduleSchema.parse(rawArgs);
      const today = new Date();
      const defaultEnd = new Date(today);
      defaultEnd.setDate(defaultEnd.getDate() + 14);
      const start_date = args.start_date ?? today.toISOString().split('T')[0]!;
      const end_date = args.end_date ?? defaultEnd.toISOString().split('T')[0]!;

      const variables: Record<string, unknown> = {
        first: 25,
        inProductionAfter: start_date,
        inProductionBefore: end_date,
      };
      let nodes = await paginateQuery<Quote>(ORDERS_PAGINATED_QUERY, variables, 'orders', 20);

      if (args.exclude_status_ids?.length) {
        const excl = new Set(args.exclude_status_ids.map(String));
        nodes = nodes.filter((o) => !excl.has(String(o.status?.id)));
      }

      const structured = { start_date, end_date, count: nodes.length, orders: nodes };

      let text: string;
      if (args.response_format === ResponseFormat.JSON) {
        text = JSON.stringify(structured, null, 2);
      } else if (nodes.length === 0) {
        text = `No orders in production between ${start_date} and ${end_date}.`;
      } else {
        const lines: string[] = [
          `# Production Schedule: ${start_date} → ${end_date} (${nodes.length} orders)`,
          '',
        ];
        for (const o of nodes) {
          lines.push(
            `- **#${o.visualId}** ${o.nickname ?? ''} | ${o.contact?.fullName ?? 'N/A'} | ${
              o.status?.name ?? 'N/A'
            } | Due: ${formatDate(o.dueAt)} | Qty: ${o.totalQuantity ?? 'N/A'} | ${formatCurrency(
              o.total,
            )}`,
          );
        }
        text = lines.join('\n');
      }

      return toolResult(truncateMarkdown(text, CHARACTER_LIMIT), structured);
    },
  );
}
