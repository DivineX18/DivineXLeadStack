import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { googleCan } from "@/lib/google/capabilities";
import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { createAscendIntelligenceClient } from "@/lib/intelligence/ascend-intelligence-client";
import { buildAdsEvidence, fetchBoundAdsReport } from "@/lib/google/ads-fetch";
import type { SubAccountDoc } from "@/types";

/**
 * Send this workspace's Google Ads evidence to Ascend.
 *
 *   POST /api/sub-accounts/[id]/google/ads-sync
 *
 * The one place Ads data crosses from Flow into the intelligence layer.
 *
 * TENANCY, which is the whole risk here. Two identities have to line up and
 * NEITHER is taken from the caller. The Ads customer comes from the stored
 * binding, written only after a server-side verification against Google's own
 * accessible hierarchy. The Ascend business profile comes from this
 * workspace's mapping record. A caller cannot name either, so there is no
 * parameter that could point one workspace's evidence at another's profile.
 *
 * Ascend then checks the same thing independently: the bridge credential
 * authorizes exactly one business profile, and a payload naming a different
 * one is refused there too. Two checks, derived separately, and the write
 * needs both.
 *
 * Read-only against Google. The only write is the observation Ascend records.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  if (!snap.exists) return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  const config = (snap.data() as SubAccountDoc).googleConfig ?? null;

  if (!config?.connected || !googleCan(config, "ads")) {
    return NextResponse.json({ error: "Google Ads is not granted for this workspace" }, { status: 400 });
  }

  // Resolved from the workspace mapping, never from the request. Without it
  // there is nowhere for the evidence to land, and guessing a profile id would
  // write one workspace's numbers onto another business.
  const mapping = await getMappingBySubAccountId(id).catch(() => null);
  const businessProfileId = mapping?.primaryAscendBusinessProfileId ?? null;
  if (!businessProfileId || mapping?.status === "archived") {
    return NextResponse.json(
      { error: "no_business_profile", detail: "This workspace is not linked to an Ascend business profile." },
      { status: 400 },
    );
  }

  const result = await fetchBoundAdsReport(config);
  if (!result.ok) {
    const status = result.error === "no_ads_account_bound" ? 400 : 502;
    return NextResponse.json(result, { status });
  }

  if (!result.delivered) {
    // Nothing delivered in any window tried. Sending the zeroes would record
    // "no spend" as a measured fact for a window nobody ran ads in, which is
    // true but useless, and would also let an idle account look like a
    // successful sync. Say what happened instead.
    return NextResponse.json(
      {
        sent: false,
        reason: result.emptyReason,
        customerId: result.customerId,
        campaignCount: result.campaignCount,
        windowsTried: result.attempts.map((a) => a.window),
      },
      { status: 200 },
    );
  }

  const evidence = buildAdsEvidence(result, result.delivered);
  const client = createAscendIntelligenceClient();
  const outcome = await client.postGoogleAdsEvidence(businessProfileId, evidence);

  if (!outcome.ok) {
    // Surfaced with Ascend's own code. "not_configured", "timeout" and
    // "invalid_request" need different responses, and a single "sync failed"
    // would hide which.
    return NextResponse.json(
      { sent: false, bridgeError: { code: outcome.code, message: outcome.message }, window: evidence.window },
      { status: 502 },
    );
  }

  return NextResponse.json({
    sent: true,
    businessProfileId,
    customerId: evidence.customerId,
    window: evidence.window,
    currencyCode: evidence.currencyCode,
    timeZone: evidence.timeZone,
    campaigns: evidence.campaigns.length,
    googleRequestId: evidence.requestId,
    ascend: outcome.data,
  });
}
