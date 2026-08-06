import "server-only";

import { NextResponse } from "next/server";
import { evaluateWorkspaceEntitlements } from "@/lib/entitlements/evaluate-workspace-entitlements";
import { evaluateWorkspacePermission } from "@/lib/permissions/evaluate-workspace-permission";
import type { EvaluateWorkspaceEntitlementsInput, WorkspaceEntitlementSummary } from "@/types/workspace-entitlements";

/**
 * Ascend OS Phase 2, Slice 6 — the ONLY ways anything in this codebase
 * should reach evaluateWorkspaceEntitlements(). Same discipline as Slice
 * 5's workspace-permission-wrappers.ts: no route, screen, or future Zeno
 * bridge should call the core evaluator directly.
 *
 * Entitlements are workspace-scoped, not user-scoped (see the core
 * evaluator's doc comment) — but every HUMAN-facing wrapper here still
 * composes with Slice 5's PERMISSION evaluator first, because "can this
 * workspace even be queried by this caller" is a permission question
 * (`workspace.read`), not an entitlement one. This is the required
 * "compatibility with Slice 5" wiring, done once here rather than left to
 * each call site to remember.
 */

// ── 1. Human session (HTTP route / UI data loader) ─────────────────────────

export async function requireWorkspaceEntitlements(
  request: Request,
  input: EvaluateWorkspaceEntitlementsInput,
): Promise<WorkspaceEntitlementSummary | NextResponse> {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const permissionDecision = await evaluateWorkspacePermission({
    uid,
    workspaceId: input.workspaceId,
    permission: "workspace.read",
  });
  if (!permissionDecision.allowed) {
    return NextResponse.json({ error: "Not authorized for this workspace" }, { status: 403 });
  }
  return evaluateWorkspaceEntitlements(input, permissionDecision.effectiveRole === "agencyOwner");
}

// ── 2. Server action (no Request object) ───────────────────────────────────

export async function getWorkspaceEntitlementsForServerAction(
  uid: string,
  input: EvaluateWorkspaceEntitlementsInput,
): Promise<WorkspaceEntitlementSummary | { error: string }> {
  const permissionDecision = await evaluateWorkspacePermission({
    uid,
    workspaceId: input.workspaceId,
    permission: "workspace.read",
  });
  if (!permissionDecision.allowed) {
    return { error: "Not authorized for this workspace" };
  }
  return evaluateWorkspaceEntitlements(input, permissionDecision.effectiveRole === "agencyOwner");
}

// ── 3. Service-to-service (migration tooling, cross-service callers) ──────

/**
 * Same "never a blanket bypass" principle as Slice 5's
 * evaluateServiceToServicePermission — a service caller still identifies
 * a represented human actor and goes through the same permission check,
 * it just doesn't have a Request object to read a header from.
 */
export async function evaluateWorkspaceEntitlementsForService(params: {
  representedUid: string;
  input: EvaluateWorkspaceEntitlementsInput;
}): Promise<WorkspaceEntitlementSummary | { error: string }> {
  if (!params.representedUid) {
    return { error: "denied_invalid_context" };
  }
  const permissionDecision = await evaluateWorkspacePermission({
    uid: params.representedUid,
    workspaceId: params.input.workspaceId,
    permission: "workspace.read",
  });
  if (!permissionDecision.allowed) {
    return { error: "Not authorized for this workspace" };
  }
  return evaluateWorkspaceEntitlements(params.input, permissionDecision.effectiveRole === "agencyOwner");
}

// ── 4. Future Zeno / Ascend Intelligence bridge (stub, not wired up yet) ──

/**
 * Placeholder mirroring Slice 5's evaluateZenoCapabilityPermission stub.
 * Not called from anywhere yet — exists so the future Zeno bridge and the
 * future Ascend Intelligence service client have a named entry point for
 * "what does this workspace own" rather than inventing one under time
 * pressure later.
 */
export async function evaluateWorkspaceEntitlementsForZeno(params: {
  representedUid: string;
  workspaceId: string;
}): Promise<WorkspaceEntitlementSummary | { error: string }> {
  return evaluateWorkspaceEntitlementsForService({
    representedUid: params.representedUid,
    input: { workspaceId: params.workspaceId },
  });
}

export const evaluateWorkspaceEntitlementsForAscendBridge = evaluateWorkspaceEntitlementsForZeno;
