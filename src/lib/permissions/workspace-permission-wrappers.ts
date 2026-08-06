import "server-only";

import { NextResponse } from "next/server";
import { evaluateWorkspacePermission } from "@/lib/permissions/evaluate-workspace-permission";
import type { EvaluateWorkspacePermissionInput, WorkspacePermissionDecision } from "@/types/workspace-permissions";

/**
 * Ascend OS Phase 2, Slice 5 — the ONLY three ways anything in this
 * codebase should reach evaluateWorkspacePermission(). No route, service,
 * or future Zeno bridge should call the core evaluator directly and build
 * its own response-shaping around it — that's exactly the "each route
 * implements its own permission logic" outcome this slice exists to
 * prevent.
 */

// ── 1. Human session (HTTP route) ──────────────────────────────────────────

export async function requireWorkspacePermission(
  request: Request,
  input: Omit<EvaluateWorkspacePermissionInput, "uid">,
): Promise<WorkspacePermissionDecision | NextResponse> {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const decision = await evaluateWorkspacePermission({ ...input, uid });
  if (!decision.allowed) {
    // Never leak internal reasons (membership doc state, entitlement
    // details) verbatim to an HTTP caller — a coarse, non-enumerable
    // message plus a generic status is enough for the client.
    const status = decision.reason === "denied_no_membership" || decision.reason === "denied_workspace_inactive" ? 404 : 403;
    return NextResponse.json({ error: "Not authorized for this action" }, { status });
  }
  return decision;
}

// ── 2. Service-to-service (migration tooling, cross-service callers) ──────

/**
 * A shared secret alone must NEVER imply blanket Workspace authorization
 * — this signature makes that structurally impossible: `representedUid`
 * is required, not optional, so a caller cannot invoke this without
 * identifying the human user (or the literal string "system:<tool-name>"
 * for a genuinely system-initiated action, matching the actingAsUid
 * convention already established in Slices 3-4) being represented. The
 * shared-secret check itself (verifying the caller IS a legitimate
 * service, mirroring lib/auth/sso-bridge-token.ts's pattern) is expected
 * to happen at the network/route boundary BEFORE this is called — this
 * function is not a substitute for that, only for the separate question
 * of "is the represented actor allowed to do this in this Workspace."
 */
export async function evaluateServiceToServicePermission(params: {
  representedUid: string;
  workspaceId: string;
  permission: EvaluateWorkspacePermissionInput["permission"];
  resourceContext?: EvaluateWorkspacePermissionInput["resourceContext"];
}): Promise<WorkspacePermissionDecision> {
  if (!params.representedUid) {
    // Defensive — TypeScript already makes this required, but a caller
    // passing an empty string is a real way to accidentally get here.
    return {
      allowed: false,
      reason: "denied_invalid_context",
      workspaceId: params.workspaceId,
      permission: params.permission,
    };
  }
  return evaluateWorkspacePermission({
    uid: params.representedUid,
    workspaceId: params.workspaceId,
    permission: params.permission,
    resourceContext: params.resourceContext,
  });
}

// ── 3. Future Zeno-capability authorization (stub, not wired up yet) ──────

/**
 * Placeholder for the future Zeno execution bridge
 * (PHASE_1_IMPLEMENTATION_BLUEPRINT.md §4.6, POST /api/zeno/execute — not
 * built in this slice). Already requires representedUid for the same
 * reason as #2 above. Exists now so the future bridge has a named,
 * type-checked entry point to call rather than needing to invent one
 * under time pressure later — it is NOT called from anywhere yet.
 */
export async function evaluateZenoCapabilityPermission(params: {
  representedUid: string;
  workspaceId: string;
  capabilityRequiredPermission: EvaluateWorkspacePermissionInput["permission"];
}): Promise<WorkspacePermissionDecision> {
  return evaluateServiceToServicePermission({
    representedUid: params.representedUid,
    workspaceId: params.workspaceId,
    permission: params.capabilityRequiredPermission,
  });
}
