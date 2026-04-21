/**
 * Line item MUTATION handlers — add, update, update sizes.
 *
 * These tools modify Printavo data. Annotations mark them clearly as
 * non-readonly and (potentially) destructive so MCP clients can prompt
 * the user appropriately.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeQuery } from '../services/printavo-client.js';
import {
  LINE_ITEM_CREATE_MUTATION,
  LINE_ITEM_UPDATE_MUTATION,
} from '../services/queries.js';
import {
  formatCurrency,
  formatSizes,
  parseSizesToInput,
} from '../services/formatters.js';
import {
  AddLineItemSchema,
  UpdateLineItemSchema,
  UpdateLineItemSizesSchema,
  type AddLineItemInput,
  type UpdateLineItemInput,
  type UpdateLineItemSizesInput,
} from '../schemas/index.js';
import { ResponseFormat, type LineItem, type LineItemMutationResponse } from '../types.js';
import { toolResult } from './_helpers.js';

function renderMutationMarkdown(item: LineItem | undefined, action: string): string {
  if (!item) return `Line item ${action} returned no result.`;
  const lines: string[] = [`# Line item ${action} successfully`, '', `**ID**: \`${item.id}\``];
  if (item.description) lines.push(`**Description**: ${item.description}`);
  if (item.itemNumber) lines.push(`**Item #**: ${item.itemNumber}`);
  if (item.color) lines.push(`**Color**: ${item.color}`);
  if (item.price != null) lines.push(`**Price**: ${formatCurrency(item.price)}`);
  lines.push(`**Total Qty**: ${item.items ?? 'N/A'}`);
  lines.push(`**Position**: ${item.position}`);
  lines.push(`**Taxed**: ${item.taxed ? 'Yes' : 'No'}`);
  const sizeStr = formatSizes(item.sizes);
  if (sizeStr) lines.push(`**Sizes**: ${sizeStr}`);
  if (item.lineItemGroup) {
    lines.push(
      `**Group ID**: \`${item.lineItemGroup.id}\` (Position: ${
        item.lineItemGroup.position ?? 'N/A'
      })`,
    );
  }
  return lines.join('\n');
}

export function registerLineItemTools(server: McpServer): void {
  server.registerTool(
    'printavo_add_line_item',
    {
      title: 'Add Printavo Line Item',
      description: `MUTATION. Add a new line item to an existing line item group on an invoice.

Requires the line item group ID (get it from printavo_get_invoice_detail).
Returns the created line item with its new ID.

Sizes accept friendly names (S, M, L, XL, 2XL, ...) or Printavo enum values
(size_s, size_m, ...). Counts must be non-negative integers.`,
      inputSchema: AddLineItemSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: AddLineItemInput = AddLineItemSchema.parse(rawArgs);
      const input: Record<string, unknown> = {
        description: args.description,
        position: args.position,
      };
      if (args.item_number != null) input.itemNumber = args.item_number;
      if (args.color != null) input.color = args.color;
      if (args.price != null) input.price = args.price;
      if (args.taxed != null) input.taxed = args.taxed;
      if (args.sizes) input.sizes = parseSizesToInput(args.sizes);

      const data = await executeQuery<LineItemMutationResponse>(LINE_ITEM_CREATE_MUTATION, {
        lineItemGroupId: args.line_item_group_id,
        input,
      });
      const item = data.lineItemCreate;

      const text =
        args.response_format === ResponseFormat.JSON
          ? JSON.stringify(item, null, 2)
          : renderMutationMarkdown(item, 'created');
      return toolResult(text, item);
    },
  );

  server.registerTool(
    'printavo_update_line_item',
    {
      title: 'Update Printavo Line Item',
      description: `MUTATION. Update an existing line item on an invoice.

Can change description, item number, color, price, position, and/or taxed status.
Use printavo_update_line_item_sizes to change size quantities.

NOTE: position is required by the Printavo API even if you're not changing it —
get the current value from printavo_get_invoice_detail.`,
      inputSchema: UpdateLineItemSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: UpdateLineItemInput = UpdateLineItemSchema.parse(rawArgs);
      const input: Record<string, unknown> = { position: args.position };
      if (args.description != null) input.description = args.description;
      if (args.item_number != null) input.itemNumber = args.item_number;
      if (args.color != null) input.color = args.color;
      if (args.price != null) input.price = args.price;
      if (args.taxed != null) input.taxed = args.taxed;

      const data = await executeQuery<LineItemMutationResponse>(LINE_ITEM_UPDATE_MUTATION, {
        id: args.id,
        input,
      });
      const item = data.lineItemUpdate;

      const text =
        args.response_format === ResponseFormat.JSON
          ? JSON.stringify(item, null, 2)
          : renderMutationMarkdown(item, 'updated');
      return toolResult(text, item);
    },
  );

  server.registerTool(
    'printavo_update_line_item_sizes',
    {
      title: 'Update Printavo Line Item Sizes',
      description: `MUTATION. Replace the size quantities for an existing line item.

Any size not included in the input will be set to 0. Use printavo_update_line_item
for non-size fields.

NOTE: position is required by the Printavo API — get it from printavo_get_invoice_detail.`,
      inputSchema: UpdateLineItemSizesSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: UpdateLineItemSizesInput = UpdateLineItemSizesSchema.parse(rawArgs);
      const input = {
        position: args.position,
        sizes: parseSizesToInput(args.sizes),
      };
      const data = await executeQuery<LineItemMutationResponse>(LINE_ITEM_UPDATE_MUTATION, {
        id: args.id,
        input,
      });
      const item = data.lineItemUpdate;
      const text =
        args.response_format === ResponseFormat.JSON
          ? JSON.stringify(item, null, 2)
          : renderMutationMarkdown(item, 'sizes updated');
      return toolResult(text, item);
    },
  );
}
