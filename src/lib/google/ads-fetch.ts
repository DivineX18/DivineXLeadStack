import "server-only";

import { accessTokenForConfig } from "@/lib/google/api";
import {
  CAMPAIGN_EXISTENCE_QUERY,
  GOOGLE_ADS_API_VERSION,
  adsSearch,
  campaignPerformanceQuery,
  completedWindow,
  readAdsError,
  rowHasDelivery,
} from "@/lib/google/ads";
import type { GoogleConfig } from "@/types/tenancy";

/**
 * Read a workspace's bound Ads account, once, for both the operator-facing
 * report and the Ascend sync.
 *
 * Extracted so the two cannot drift. Two copies of this would mean the number
 * an operator reads and the number Ascend learns from could be computed
 * differently, and that divergence is invisible until someone compares them.
 *
 * Read-only: every call is a SELECT. Nothing here can mutate an Ads account.
 */

/** Widening attempts, in days. Five requests at most against an Explorer-tier
 *  quota of 2,880 operations a day, so discovery cannot eat the budget. */
export const LOOKBACK_DAYS = [7, 30, 90, 365];

export interface AdsWindowAttempt {
  window: ReturnType<typeof completedWindow>;
  ok: boolean;
  requestId: string | null;
  rowCount: number;
  /** Rows with non-zero impressions, clicks or cost. The number that decides
   *  whether a window is usable, which rowCount does not. */
  deliveringRowCount: number;
  /** RAW rows, int64 strings intact. Never numeric-coerced here: canonical
   *  money parsing belongs to Ascend's primitives, which need the raw value
   *  and the currency together. */
  results: unknown[];
  fieldMask: unknown;
  googleError: ReturnType<typeof readAdsError>;
}

export type AdsFetchResult =
  | { ok: false; error: "no_ads_account_bound" | "token_refresh_failed" | "campaign_existence_query_failed"; detail: string; googleError?: ReturnType<typeof readAdsError> }
  | {
      ok: true;
      apiVersion: string;
      customerId: string;
      loginCustomerId: string | null;
      currencyCode: string;
      timeZone: string;
      campaignCount: number;
      campaigns: unknown[];
      campaignExistenceRequestId: string | null;
      attempts: AdsWindowAttempt[];
      /** The attempt whose rows should be used, or null if none delivered. */
      delivered: AdsWindowAttempt | null;
      emptyReason: null | "no_campaigns" | "query_failed" | "campaigns_exist_but_no_delivery_in_any_window";
      fetchedAt: string;
    };

