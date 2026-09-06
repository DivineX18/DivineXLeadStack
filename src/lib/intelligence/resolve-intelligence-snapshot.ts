import "server-only";

import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { createAscendIntelligenceClient } from "@/lib/intelligence/ascend-intelligence-client";
import { recommendationsFromGrowthScan } from "@/lib/intelligence/growth-scan-recommendations";
import type { IntelligenceSnapshot } from "@/types/intelligence";

const UNAVAILABLE_NO_PROFILE = {
  meta: { status: "unavailable" as const, fetchedAt: null, reasonCode: "no_linked_business_profile" },
  data: null,
};

/**
 * Ascend OS Phase 2, Slice 9 (corrected Slice 10.5 for the real client
 * method names/shapes) — resolves a Flow workspace (SubAccount) to its
 * linked Ascend business profile (Slice 4's Workspace Mapping v2,
 * `primaryAscendBusinessProfileId`) and composes one full
 * IntelligenceSnapshot from the client's 5 independent resources, each
 * fetched in parallel so one slow/failed resource never blocks the others.
 *
 * A workspace with no Workspace Mapping v2 record (the normal case for
 * most sub-accounts today — most have never been linked to an Ascend
 * business profile) returns every field as "unavailable" /
 * "no_linked_business_profile" — this is a real, first-class, expected
 * state, not an error.
 */
export async function composeIntelligenceSnapshot(workspaceId: string): Promise<IntelligenceSnapshot> {
  const mapping = await getMappingBySubAccountId(workspaceId).catch(() => null);
  const businessProfileId = mapping?.primaryAscendBusinessProfileId ?? null;

  if (!businessProfileId || mapping?.status === "archived") {
    return {
      businessProfileId: null,
      dashboardSummary: UNAVAILABLE_NO_PROFILE,
      croAudits: { ...UNAVAILABLE_NO_PROFILE, data: null },
      recommendations: { ...UNAVAILABLE_NO_PROFILE, data: null },
      growthTimeline: UNAVAILABLE_NO_PROFILE,
      memory: { ...UNAVAILABLE_NO_PROFILE, data: null },
      reports: { ...UNAVAILABLE_NO_PROFILE, data: null },
    };
  }

  const client = createAscendIntelligenceClient();
  const [dashboardSummary, croAudits, memory, growthTimeline, reports] = await Promise.all([
    client.getDashboardSummary(businessProfileId),
    client.getCroAudits(businessProfileId),
    client.getMemory(businessProfileId),
    client.getGrowthTimeline(businessProfileId),
    client.getReports(businessProfileId),
  ]);

  // croAudits is already sorted newest-first by the bridge query
  // (`orderBy(desc(croAudits.createdAt))`) — the newest row's
  // recommendations are the ones worth surfacing as actionable.
  const newestAudit = croAudits.data?.[0] ?? null;
  const audited = newestAudit?.recommendations ?? null;

  // A COMPLETED GROWTH SCAN IS SUFFICIENT ON ITS OWN.
  //
  // Recommendations used to come only from a CRO audit, so a customer who had
  // run the primary assessment saw their score and their constraint and then
  // "run a CRO Audit to generate some" — the entry point stopped short of the
  // one thing it exists to answer. A specialised audit refines these; it is
  // not a prerequisite for them.
  //
  // The audit still wins whenever it has produced any, because it is the
  // deeper artifact. The scan fills the gap rather than competing with it, and
  // each recommendation carries its own `source` so a derived item is never
  // passed off as an audited one.
  const derived = audited?.length ? null : recommendationsFromGrowthScan(dashboardSummary.data?.latestWebsiteScan ?? null);
  const recommendations = audited?.length ? audited : (derived?.length ? derived : audited);

  return {
    businessProfileId,
    dashboardSummary,
    croAudits,
    recommendations: {
      // Meta follows whichever source actually supplied them, so a customer is
      // never told data is unavailable while reading real recommendations.
      meta: derived?.length ? dashboardSummary.meta : croAudits.meta,
      data: recommendations,
    },
    growthTimeline,
    memory,
    reports,
  };
}
