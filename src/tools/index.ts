/**
 * Aggregate tool registration. Adding a new tool? Register it here.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerInvoiceTools } from './invoices.js';
import { registerCustomerTools } from './customers.js';
import { registerAccountTools } from './account.js';
import { registerStatsTools } from './stats.js';
import { registerPricingTools } from './pricing.js';
import { registerLineItemTools } from './line-items.js';

/** All Printavo MCP tools. The names of each registered tool, for logging/health. */
export const ALL_TOOL_NAMES = [
  // read
  'printavo_search_invoices',
  'printavo_get_invoice_detail',
  'printavo_search_customers',
  'printavo_get_customer_detail',
  'printavo_list_statuses',
  'printavo_get_account_info',
  'printavo_get_order_stats',
  'printavo_get_production_schedule',
  'printavo_list_pricing_matrices',
  'printavo_get_pricing_matrix',
  'printavo_calculate_matrix_price',
  // mutations
  'printavo_add_line_item',
  'printavo_update_line_item',
  'printavo_update_line_item_sizes',
] as const;

export function registerAllTools(server: McpServer): void {
  registerInvoiceTools(server);
  registerCustomerTools(server);
  registerAccountTools(server);
  registerStatsTools(server);
  registerPricingTools(server);
  registerLineItemTools(server);
}