export async function fetchBoundAdsReport(config: GoogleConfig): Promise<AdsFetchResult> {
  const customerId = config.adsCustomerId;
  const timeZone = config.adsTimeZone;
  const currencyCode = config.adsCurrencyCode;
  if (!customerId || !timeZone || !currencyCode) {
    // Refusing beats falling back. A UTC default computes the wrong day
    // boundary and a USD default mislabels the money, both silently.
    return {
      ok: false,
      error: "no_ads_account_bound",
      detail: "Bind an Ads account first; its timezone and currency are read from Google at bind time.",
    };
  }
  const loginCustomerId = config.adsLoginCustomerId ?? null;

  // ONE token, per call, in a local. A module-level cache here would survive
  // between requests in a long-lived process and hand one workspace's access
  // token to the next caller, which is a cross-tenant leak rather than an
  // inefficiency.
  let accessToken: string;
  try {
    accessToken = await accessTokenForConfig(config);
  } catch (err) {
    return { ok: false, error: "token_refresh_failed", detail: err instanceof Error ? err.message : "unknown" };
  }

  // Asked separately, because one query cannot tell the two apart: "no
  // campaigns" and "no delivery in the window I picked" both arrive as zero
  // rows and call for completely different responses.
  const existence = await adsSearch(accessToken, customerId, CAMPAIGN_EXISTENCE_QUERY, { loginCustomerId });
  if (!existence.ok) {
    return {
      ok: false,
      error: "campaign_existence_query_failed",
      detail: "Google refused the campaign query.",
      googleError: readAdsError(existence),
    };
  }
  const campaignRows = ((existence.body as { results?: unknown[] } | null)?.results ?? []) as unknown[];

  const attempts: AdsWindowAttempt[] = [];
  if (campaignRows.length > 0) {
    for (const days of LOOKBACK_DAYS) {
      const window = completedWindow(timeZone, days);
      const call = await adsSearch(accessToken, customerId, campaignPerformanceQuery(window.startDate, window.endDate), {
        loginCustomerId,
      });
      const results = (call.body as { results?: unknown[] } | null)?.results ?? [];
      const rows = Array.isArray(results) ? results : [];
      attempts.push({
        window,
        ok: call.ok,
        requestId: call.requestId,
        rowCount: rows.length,
        deliveringRowCount: rows.filter(rowHasDelivery).length,
        results: rows,
        fieldMask: (call.body as { fieldMask?: unknown } | null)?.fieldMask ?? null,
        googleError: readAdsError(call),
      });
      // Stop at the first window with actual DELIVERY, not merely rows. Google
      // returns a row per campaign whether or not it ran. Widening past a
      // delivering window would also return a worse answer: less current, and
      // less comparable to any baseline.
      if (call.ok && attempts[attempts.length - 1]!.deliveringRowCount > 0) break;
      if (!call.ok) break;
    }
  }

  const delivered = attempts.find((a) => a.ok && a.deliveringRowCount > 0) ?? null;
  return {
    ok: true,
    apiVersion: GOOGLE_ADS_API_VERSION,
    customerId,
    loginCustomerId,
    currencyCode,
    timeZone,
    campaignCount: campaignRows.length,
    campaigns: campaignRows,
    campaignExistenceRequestId: existence.requestId,
    attempts,
    delivered,
    emptyReason: delivered
      ? null
      : campaignRows.length === 0
        ? "no_campaigns"
        : attempts.some((a) => !a.ok)
          ? "query_failed"
          : "campaigns_exist_but_no_delivery_in_any_window",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * The evidence payload Ascend receives: the narrowest thing that lets it
 * normalize safely.
 *
 * Int64 values are forwarded as the STRINGS Google sent. Nothing is coerced
 * here, because canonical money parsing lives with Ascend's primitives and a
 * Number() on the way over would both lose precision above 2^53 and destroy
 * the input they exist to validate.
 *
 * No OAuth material crosses. Not the refresh token, not the access token, not
 * the client secret, not a session cookie.
 */
export function buildAdsEvidence(
  result: Extract<AdsFetchResult, { ok: true }>,
  attempt: AdsWindowAttempt,
): {
  source: "google_ads";
  apiVersion: string;
  customerId: string;
  loginCustomerId: string | null;
  currencyCode: string;
  timeZone: string;
  window: { startDate: string; endDate: string; days: number };
  fetchedAt: string;
  requestId: string | null;
  campaigns: {
    id: string;
    name: string | null;
    status: string | null;
    metrics: Record<string, string | number>;
  }[];
} {
  const campaigns: { id: string; name: string | null; status: string | null; metrics: Record<string, string | number> }[] = [];
  for (const row of attempt.results) {
    const c = (row as { campaign?: Record<string, unknown> }).campaign;
    const m = (row as { metrics?: Record<string, unknown> }).metrics ?? {};
    const id = typeof c?.id === "string" ? c.id : null;
    // A row with no campaign id cannot be scoped to a resource, and an
    // observation that cannot name what it measured is not evidence.
    if (!id) continue;
    const metrics: Record<string, string | number> = {};
    for (const key of ["impressions", "clicks", "costMicros", "conversions", "conversionsValue"]) {
      const v = m[key];
      if (typeof v === "string" || typeof v === "number") metrics[key] = v;
    }
    campaigns.push({
      id,
      name: typeof c?.name === "string" ? c.name : null,
      status: typeof c?.status === "string" ? c.status : null,
      metrics,
    });
  }
  return {
    source: "google_ads",
    apiVersion: result.apiVersion,
    customerId: result.customerId,
    loginCustomerId: result.loginCustomerId,
    currencyCode: result.currencyCode,
    timeZone: result.timeZone,
    window: { startDate: attempt.window.startDate, endDate: attempt.window.endDate, days: attempt.window.days },
    fetchedAt: result.fetchedAt,
    requestId: attempt.requestId,
    campaigns,
  };
}
