/**
 * Pricing matrix tools (READ-ONLY).
 *
 * Printavo's public GraphQL API does NOT expose cell values (quantity/price/markup)
 * on PricingMatrixCell — only column id + name. To compute actual prices we use
 * the lineItemGroupPricing calculator query, which is read-only despite taking
 * an Input type.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeQuery } from '../services/printavo-client.js';
import {
  LIST_PRICING_MATRICES_QUERY,
  CALCULATE_PRICE_QUERY,
} from '../services/queries.js';
import { formatCurrency } from '../services/formatters.js';
import {
  ListPricingMatricesSchema,
  GetPricingMatrixSchema,
  GetPricingMatrixShape,
  CalculateMatrixPriceSchema,
  type ListPricingMatricesInput,
  type GetPricingMatrixInput,
  type CalculateMatrixPriceInput,
} from '../schemas/index.js';
import {
  ResponseFormat,
  type AccountResponse,
  type CalculatePriceResponse,
  type PricingMatrix,
} from '../types.js';
import { toolResult } from './_helpers.js';

async function fetchAllMatrices(): Promise<PricingMatrix[]> {
  const data = await executeQuery<AccountResponse>(LIST_PRICING_MATRICES_QUERY, {});
  return data.account?.pricingMatrices?.nodes ?? [];
}

export function registerPricingTools(server: McpServer): void {
  server.registerTool(
    'printavo_list_pricing_matrices',
    {
      title: 'List Printavo Pricing Matrices',
      description: `List all pricing matrices configured in the Printavo account.

Each matrix has an ID, name, type of work (Screen Printing / Embroidery / DTF / etc),
and columns (color counts for SP, stitch counts for embroidery, etc).

Use this to discover matrix column IDs to pass to calculate_matrix_price.`,
      inputSchema: ListPricingMatricesSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: ListPricingMatricesInput = ListPricingMatricesSchema.parse(rawArgs);
      let nodes = await fetchAllMatrices();
      const totalNodes = nodes.length;

      if (args.type_of_work) {
        const t = args.type_of_work.toLowerCase();
        nodes = nodes.filter((m) => (m.typeOfWork?.name ?? '').toLowerCase().includes(t));
      }
      if (args.name_contains) {
        const n = args.name_contains.toLowerCase();
        nodes = nodes.filter((m) => (m.name ?? '').toLowerCase().includes(n));
      }

      const structured = { count: nodes.length, total: totalNodes, matrices: nodes };

      let text: string;
      if (args.response_format === ResponseFormat.JSON) {
        text = JSON.stringify(structured, null, 2);
      } else if (nodes.length === 0) {
        text = 'No pricing matrices matched the given filters.';
      } else {
        const lines: string[] = [
          `# Pricing Matrices (${nodes.length}${
            totalNodes !== nodes.length ? ` of ${totalNodes}` : ''
          })`,
          '',
        ];
        for (const m of nodes) {
          lines.push(`## ${m.name ?? 'Unnamed'}`);
          lines.push(`- **Matrix ID**: \`${m.id}\``);
          lines.push(
            `- **Type of Work**: ${m.typeOfWork?.name ?? 'N/A'}${
              m.typeOfWork?.id ? ` (ToW ID: \`${m.typeOfWork.id}\`)` : ''
            }`,
          );
          const cols = m.columns ?? [];
          if (cols.length > 0) {
            lines.push(`- **Columns** (${cols.length}):`);
            for (const c of cols) {
              lines.push(`    - \`${c.id}\` — ${c.columnName}`);
            }
          }
          lines.push('');
        }
        lines.push('_Use printavo_calculate_matrix_price with a column ID to compute a rate._');
        text = lines.join('\n');
      }

      return toolResult(text, structured);
    },
  );

  server.registerTool(
    'printavo_get_pricing_matrix',
    {
      title: 'Get Printavo Pricing Matrix',
      description: `Get full details for a specific pricing matrix by ID or name.

NOTE: Printavo's API does NOT expose raw cell values (quantity/price). To get
actual rates, use printavo_calculate_matrix_price with a column ID + quantity.`,
      inputSchema: GetPricingMatrixShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: GetPricingMatrixInput = GetPricingMatrixSchema.parse(rawArgs);
      const nodes = await fetchAllMatrices();

      let match: PricingMatrix | undefined;
      if (args.id) {
        match = nodes.find((m) => String(m.id) === String(args.id));
      } else if (args.name) {
        const n = args.name.toLowerCase();
        match =
          nodes.find((m) => (m.name ?? '').toLowerCase() === n) ??
          nodes.find((m) => (m.name ?? '').toLowerCase().includes(n));
      }

      if (!match) {
        const msg = `No pricing matrix found for ${args.id ? `id=${args.id}` : `name="${args.name}"`}.`;
        return toolResult(msg, { found: false });
      }

      let text: string;
      if (args.response_format === ResponseFormat.JSON) {
        text = JSON.stringify(match, null, 2);
      } else {
        const cols = match.columns ?? [];
        const lines: string[] = [
          `# Pricing Matrix: ${match.name}`,
          '',
          `**Matrix ID**: \`${match.id}\``,
          `**Type of Work**: ${match.typeOfWork?.name ?? 'N/A'}${
            match.typeOfWork?.id ? ` (ToW ID: \`${match.typeOfWork.id}\`)` : ''
          }`,
          '',
          `## Columns (${cols.length})`,
        ];
        for (const c of cols) {
          lines.push(`- \`${c.id}\` — **${c.columnName}** (columnId: \`${c.columnId}\`)`);
        }
        lines.push('');
        lines.push(
          '_Note: cell values are not exposed by the Printavo API. Use printavo_calculate_matrix_price._',
        );
        text = lines.join('\n');
      }

      return toolResult(text, match);
    },
  );

  server.registerTool(
    'printavo_calculate_matrix_price',
    {
      title: 'Calculate Printavo Matrix Price',
      description: `Calculate the decoration price for a hypothetical line item using a pricing matrix.

This runs Printavo's lineItemGroupPricing calculator query — NO invoices, quotes,
or records are created. Returns the per-item print/decoration cost plus the matrix's
default product markup.

Supports multi-column calculations (additional print locations) via additional_column_ids.

If type_of_work_id is omitted, it's inferred from the matrix that owns matrix_column_id.

Returns:
  Markdown summary or JSON with: { print_cost, default_markup_pct, description, signature }`,
      inputSchema: CalculateMatrixPriceSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs) => {
      const args: CalculateMatrixPriceInput = CalculateMatrixPriceSchema.parse(rawArgs);

      // Resolve typeOfWork: prefer explicit, else look up via the matrix that owns the column
      let towId = args.type_of_work_id;
      let matrixInfo: PricingMatrix | undefined;
      if (!towId) {
        const matrices = await fetchAllMatrices();
        for (const m of matrices) {
          if ((m.columns ?? []).some((c) => String(c.id) === String(args.matrix_column_id))) {
            matrixInfo = m;
            towId = m.typeOfWork?.id;
            break;
          }
        }
        if (!towId) {
          throw new Error(
            `Could not infer type_of_work_id — no matrix found containing column ${args.matrix_column_id}. Pass type_of_work_id explicitly.`,
          );
        }
      }

      const imprints = [
        {
          pricingMatrixColumn: { id: String(args.matrix_column_id) },
          typeOfWork: { id: String(towId) },
          details: args.details ?? 'Primary imprint',
        },
      ];
      for (const colId of args.additional_column_ids ?? []) {
        if (!colId) continue;
        imprints.push({
          pricingMatrixColumn: { id: String(colId) },
          typeOfWork: { id: String(towId) },
          details: 'Additional location',
        });
      }

      const blank = args.blank_cost ?? 0;
      const input = {
        position: 1,
        imprints,
        lineItems: [
          {
            description: 'Pricing calculation (read-only)',
            itemNumber: 'CALC',
            sizes: [{ size: 'size_other', count: args.quantity }],
            position: 1,
            price: blank,
          },
        ],
      };

      const data = await executeQuery<CalculatePriceResponse>(CALCULATE_PRICE_QUERY, { input });
      const r = data.lineItemGroupPricing?.[0];
      if (!r) return toolResult('Printavo returned no pricing result.', { found: false });

      const printCost = typeof r.price === 'number' ? r.price : parseFloat(String(r.price ?? 0));
      const markupPct =
        typeof r.defaultMarkupPercentage === 'number'
          ? r.defaultMarkupPercentage
          : parseFloat(String(r.defaultMarkupPercentage ?? NaN));

      const structured = {
        matrix_column_id: args.matrix_column_id,
        additional_column_ids: args.additional_column_ids ?? [],
        type_of_work_id: towId,
        quantity: args.quantity,
        blank_cost: blank,
        print_cost: printCost,
        default_markup_pct: Number.isNaN(markupPct) ? null : markupPct,
        description: r.description,
        signature: r.signature,
      };

      let text: string;
      if (args.response_format === ResponseFormat.JSON) {
        text = JSON.stringify(structured, null, 2);
      } else {
        const lines: string[] = [
          '# Matrix Price Calculation',
          '',
          matrixInfo
            ? `**Matrix**: ${matrixInfo.name} (${matrixInfo.typeOfWork?.name ?? 'N/A'})`
            : `**Type of Work ID**: \`${towId}\``,
          `**Primary Column**: \`${args.matrix_column_id}\``,
        ];
        if (args.additional_column_ids?.length)
          lines.push(`**Additional Columns**: ${args.additional_column_ids.join(', ')}`);
        lines.push(`**Quantity**: ${args.quantity}`);
        if (blank > 0) lines.push(`**Blank Cost Input**: ${formatCurrency(blank)}`);
        lines.push('');
        lines.push(`**Decoration / Print Cost per item**: ${formatCurrency(printCost)}`);
        if (!Number.isNaN(markupPct))
          lines.push(`**Default Product Markup**: ${markupPct}%`);
        if (r.description) lines.push(`**Calculation**: ${r.description}`);
        if (blank > 0 && !Number.isNaN(markupPct)) {
          const garmentWithMarkup = blank * (1 + markupPct / 100);
          const perItemTotal = garmentWithMarkup + printCost;
          lines.push('');
          lines.push('## Reference Total (Printavo formula)');
          lines.push(
            `(${formatCurrency(blank)} blank × ${1 + markupPct / 100}) + ${formatCurrency(
              printCost,
            )} print = ${formatCurrency(perItemTotal)} per item`,
          );
          lines.push(`Extended (${args.quantity} items): ${formatCurrency(perItemTotal * args.quantity)}`);
        }
        text = lines.join('\n');
      }

      return toolResult(text, structured);
    },
  );
}
