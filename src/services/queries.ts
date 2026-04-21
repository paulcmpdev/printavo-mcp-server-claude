/**
 * GraphQL queries and mutations for the Printavo API v2.
 * Field names verified against schema introspection.
 *
 * NOTE: Printavo's `orders` query returns `Quote` type nodes, not `Invoice`.
 */

const QUOTE_FIELDS = `
  id visualId nickname total subtotal totalUntaxed totalQuantity
  amountPaid amountOutstanding createdAt dueAt invoiceAt startAt
  paidInFull productionNote tags
  status { id name color }
  contact { id fullName email }
  owner { id email }
`;

export const SEARCH_INVOICES_QUERY = `
  query(
    $first: Int
    $after: String
    $inProductionAfter: ISO8601DateTime
    $inProductionBefore: ISO8601DateTime
    $statusIds: [ID!]
    $paymentStatus: OrderPaymentStatus
    $query: String
  ) {
    orders(
      first: $first
      after: $after
      inProductionAfter: $inProductionAfter
      inProductionBefore: $inProductionBefore
      statusIds: $statusIds
      paymentStatus: $paymentStatus
      query: $query
      sortOn: VISUAL_ID
    ) {
      nodes {
        ... on Quote {
          ${QUOTE_FIELDS}
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const GET_ORDER_DETAIL_QUERY = `
  query($first: Int, $query: String) {
    orders(first: $first, query: $query, sortOn: VISUAL_ID) {
      nodes {
        ... on Quote {
          id visualId nickname total subtotal totalUntaxed totalQuantity
          amountPaid amountOutstanding createdAt dueAt invoiceAt startAt
          paidInFull productionNote customerNote tags merch
          status { id name color }
          contact { id fullName email }
          owner { id email }
          deliveryMethod { id name }
          shippingAddress { address1 city state zipCode }
          billingAddress { address1 city state zipCode }
          lineItemGroups {
            nodes {
              id position
              imprints { nodes { id typeOfWork { id name } details } }
              lineItems {
                nodes {
                  id description color itemNumber items price position taxed markupPercentage
                  category { id name }
                  product { id description itemNumber brand color }
                  sizes { size count }
                }
              }
            }
          }
          fees { nodes { id description amount } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const SEARCH_CUSTOMERS_QUERY = `
  query($first: Int, $after: String) {
    customers(first: $first, after: $after) {
      nodes {
        id companyName internalNote orderCount
        primaryContact { id fullName email phone }
      }
      pageInfo { hasNextPage endCursor }
      totalNodes
    }
  }
`;

export const GET_CUSTOMER_DETAIL_QUERY = `
  query($id: ID!) {
    contact(id: $id) {
      id fullName email phone
      customer { id companyName internalNote orderCount }
    }
  }
`;

export const LIST_STATUSES_QUERY = `
  query {
    statuses {
      nodes { id name color position type }
    }
  }
`;

export const GET_ACCOUNT_INFO_QUERY = `
  query {
    account {
      id companyName companyEmail phone website
      address { address1 address2 city state zipCode }
    }
  }
`;

export const ORDERS_PAGINATED_QUERY = `
  query(
    $first: Int
    $after: String
    $inProductionAfter: ISO8601DateTime
    $inProductionBefore: ISO8601DateTime
    $statusIds: [ID!]
  ) {
    orders(
      first: $first
      after: $after
      inProductionAfter: $inProductionAfter
      inProductionBefore: $inProductionBefore
      statusIds: $statusIds
      sortOn: VISUAL_ID
    ) {
      nodes {
        ... on Quote {
          id visualId nickname total totalQuantity
          amountPaid amountOutstanding paidInFull
          dueAt startAt createdAt
          status { id name color }
          contact { id fullName }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const LIST_PRICING_MATRICES_QUERY = `
  query {
    account {
      pricingMatrices(first: 50) {
        totalNodes
        nodes {
          id name
          typeOfWork { id name }
          columns { id columnId columnName }
        }
      }
    }
  }
`;

/**
 * lineItemGroupPricing is READ-ONLY despite taking an input.
 * Printavo built it as a pricing calculator — no records are created.
 */
export const CALCULATE_PRICE_QUERY = `
  query($input: LineItemGroupPricingInput!) {
    lineItemGroupPricing(lineItemGroup: $input) {
      price
      defaultMarkupPercentage
      description
      signature
    }
  }
`;

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const LINE_ITEM_CREATE_MUTATION = `
  mutation($lineItemGroupId: ID!, $input: LineItemCreateInput!) {
    lineItemCreate(lineItemGroupId: $lineItemGroupId, input: $input) {
      id description color itemNumber items price position taxed
      sizes { size count }
      lineItemGroup { id position }
    }
  }
`;

export const LINE_ITEM_UPDATE_MUTATION = `
  mutation($id: ID!, $input: LineItemInput!) {
    lineItemUpdate(id: $id, input: $input) {
      id description color itemNumber items price position taxed
      sizes { size count }
      lineItemGroup { id position }
    }
  }
`;
