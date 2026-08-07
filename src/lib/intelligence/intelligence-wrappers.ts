import "server-only";

import { evaluateWorkspacePermission } from "@/lib/permissions/evaluate-workspace-permission";
import { composeHomeDashboard } from "@/lib/intelligence/compose-home-dashboard";
import { composeIdentifyDashboard } from "@/lib/intelligence/compose-identify-dashboard";
import { composeIntelligenceSnapshot } from "@/lib/intelligence/resolve-intelligence-snapshot";
import type { HomeDashboardData, IdentifyDashboardData, IntelligenceSnapshot } from "@/types/intelligence";

/**
 * Ascend OS Phase 2, Slice 9 — the ONLY sanctioned public entry points for
 * Home/Identify data. Same discipline as every prior slice's wrapper
 * layer (Slices 5-8): the compose* functions above have no permission
 * check and must never be called directly from a page/route/server
 * action. Every wrapper here re-checks `workspace.read` via Slice 5's
 * real evaluator FIRST — deliberately redundant with the `/app/*` shell
 * layout's own gate (Slice 8), matching this effort's established
 * defense-in-depth discipline (e.g. Slice 7's identity resolver
 * independently re-derives permissions even though callers are already
 * behind middleware auth).
 */

export type IntelligenceWrapperResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function checkWorkspaceRead(uid: string, workspaceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const decision = await evaluateWorkspacePermission({ uid, workspaceId, permission: "workspace.read" });
  if (!decision.allowed) return { ok: false, error: "not_authorized_for_workspace" };
  return { ok: true };
}

export async function resolveHomeDashboard(uid: string, workspaceId: string): Promise<IntelligenceWrapperResult<HomeDashboardData>> {
  const access = await checkWorkspaceRead(uid, workspaceId);
  if (!access.ok) return access;
  return { ok: true, data: await composeHomeDashboard(workspaceId) };
}

export async function resolveIdentifyDashboard(uid: string, workspaceId: string): Promise<IntelligenceWrapperResult<IdentifyDashboardData>> {
  const access = await checkWorkspaceRead(uid, workspaceId);
  if (!access.ok) return access;
  return { ok: true, data: await composeIdentifyDashboard(workspaceId) };
}

export async function resolveIntelligenceSnapshot(uid: string, workspaceId: string): Promise<IntelligenceWrapperResult<IntelligenceSnapshot>> {
  const access = await checkWorkspaceRead(uid, workspaceId);
  if (!access.ok) return access;
  return { ok: true, data: await composeIntelligenceSnapshot(workspaceId) };
}

/**
 * Service-to-service variant (future Zeno/Ascend bridge) — same
 * `representedUid`-required, never-optional discipline as every prior
 * slice's service wrapper. Not called from anywhere yet.
 */
export async function resolveIntelligenceSnapshotForService(params: {
  representedUid: string;
  workspaceId: string;
}): Promise<IntelligenceWrapperResult<IntelligenceSnapshot>> {
  if (!params.representedUid) return { ok: false, error: "denied_invalid_context" };
  return resolveIntelligenceSnapshot(params.representedUid, params.workspaceId);
}
