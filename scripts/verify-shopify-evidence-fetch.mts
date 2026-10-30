/**
 * Shopify evidence-fetch — the window/day-boundary logic that decides
 * which fetched orders land in the evidence payload, verified directly
 * against the real module. Same mutation-pairing convention as
 * verify-shopify-oauth.mts: every real-input check paired with a
 * deliberately-wrong one.
 *
 * The orders-API call itself (fetchOrdersPage) is NOT exercised here --
 * that needs a live store (see the implementation report). This file
 * exercises fetchShopifyEvidence's post-fetch trimming/windowing logic by
 * monkey-patching fetch() to return deterministic, doc-accurate fixtures,
 * so the GraphQL wiring is exercised end-to-end without a network call.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-shopify-evidence-fetch.mts
 */

let fails = 0;
const ck = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`PASS  ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name}${detail ? ` | ${detail}` : ""}`);
  }
};

process.env.AUTOMATIONS_TOKEN_SECRET ??= "test-secret";

const { fetchShopifyEvidence } = await import("../src/lib/shopify/evidence-fetch.ts");

function money(amount: string) {
  return { amount, currencyCode: "USD" };
}

function orderFixture(id: string, createdAt: string, cancelledAt: string | null = null) {
  return {
    id,
    createdAt,
    cancelledAt,
    displayFinancialStatus: cancelledAt ? "VOIDED" : "PAID",
    totalPriceSet: { shopMoney: money("50.00") },
    totalDiscountsSet: null,
    totalTaxSet: null,
    totalRefundedSet: { shopMoney: money("0.00") },
    netPaymentSet: { shopMoney: money("50.00") },
    lineItems: { edges: [] },
  };
}

/** Installs a fake global fetch returning one page of orders, every one
 *  of the given fixtures, regardless of the query variables -- the
 *  trimming logic under test happens AFTER the fetch, so the fetch layer
 *  itself just needs to hand back a believable, doc-shaped response. */
function withFakeShopifyApi<T>(orders: ReturnType<typeof orderFixture>[], timeZone: string, run: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: {
          shop: { currencyCode: "USD", ianaTimezone: timeZone, myshopifyDomain: "divinex-test-store.myshopify.com" },
          orders: { pageInfo: { hasNextPage: false, endCursor: null }, edges: orders.map((node) => ({ node })) },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = realFetch;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("-- window trimming: only orders inside the shop's own complete-day window land in the evidence --");
{
  const now = new Date("2026-10-29T12:00:00.000Z"); // "now", UTC noon
  const orders = [
    orderFixture("gid://shopify/Order/1", "2026-10-20T10:00:00Z"), // 9 days before "today" -- inside a 30-day window
    orderFixture("gid://shopify/Order/2", "2026-10-29T06:00:00Z"), // created "today" in UTC -- must be EXCLUDED (incomplete day)
    orderFixture("gid://shopify/Order/3", "2026-09-01T10:00:00Z"), // 59 days before -- OUTSIDE a 30-day window
  ];

  const result = await withFakeShopifyApi(orders, "UTC", () =>
    fetchShopifyEvidence({ shop: "divinex-test-store.myshopify.com", accessToken: "fake", days: 30, now }),
  );

  ck("the fetch succeeds and returns evidence", result.ok);
  if (result.ok) {
    const ids = result.evidence.orders.map((o) => o.id);
    ck("includes the order from 9 days ago (inside the window)", ids.includes("gid://shopify/Order/1"));
    ck("EXCLUDES today's order -- a partial day is not a complete day", !ids.includes("gid://shopify/Order/2"));
    ck("EXCLUDES the order from 59 days ago -- outside the requested 30-day window", !ids.includes("gid://shopify/Order/3"));
    ck("the evidence window ends BEFORE today, never on or after it", result.evidence.window.endDate < "2026-10-29");
    ck("the evidence carries the shop's real timezone from the API response, not a default", result.evidence.timeZone === "UTC");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("-- a non-UTC shop timezone shifts which orders count as 'today' --");
{
  // 2026-10-29T02:00:00Z is 2026-10-28T19:00:00-07:00 in America/Los_Angeles
  // -- i.e. still "yesterday" there, so a sync window ending "yesterday in
  // the shop's own zone" should treat an order placed at this UTC instant
  // as belonging to a day that MIGHT be excluded or included depending on
  // the zone, proving the trim uses the SHOP's zone, not UTC.
  const now = new Date("2026-10-29T10:00:00.000Z"); // 2026-10-29T03:00:00-07:00 PDT -- already "today" (Oct 29) in LA
  const orderLateUtcYesterday = orderFixture("gid://shopify/Order/LA1", "2026-10-29T06:00:00Z"); // 2026-10-28T23:00:00-07:00 -- still Oct 28 in LA
  const orderEarlyUtcToday = orderFixture("gid://shopify/Order/LA2", "2026-10-29T09:00:00Z"); // 2026-10-29T02:00:00-07:00 -- already Oct 29 in LA, i.e. "today" there -- must be excluded

  const result = await withFakeShopifyApi([orderLateUtcYesterday, orderEarlyUtcToday], "America/Los_Angeles", () =>
    fetchShopifyEvidence({ shop: "divinex-test-store.myshopify.com", accessToken: "fake", days: 30, now }),
  );

  ck("the fetch succeeds", result.ok);
  if (result.ok) {
    const ids = result.evidence.orders.map((o) => o.id);
    ck("an order that's still 'yesterday' in the shop's OWN zone (even though it's already a new UTC day) is included", ids.includes("gid://shopify/Order/LA1"));
    ck("an order that's already 'today' in the shop's OWN zone is excluded, even though the sync 'now' is also in that zone's today", !ids.includes("gid://shopify/Order/LA2"));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("-- empty window is reported, not recorded as zero --");
{
  const now = new Date("2026-10-29T12:00:00.000Z");
  const result = await withFakeShopifyApi([], "UTC", () =>
    fetchShopifyEvidence({ shop: "divinex-test-store.myshopify.com", accessToken: "fake", days: 30, now }),
  );
  ck("a store with no orders in the window returns ok:false with a named reason, not an empty success", !result.ok && result.error === "no_orders_in_window");
}

console.log(fails === 0 ? "\nverify-shopify-evidence-fetch: all checks passed" : `\nverify-shopify-evidence-fetch: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
