import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { googleCan } from "@/lib/google/capabilities";
import { fetchBoundAdsReport } from "@/lib/google/ads-fetch";
import type { SubAccountDoc } from "@/types";

/**
 * Read this workspace's BOUND Google Ads account.
 *
 *   GET /api/sub-accounts/[id]/google/ads-report
 *
 * The target comes from the stored binding and nothing else. Unlike the bind
 * route, this accepts no customer id at all, which is the stronger property:
 * there is no parameter to tamper with, so a workspace can only ever read the
 * account a server-side verification already placed in its own connection.
 *
 * The fetch itself lives in lib/google/ads-fetch.ts, shared with the Ascend
 * sync, so the number an operator reads and the number Ascend learns from
 * cannot be computed differently.
 *
 * Read-only: every call is a SELECT.
 */
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

  const result = await fetchBoundAdsReport(config);
  if (!result.ok) {
    const status = result.error === "no_ads_account_bound" ? 400 : 502;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json({
    ...result,
    /** True only when some campaign actually delivered in one of the windows.
     *  Distinct from "the query worked", which it did either way. */
    hasUsableData: !!result.delivered,
    chosenWindow: result.delivered?.window ?? null,
    developerTokenSent: false,
  });
}
