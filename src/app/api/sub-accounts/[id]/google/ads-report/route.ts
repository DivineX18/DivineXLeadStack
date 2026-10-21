import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { googleCan } from "@/lib/google/capabilities";
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
import type { SubAccountDoc } from "@/types";

/**
 * Read this workspace's BOUND Google Ads account.
 *
 *   GET /api/sub-accounts/[id]/google/ads-report
 *
 * The target comes from the stored binding and nothing else. Unlike the bind
 * route, this accepts no customer id at all, which is the stronger property:
 * there is no parameter to tamper with, and a workspace can only ever read the
 * account a server-side verification already placed in its own connection.
 *
 * TWO QUESTIONS, ASKED SEPARATELY, because one query cannot tell them apart.
 * "This account has no campaigns" and "this account had no delivery in the
 * window I happened to pick" both arrive as zero rows from a metrics query,
 * and they call for completely different responses. So existence is asked
 * first, without a date filter, and only then is delivery looked for.
 *
 * WINDOWS WIDEN, THEY DO NOT DISAPPEAR. Each attempt is an explicit closed
 * range ending on the last COMPLETE day in the account's own timezone. There
 * is no unbounded query and today is never included, because today is partial
 * until midnight in that zone and including it makes every metric look
 * collapsed for reasons that have nothing to do with the campaigns.
 *
 * INT64 STRINGS ARE LEFT ALONE. `metrics.cost_micros` arrives as a JSON string
 * and is passed through untouched. Nothing here calls Number() on it: that
 * loses precision above 2^53 and, more importantly, canonical money parsing
 * belongs to Ascend's primitives, which require the raw value and the currency
 * together. Rounding here would destroy the input they are built to validate.
 *
 * Read-only: every call is a SELECT.
 */

/** Widening attempts, in days. Five requests at most against an Explorer-tier
 *  quota of 2,880 operations a day, so discovery cannot eat the budget. */
const LOOKBACK_DAYS = [7, 30, 90, 365];

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  if (!snap.exists) return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  const config = (snap.data() as SubAccountDoc).googleConfig ?? null;

  if (!config?.connected || !googleCan(config, "ads")) {
    return NextResponse.json({ error: "Google Ads is not granted for this workspace" }, { status: 400 });
  }
  const customerId = config.adsCustomerId;
  const timeZone = config.adsTimeZone;
  const currencyCode = config.adsCurrencyCode;
  if (!customerId || !timeZone || !currencyCode) {
    // Refusing beats falling back. A UTC default would compute the wrong day
    // boundary and a USD default would mislabel the money, both silently.
    return NextResponse.json(
      {
        error: "no_ads_account_bound",
        detail: "Bind an Ads account first; its timezone and currency are read from Google at bind time.",
      },
      { status: 400 },
    );
  }
  const loginCustomerId = config.adsLoginCustomerId ?? null;

  // ONE token, minted per request and held in a local. An earlier draft of
  // this cached it in a module-level variable, which in a long-lived server
  // process survives between requests and would hand one workspace's access
  // token to the next caller. Request-scoped state does not belong at module
  // scope, and for a credential it is a cross-tenant leak rather than an
  // inefficiency.
  let accessToken: string;
  try {
    accessToken = await accessTokenForConfig(config);
  } catch (err) {
    return NextResponse.json(
      { error: "token_refresh_failed", detail: err instanceof Error ? err.message : "unknown" },
      { status: 502 },
    );
  }

  // Question one: are there campaigns at all?
  const existence = await adsSearch(accessToken, customerId, CAMPAIGN_EXISTENCE_QUERY, {
    loginCustomerId,
  });
  if (!existence.ok) {
    return NextResponse.json(
      { error: "campaign_existence_query_failed", googleError: readAdsError(existence) },
      { status: 502 },
    );
  }
  const campaignRows = (existence.body as { results?: unknown[] } | null)?.results ?? [];

  const attempts: {
    window: ReturnType<typeof completedWindow>;
    ok: boolean;
    requestId: string | null;
    rowCount: number;
    /** Rows whose impressions, clicks or cost are non-zero. The number that
     *  decides whether this window is usable, which rowCount does not. */
    deliveringRowCount: number;
    /** RAW rows, int64 strings intact. Never numeric-coerced here. */
    results: unknown;
    fieldMask: unknown;
    googleError: ReturnType<typeof readAdsError>;
  }[] = [];

  if (campaignRows.length > 0) {
    for (const days of LOOKBACK_DAYS) {
      const window = completedWindow(timeZone, days);
      const call = await adsSearch(
        accessToken,
        customerId,
        campaignPerformanceQuery(window.startDate, window.endDate),
        { loginCustomerId },
      );
      const results = (call.body as { results?: unknown[] } | null)?.results ?? [];
      const rows = Array.isArray(results) ? results : [];
      const delivering = rows.filter(rowHasDelivery);
      attempts.push({
        window,
        ok: call.ok,
        requestId: call.requestId,
        rowCount: rows.length,
        deliveringRowCount: delivering.length,
        results,
        fieldMask: (call.body as { fieldMask?: unknown } | null)?.fieldMask ?? null,
        googleError: readAdsError(call),
      });
      // Stop at the first window with actual DELIVERY, not merely rows. Google
      // returns a row per campaign whether or not it ran, so an earlier
      // version of this stopped at seven days on two rows of pure zeroes and
      // reported them as usable data. Beyond that, widening further would
      // spend quota to answer a settled question and return a worse answer:
      // less current, and less comparable to any baseline.
      if (call.ok && delivering.length > 0) break;
      if (!call.ok) break;
    }
  }

  const delivered = attempts.find((a) => a.ok && a.deliveringRowCount > 0) ?? null;

  return NextResponse.json({
    apiVersion: GOOGLE_ADS_API_VERSION,
    developerTokenSent: false,
    customerId,
    loginCustomerId,
    currencyCode,
    timeZone,
    campaignCount: Array.isArray(campaignRows) ? campaignRows.length : 0,
    campaigns: campaignRows,
    campaignExistenceRequestId: existence.requestId,
    attempts,
    /** The window whose rows should be used, or null if none produced any. */
    chosenWindow: delivered?.window ?? null,
    /** True only when some campaign actually delivered in one of the windows.
     *  Distinct from "the query worked", which it did either way. */
    hasUsableData: !!delivered,
    /** Why there is nothing to observe, when there is nothing. The three cases
     *  need different answers and a single empty result hides which applies. */
    emptyReason: delivered
      ? null
      : (Array.isArray(campaignRows) ? campaignRows.length : 0) === 0
        ? "no_campaigns"
        : attempts.some((a) => !a.ok)
          ? "query_failed"
          : "campaigns_exist_but_no_delivery_in_any_window",
    fetchedAt: new Date().toISOString(),
  });
}
