import "server-only";

import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { createAscendIntelligenceClient } from "@/lib/intelligence/ascend-intelligence-client";
import type { IntelligenceSnapshot } from "@/types/intelligence";

const UNAVAILABLE_NO_PROFILE = {
  meta: { status: "unavailable" as const, fetchedAt: null, reasonCode: "no_linked_business_profile" },
  data: null,
};

/**
 * Ascend OS Phase 2, Slice 9 — resolves a Flow workspace (SubAccount) to
 * its linked Ascend business profile (Slice 4's Workspace Mapping v2,
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
      growthScore: UNAVAILABLE_NO_PROFILE,
      latestAssessment: UNAVAILABLE_NO_PROFILE,
      latestCroAudit: UNAVAILABLE_NO_PROFILE,
      recommendations: { ...UNAVAILABLE_NO_PROFILE, data: null },
      timeline: { ...UNAVAILABLE_NO_PROFILE, data: null },
      memory: UNAVAILABLE_NO_PROFILE,
      reports: { ...UNAVAILABLE_NO_PROFILE, data: null },
    };
  }

  const client = createAscendIntelligenceClient();
  const [assessment, croAudit, memory, timeline, reports] = await Promise.all([
    client.getLatestGrowthAssessment(businessProfileId),
    client.getLatestCroAudit(businessProfileId),
    client.getBusinessMemorySummary(businessProfileId),
    client.getGrowthTimeline(businessProfileId),
    client.getReports(businessProfileId),
  ]);

  return {
    businessProfileId,
    growthScore: {
      meta: assessment.meta,
      data: assessment.data?.growthScore ?? null,
    },
    latestAssessment: assessment,
    latestCroAudit: croAudit,
    recommendations: {
      meta: croAudit.meta,
      data: croAudit.data?.recommendations ?? null,
    },
    timeline,
    memory: {
      meta: memory.meta,
      data: memory.data,
    },
    reports,
  };
}
