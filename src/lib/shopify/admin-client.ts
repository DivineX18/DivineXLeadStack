import "server-only";

/**
 * Minimal, read-only Shopify Admin GraphQL client for commerce
 * intelligence. Deliberately hand-written (no @shopify/shopify-api
 * dependency) -- the same choice the Website Factory's own Shopify
 * integration already made, and for the same reason: a dependency is a
 * supply-chain decision for a repo buyers self-host, and this needs
 * exactly one query.
 *
 * API version and every field name below were verified against Shopify's
 * current Admin GraphQL API reference (shopify.dev, 2026-10-29) rather
 * than assumed -- see lib/shopify/money.ts and observations.ts for the
 * places that assumption still needs confirming against a REAL store
 * (field presence/shape verified from docs; exact runtime behavior around
 * edge cases like partial refunds is not yet).
 */

export const SHOPIFY_ADMIN_API_VERSION = "2026-07";

export class ShopifyAdminApiError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`shopify admin api: ${detail} (http ${status})`);
  }
}

interface MoneyV2Raw {
  amount: string;
  currencyCode: string;
}

interface OrderNode {
  id: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  totalPriceSet: { shopMoney: MoneyV2Raw };
  totalDiscountsSet: { shopMoney: MoneyV2Raw } | null;
  totalTaxSet: { shopMoney: MoneyV2Raw } | null;
  totalRefundedSet: { shopMoney: MoneyV2Raw };
  netPaymentSet: { shopMoney: MoneyV2Raw };
  lineItems: {
    edges: {
      node: {
        quantity: number;
        originalUnitPriceSet: { shopMoney: MoneyV2Raw };
        title: string | null;
        product: { id: string } | null;
      };
    }[];
  };
}

export interface ShopOrdersPage {
  shop: { currencyCode: string; ianaTimezone: string; myshopifyDomain: string };
  orders: OrderNode[];
  hasNextPage: boolean;
  endCursor: string | null;
}

const ORDERS_QUERY = `
  query OrdersForEvidence($query: String!, $first: Int!, $after: String) {
    shop {
      currencyCode
      ianaTimezone
      myshopifyDomain
    }
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
      pageInfo { hasNextPage, endCursor }
      edges {
        node {
          id
          createdAt
          cancelledAt
          displayFinancialStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          totalDiscountsSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          totalRefundedSet { shopMoney { amount currencyCode } }
          netPaymentSet { shopMoney { amount currencyCode } }
          lineItems(first: 50) {
            edges {
              node {
                quantity
                originalUnitPriceSet { shopMoney { amount currencyCode } }
                title
                product { id }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * One page of orders created within [createdAtMin, createdAtMax)
 * (inclusive start, exclusive end -- both ISO instants), newest-page-first
 * pagination via `after`.
 *
 * Capped at a modest page size and a hard ceiling on total orders per sync
 * (enforced by the caller, evidence-fetch.ts) -- this slice proves the
 * pipeline works, it is not a historical-backfill tool. A real backfill
 * needs its own pagination/rate-limit budget, deliberately out of scope
 * here.
 */
export async function fetchOrdersPage(opts: {
  shop: string;
  accessToken: string;
  createdAtMin: string;
  createdAtMax: string;
  after: string | null;
  pageSize?: number;
}): Promise<ShopOrdersPage> {
  const query = `created_at:>='${opts.createdAtMin}' AND created_at:<'${opts.createdAtMax}'`;
  const res = await fetch(`https://${opts.shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": opts.accessToken,
    },
    body: JSON.stringify({
      query: ORDERS_QUERY,
      variables: { query, first: opts.pageSize ?? 50, after: opts.after },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { shop: ShopOrdersPage["shop"]; orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; edges: { node: OrderNode }[] } };
    errors?: { message: string }[];
  };
  if (!res.ok) {
    throw new ShopifyAdminApiError(res.status, json.errors?.[0]?.message ?? `request failed`);
  }
  if (json.errors?.length) {
    throw new ShopifyAdminApiError(res.status, json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new ShopifyAdminApiError(res.status, "no data in a 2xx response");
  }
  return {
    shop: json.data.shop,
    orders: json.data.orders.edges.map((e) => e.node),
    hasNextPage: json.data.orders.pageInfo.hasNextPage,
    endCursor: json.data.orders.pageInfo.endCursor,
  };
}
