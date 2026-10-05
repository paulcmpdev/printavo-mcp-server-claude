/**
 * Zod input schemas for all Printavo MCP tools.
 *
 * Each schema is `.strict()` to forbid extra fields — this catches
 * typos and prevents accidental scope creep on inputs.
 */

import { z } from 'zod';
import { ResponseFormat } from '../types.js';
import { parseSizesToInput } from '../services/formatters.js';

const ResponseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' (human-readable) or 'json' (machine-readable).");

const PaymentStatusSchema = z.enum(['PAID', 'UNPAID', 'PARTIAL']);

const PaginationLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(25)
  .default(25)
  .describe('1–25 results per page. Default 25.');

const PaginationCursorSchema = z
  .string()
  .min(1)
  .optional()
  .describe('Pagination cursor returned by a previous call.');

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'Must be an ISO 8601 date (YYYY-MM-DD).');

// ---------------------------------------------------------------------------
// Read-only tool schemas
// ---------------------------------------------------------------------------

export const SearchInvoicesSchema = z
  .object({
    start_date: IsoDateSchema.optional().describe(
      'ISO 8601 date (YYYY-MM-DD). Production start on or after this date.',
    ),
    end_date: IsoDateSchema.optional().describe(
      'ISO 8601 date (YYYY-MM-DD). Production due on or before this date.',
    ),
    status_ids: z
      .array(z.string().min(1))
      .optional()
      .describe('Filter by status IDs (use list_statuses to discover IDs).'),
    payment_status: PaymentStatusSchema.optional().describe(
      'Filter by payment status: PAID, UNPAID, or PARTIAL.',
    ),
    query: z
      .string()
      .min(1)
      .optional()
      .describe('Free-text search (customer name, visual ID, nickname).'),
    limit: PaginationLimitSchema,
    after: PaginationCursorSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();
export type SearchInvoicesInput = z.infer<typeof SearchInvoicesSchema>;

export const GetInvoiceDetailSchema = z
  .object({
    visual_id: z
      .string()
      .min(1, 'visual_id is required')
      .describe('The visual order number shown in Printavo (e.g. "12345"), NOT the internal ID.'),
    response_format: ResponseFormatSchema,
  })
  .strict();
export type GetInvoiceDetailInput = z.infer<typeof GetInvoiceDetailSchema>;

export const SearchCustomersSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .optional()
      .describe('Filter results by name, company, or email (client-side substring match).'),
    limit: PaginationLimitSchema,
    after: PaginationCursorSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();
export type SearchCustomersInput = z.infer<typeof SearchCustomersSchema>;

export const GetCustomerDetailSchema = z
  .object({
    id: z.string().min(1, 'id is required').describe('Printavo contact ID.'),
    response_format: ResponseFormatSchema,
  })
  .strict();
export type GetCustomerDetailInput = z.infer<typeof GetCustomerDetailSchema>;

export const ListStatusesSchema = z
  .object({
    response_format: ResponseFormatSchema,
  })
  .strict();
export type ListStatusesInput = z.infer<typeof ListStatusesSchema>;

export const GetOrderStatsSchema = z
  .object({
    start_date: IsoDateSchema.describe('ISO 8601 date (YYYY-MM-DD). Required.'),
    end_date: IsoDateSchema.describe('ISO 8601 date (YYYY-MM-DD). Required.'),
    status_ids: z.array(z.string().min(1)).optional().describe('Optional status filter.'),
    response_format: ResponseFormatSchema,
  })
  .strict();
export type GetOrderStatsInput = z.infer<typeof GetOrderStatsSchema>;

export const GetProductionScheduleSchema = z
  .object({
    start_date: IsoDateSchema.optional().describe('ISO 8601 date. Defaults to today.'),
    end_date: IsoDateSchema.optional().describe('ISO 8601 date. Defaults to today + 14 days.'),
    exclude_status_ids: z
      .array(z.string().min(1))
      .optional()
      .describe('Status IDs to exclude from the schedule.'),
    response_format: ResponseFormatSchema,
  })
  .strict();
export type GetProductionScheduleInput = z.infer<typeof GetProductionScheduleSchema>;

export const GetAccountInfoSchema = z
  .object({
    response_format: ResponseFormatSchema,
  })
  .strict();
export type GetAccountInfoInput = z.infer<typeof GetAccountInfoSchema>;

export const ListPricingMatricesSchema = z
  .object({
    type_of_work: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional filter: "Screen Printing", "Embroidery", "DTF", "Outsource", "Print On Demand" (case-insensitive partial match).',
      ),
    name_contains: z
      .string()
      .min(1)
      .optional()
      .describe('Optional filter: matrices whose name contains this string (case-insensitive).'),
    response_format: ResponseFormatSchema,
  })
  .strict();
export type ListPricingMatricesInput = z.infer<typeof ListPricingMatricesSchema>;

// Base shape kept separate from the refinement so `.shape` is accessible
// for SDK tool registration. The refinement is applied via .superRefine in
// the wrapper schema below; handlers parse with the wrapper.
export const GetPricingMatrixShape = {
  id: z.string().min(1).optional().describe('Matrix ID (preferred). Get from list_pricing_matrices.'),
  name: z
    .string()
    .min(1)
    .optional()
    .describe('Matrix name (exact or partial, case-insensitive). Used if id is not provided.'),
  response_format: ResponseFormatSchema,
} as const;
export const GetPricingMatrixSchema = z
  .object(GetPricingMatrixShape)
  .strict()
  .refine((val) => Boolean(val.id) || Boolean(val.name), {
    message: 'Provide either `id` or `name`.',
  });
export type GetPricingMatrixInput = z.infer<typeof GetPricingMatrixSchema>;

export const CalculateMatrixPriceSchema = z
  .object({
    matrix_column_id: z
      .string()
      .min(1)
      .describe(
        'Pricing matrix column id. For screen printing this is a color count; for embroidery a stitch count; etc.',
      ),
    additional_column_ids: z
      .array(z.string().min(1))
      .optional()
      .describe('Optional additional column IDs for additional print locations.'),
    type_of_work_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Type of work ID. If omitted, inferred from the matrix that owns matrix_column_id.',
      ),
    quantity: z
      .number()
      .int()
      .min(1)
      .describe('Number of pieces in the order (total across sizes).'),
    blank_cost: z
      .number()
      .min(0)
      .optional()
      .describe(
        'Blank garment cost per item in dollars. Defaults to 0 — Printavo returns print cost only.',
      ),
    details: z
      .string()
      .min(1)
      .optional()
      .describe('Imprint details / description (e.g. "Left chest embroidery").'),
    response_format: ResponseFormatSchema,
  })
  .strict();
