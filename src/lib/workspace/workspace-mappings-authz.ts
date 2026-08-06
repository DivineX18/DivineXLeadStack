import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  getMappingBySubAccountId,
  reconcileMapping,
  type ReconcileOptions,
} from "@/lib/workspace/workspace-mappings-service";
import type { WorkspaceMappingDoc, ReconciliationResult, WorkspaceMappingResult } from "@/types/workspace-mappings";

/**
 * Human-session-authorized wrappers around the Workspace Mapping v2 service
 * (Ascend OS Phase 2, Slice 4). Explicitly separate from
 * workspace-mappings-service.ts, which has no built-in authorization and is
 * meant for service-to-service migration/reconciliation tooling.
 *
 * Reuses Flow's EXISTING workspace authorization exactly as-is
 * (lib/auth/require-tenancy.ts::requireSubAccountMember) rather than
 * building a second, weaker check — per this slice's explicit instruction.
 * Every function here fails closed (returns a NextResponse the caller must
 * return directly) if the sub-account is missing, archived, or the caller
 * isn't an active member.
 */

export async function getWorkspaceMappingForAuthorizedCaller(
  request: Request,
  flowSubAccountId: string,
): Promise<WorkspaceMappingDoc | NextResponse> {
  const access = await requireSubAccountMember(request, flowSubAccountId);
  if (access instanceof NextResponse) return access;

  const mapping = await getMappingBySubAccountId(flowSubAccountId);
  if (!mapping) {
    return NextResponse.json({ error: "No Workspace Mapping exists for this sub-account" }, { status: 404 });
  }
  if (mapping.status === "archived") {
    return NextResponse.json({ error: "This Workspace has been archived" }, { status: 403 });
  }
  return mapping;
}

export async function reconcileWorkspaceMappingForAuthorizedCaller(
  request: Request,
  flowSubAccountId: string,
  options?: ReconcileOptions,
): Promise<ReconciliationResult | NextResponse> {
  const access = await requireSubAccountMember(request, flowSubAccountId);
  if (access instanceof NextResponse) return access;
  // Reconciliation can reveal/repair drift — restrict to admins (or the
  // agency-owner shortcut, which requireSubAccountMember already applies).
  if (access.subAccountRole !== "admin" && access.subAccountRole !== "agencyOwner") {
    return NextResponse.json({ error: "Sub-account admin only" }, { status: 403 });
  }

  const mapping = await getMappingBySubAccountId(flowSubAccountId);
  if (!mapping) {
    return NextResponse.json({ error: "No Workspace Mapping exists for this sub-account" }, { status: 404 });
  }

  const result = (await reconcileMapping(mapping.workspaceId, access.uid, options)) as WorkspaceMappingResult<ReconciliationResult>;
  if (!result.ok) {
    // Never leak the internal reason string verbatim to an HTTP caller —
    // return a generic message, log the detail server-side only.
    console.error("[workspace-mappings-authz] reconcile failed:", result.reason);
    return NextResponse.json({ error: "Reconciliation could not complete" }, { status: 500 });
  }
  return result.value;
}
