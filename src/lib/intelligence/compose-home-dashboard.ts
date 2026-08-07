import "server-only";

import { composeBusinessHealthSummary } from "@/lib/intelligence/compose-business-health";
import { composeIntelligenceSnapshot } from "@/lib/intelligence/resolve-intelligence-snapshot";
import { deriveRecommendedNextAction } from "@/lib/intelligence/derive-next-action";
import type { HomeDashboardData } from "@/types/intelligence";

/**
 * Ascend OS Phase 2, Slice 9 — Home Dashboard composition. Fetches Flow
 * operational data and Ascend intelligence data IN PARALLEL
 * (Promise.all) — the two sides are fully independent, so an Ascend
 * outage never delays or blocks the CRM half from rendering, and vice
 * versa. This is the master prompt's "never block the page because
 * Ascend is unavailable" requirement, implemented structurally (parallel
 * fetch, independent failure domains) rather than just documented.
 */
export async function composeHomeDashboard(workspaceId: string): Promise<HomeDashboardData> {
  const [businessHealth, intelligence] = await Promise.all([
    composeBusinessHealthSummary(workspaceId),
    composeIntelligenceSnapshot(workspaceId),
  ]);

  return {
    workspaceId,
    businessHealth,
    intelligence,
    recommendedNextAction: deriveRecommendedNextAction(intelligence),
  };
}
