import "server-only";

import { fetchOrdersPage, SHOPIFY_ADMIN_API_VERSION, type ShopOrdersPage } from "@/lib/shopify/admin-client";

/** Mirrors Ascend's ShopifyEvidenceSchema exactly (artifacts/api-server/
 *  src/lib/shopify/evidence.ts in the DivineX-Business-Intelligence repo)
 *  -- kept as a plain object shape here rather than importing a type
 *  across repos, same as ads-fetch.ts does for the Google Ads evidence
 *  shape. */
export interface ShopifyEvidence {
  source: "shopify";
  apiVersion: string;
  shop: string;
  currencyCode: string;
  timeZone: string;
  window: { startDate: string; endDate: string; days: number };
  fetchedAt: string;
  syncRunId: string | null;
  orders: {
    id: string;
    createdAt: string;
    cancelledAt: string | null;
    displayFinancialStatus: string | null;
    totalPrice: { amount: string; currencyCode: string };
    totalDiscounts?: { amount: string; currencyCode: string };
    totalTax?: { amount: string; currencyCode: string };
    totalRefunded: { amount: string; currencyCode: string };
    netPayment: { amount: string; currencyCode: string };
    lineItems: {
      productId: string | null;
      title?: string | null;
      quantity: number;
      originalUnitPrice: { amount: string; currencyCode: string };
    }[];
  }[];
}

export type ShopifyFetchResult =
  | { ok: true; evidence: ShopifyEvidence }
  | { ok: false; error: "no_orders_in_window"; shop: string }
  | { ok: false; error: "fetch_failed"; detail: string };

/** YYYY-MM-DD in a given IANA zone -- same construction as Ascend's
 *  todayIn() (googleAds/window.ts), duplicated here deliberately rather
 *  than shared across repos (there is no shared package between Flow and
 *  Ascend to put it in), but identical in behavior so the two sides never
 *  disagree about what "today" means for the same timezone string. */
function dayIn(timeZone: string, when: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
}

function addDaysToYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y!, m! - 1, d!) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Fetches and normalizes one sync window's worth of orders, read-only.
 *
 * Fetches a UTC window one day WIDER than requested on each side, then
 * trims to the shop's own timezone's last-complete-day boundary once that
 * timezone is known from the response (shop.ianaTimezone) -- this avoids
 * a chicken-and-egg problem (the fetch query needs a date range before
 * the shop's timezone is known, but the CORRECT date range depends on
 * that timezone) without ever under-fetching across the boundary.
 *
 * Capped at MAX_ORDERS_PER_SYNC total, across pagination -- this proves
 * the pipeline works end to end; a real historical backfill needs its own
 * pagination/rate-limit budget and is explicitly out of scope here.
 */
const MAX_ORDERS_PER_SYNC = 250;
const MAX_PAGES = 10;

export async function fetchShopifyEvidence(opts: {
  shop: string;
  accessToken: string;
  days: number;
  syncRunId?: string | null;
  now?: Date;
}): Promise<ShopifyFetchResult> {
  const now = opts.now ?? new Date();
  const utcNow = now.toISOString();
  const utcStart = new Date(now.getTime() - (opts.days + 1) * 86_400_000).toISOString();

  let page: ShopOrdersPage;
  const allOrders: ShopOrdersPage["orders"] = [];
  let after: string | null = null;
  try {
    for (let i = 0; i < MAX_PAGES && allOrders.length < MAX_ORDERS_PER_SYNC; i++) {
      page = await fetchOrdersPage({
        shop: opts.shop,
        accessToken: opts.accessToken,
        createdAtMin: utcStart,
        createdAtMax: utcNow,
        after,
      });
      allOrders.push(...page.orders);
      if (!page.hasNextPage) break;
      after = page.endCursor;
    }
  } catch (err) {
    return { ok: false, error: "fetch_failed", detail: err instanceof Error ? err.message : String(err) };
  }

  // page is guaranteed assigned: the loop runs at least once (i starts at
  // 0, MAX_PAGES > 0), so `page!` is safe without a redundant null check.
  const shopInfo = page!.shop;
  const timeZone = shopInfo.ianaTimezone;
  const currencyCode = shopInfo.currencyCode;

  // Trim to the shop's own last-complete-day window, same "exclude today"
  // discipline as the Ads bridge -- a partial today makes the window look
  // collapsed for reasons that have nothing to do with the store.
  const today = dayIn(timeZone, now);
  const endDate = addDaysToYmd(today, -1);
  const startDate = addDaysToYmd(endDate, -(opts.days - 1));

  const inWindow = allOrders.filter((o) => {
    const day = dayIn(timeZone, new Date(o.createdAt));
    return day >= startDate && day <= endDate;
  });

  if (inWindow.length === 0) {
    return { ok: false, error: "no_orders_in_window", shop: opts.shop };
  }

  const evidence: ShopifyEvidence = {
    source: "shopify",
    apiVersion: SHOPIFY_ADMIN_API_VERSION,
    shop: shopInfo.myshopifyDomain,
    currencyCode,
    timeZone,
    window: { startDate, endDate, days: opts.days },
    fetchedAt: now.toISOString(),
    syncRunId: opts.syncRunId ?? null,
    orders: inWindow.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      cancelledAt: o.cancelledAt,
      displayFinancialStatus: o.displayFinancialStatus,
      totalPrice: o.totalPriceSet.shopMoney,
      totalDiscounts: o.totalDiscountsSet?.shopMoney,
      totalTax: o.totalTaxSet?.shopMoney,
      totalRefunded: o.totalRefundedSet.shopMoney,
      netPayment: o.netPaymentSet.shopMoney,
      lineItems: o.lineItems.edges.map((e) => ({
        productId: e.node.product?.id ?? null,
        title: e.node.title,
        quantity: e.node.quantity,
        originalUnitPrice: e.node.originalUnitPriceSet.shopMoney,
      })),
    })),
  };

  return { ok: true, evidence };
}
