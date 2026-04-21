/**
 * Shared TypeScript types for Printavo GraphQL responses.
 * These mirror only the fields we actually request — not the full Printavo schema.
 */

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface Connection<T> {
  nodes: T[];
  pageInfo?: PageInfo;
  totalNodes?: number;
}

export interface Status {
  id: string;
  name: string;
  color?: string | null;
  position?: number | null;
  type?: string | null;
}

export interface Contact {
  id: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface Owner {
  id: string;
  email?: string | null;
}

export interface Address {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

export interface DeliveryMethod {
  id: string;
  name?: string | null;
}

export interface Product {
  id: string;
  description?: string | null;
  itemNumber?: string | null;
  brand?: string | null;
  color?: string | null;
}

export interface Category {
  id: string;
  name?: string | null;
}

export interface SizeCount {
  size: string;
  count: number;
}

export interface LineItem {
  id: string;
  description?: string | null;
  color?: string | null;
  itemNumber?: string | null;
  items?: number | null;
  price?: number | null;
  position?: number | null;
  taxed?: boolean | null;
  markupPercentage?: number | null;
  category?: Category | null;
  product?: Product | null;
  sizes?: SizeCount[] | null;
  lineItemGroup?: { id: string; position?: number | null } | null;
}

export interface TypeOfWork {
  id: string;
  name?: string | null;
}

export interface Imprint {
  id: string;
  typeOfWork?: TypeOfWork | null;
  details?: string | null;
}

export interface LineItemGroup {
  id: string;
  position?: number | null;
  imprints?: Connection<Imprint>;
  lineItems?: Connection<LineItem>;
}

export interface Fee {
  id: string;
  description?: string | null;
  amount?: number | null;
}

export interface Quote {
  id: string;
  visualId?: string | null;
  nickname?: string | null;
  total?: number | null;
  subtotal?: number | null;
  totalUntaxed?: number | null;
  totalQuantity?: number | null;
  amountPaid?: number | null;
  amountOutstanding?: number | null;
  createdAt?: string | null;
  dueAt?: string | null;
  invoiceAt?: string | null;
  startAt?: string | null;
  paidInFull?: boolean | null;
  productionNote?: string | null;
  customerNote?: string | null;
  tags?: string[] | null;
  merch?: unknown;
  status?: Status | null;
  contact?: Contact | null;
  owner?: Owner | null;
  deliveryMethod?: DeliveryMethod | null;
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  lineItemGroups?: Connection<LineItemGroup>;
  fees?: Connection<Fee>;
}

export interface Customer {
  id: string;
  companyName?: string | null;
  internalNote?: string | null;
  orderCount?: number | null;
  primaryContact?: Contact | null;
}

export interface Account {
  id: string;
  companyName?: string | null;
  companyEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: Address | null;
  pricingMatrices?: Connection<PricingMatrix>;
}

export interface PricingMatrixColumn {
  id: string;
  columnId?: string | null;
  columnName?: string | null;
}

export interface PricingMatrix {
  id: string;
  name?: string | null;
  typeOfWork?: TypeOfWork | null;
  columns?: PricingMatrixColumn[] | null;
}

export interface PricingResult {
  price?: number | null;
  defaultMarkupPercentage?: number | null;
  description?: string | null;
  signature?: string | null;
}

export interface OrdersResponse {
  orders: Connection<Quote>;
}

export interface CustomersResponse {
  customers: Connection<Customer>;
}

export interface ContactDetailResponse {
  contact: (Contact & { customer?: Customer | null }) | null;
}

export interface StatusesResponse {
  statuses: Connection<Status>;
}

export interface AccountResponse {
  account: Account | null;
}

export interface CalculatePriceResponse {
  lineItemGroupPricing: PricingResult[];
}

export interface LineItemMutationResponse {
  lineItemCreate?: LineItem;
  lineItemUpdate?: LineItem;
}

/** Output format for tool responses. */
export enum ResponseFormat {
  MARKDOWN = 'markdown',
  JSON = 'json',
}