export type CalculateMatrixPriceInput = z.infer<typeof CalculateMatrixPriceSchema>;

// ---------------------------------------------------------------------------
// Mutation schemas
// ---------------------------------------------------------------------------

const SizeQuantitySchema = z.union([
  z.number().int().min(0).max(2147483647),
  z.string().regex(/^\s*\d+\s*$/, 'Expected an integer numeric string').refine(
    (value) => Number(value) <= 2147483647, 'Count exceeds GraphQL Int maximum (2147483647)',
  ),
]);

const PositionSchema = z
  .number()
  .int()
  .min(0)
  .max(2147483647);

const CategoryIdSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, 'category_id must not be whitespace-only')
  .describe('Printavo category ID. Sent as category: { id: category_id }.');

function preserveAndValidateSizeMap(value: unknown, ctx: z.RefinementCtx): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'sizes must be a plain object without inherited properties',
    });
    return value;
  }
  for (const key of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key.toLowerCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid prototype-related size key: "${key}"`,
      });
    }
  }
  return value;
}

function validateSizes(sizes: Record<string, number | string | null>, ctx: z.RefinementCtx): void {
  try {
    parseSizesToInput(sizes);
  } catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
  }
}

const SizesObjectSchema = z
  .preprocess(preserveAndValidateSizeMap, z.record(z.string().min(1), SizeQuantitySchema))
  .superRefine(validateSizes)
  .describe(
    'Size quantities as key→count. Keys: YXS,YS,YM,YL,YXL,XS,S,M,L,XL,2XL,3XL,4XL,5XL,6XL,OTHER,6M,12M,18M,24M,2T,3T,4T,5T. Example: { "S": 5, "M": 10 }',
  );

export const AddLineItemSchema = z
  .object({
    line_item_group_id: z
      .string()
      .min(1)
      .describe('The line item group ID. Get this from get_invoice_detail.'),
    description: z
      .string()
      .min(1)
      .describe('Style description (e.g. "Gildan 5000 Heavy Cotton Tee").'),
    item_number: z.string().min(1).optional().describe('Item/style number (e.g. "G5000").'),
    color: z.string().min(1).optional().describe('Color of the item (e.g. "Black").'),
    category_id: CategoryIdSchema.optional(),
    price: z.number().min(0).optional().describe('Price per item in dollars.'),
    position: PositionSchema.describe('Position of this line item within the group.'),
    taxed: z.boolean().optional().describe('Whether this line item is taxable. Defaults to true.'),
    sizes: SizesObjectSchema.optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();
export type AddLineItemInput = z.infer<typeof AddLineItemSchema>;

export const UpdateLineItemSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .describe('The line item ID to update. Get this from get_invoice_detail.'),
    description: z.string().min(1).optional(),
    item_number: z.string().min(1).optional(),
    color: z.string().min(1).optional(),
    category_id: CategoryIdSchema.optional(),
    price: z.number().min(0).optional(),
    position: PositionSchema.describe('Position of this line item within the group. Required by the API.'),
    taxed: z.boolean().optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();
export type UpdateLineItemInput = z.infer<typeof UpdateLineItemSchema>;

export const UpdateLineItemSizesSchema = z
  .object({
    id: z.string().min(1).describe('The line item ID to update sizes for.'),
    position: PositionSchema.describe('Current position of the line item (required by the API).'),
    sizes: z.preprocess(
      preserveAndValidateSizeMap,
      z.record(z.string().min(1), SizeQuantitySchema.nullable()),
    )
      .superRefine(validateSizes)
      .refine((s) => Object.keys(s).length > 0, {
        message: 'sizes must be a non-empty object',
      })
      .describe('Size updates using friendly names (S, M, XXL, etc.) or Printavo enum values (size_s, etc.). Only supplied entries are sent. Null is sent as a clear request; upstream persistence behavior is unverified. Counts must be integers from 0 through 2147483647 or equivalent numeric strings. Duplicate aliases are rejected.'),
    response_format: ResponseFormatSchema,
  })
  .strict();
export type UpdateLineItemSizesInput = z.infer<typeof UpdateLineItemSizesSchema>;
