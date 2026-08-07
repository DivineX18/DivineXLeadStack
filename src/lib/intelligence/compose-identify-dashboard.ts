import "server-only";

import { composeIntelligenceSnapshot } from "@/lib/intelligence/resolve-intelligence-snapshot";
import type { IdentifyDashboardData } from "@/types/intelligence";

/**
 * Ascend OS Phase 2, Slice 9 — Identify section composition. Unlike Home,
 * this section is intelligence-only (no Flow operational data) — it's
 * purely the "understand the business" surface (Growth Scan history, CRO
 * audits, recommendations, Business Memory, Growth Timeline). Kept as its
 * own composer (not a slice of composeHomeDashboard) so the Identify
 * pages can be resolved independently of Home.
 */
export async function composeIdentifyDashboard(workspaceId: string): Promise<IdentifyDashboardData> {
  const intelligence = await composeIntelligenceSnapshot(workspaceId);
  return { workspaceId, intelligence };
}
