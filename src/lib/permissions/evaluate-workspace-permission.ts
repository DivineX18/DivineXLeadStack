import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { resolveAuthedCaller, resolveSubAccountAccess } from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { effectiveBillingState } from "@/lib/billing/status";
import type { SubAccountBilling } from "@/types/billing";
import { roleHasPermission } from "@/lib/permissions/workspace-permission-compat";
import { requirementsFor } from "@/lib/permissions/workspace-permission-requirements";
import { logPermissionDecision } from "@/lib/permissions/workspace-permission-audit";
import {
  isWorkspacePermission,
  type EffectiveRole,
  type EvaluateWorkspacePermissionInput,
  type WorkspacePermissionDecision,
} from "@/types/workspace-permissions";

/**
 * Ascend OS Phase 2, Slice 5 — the single authoritative Workspace
 * permission evaluator. Deliberately does NOT import NextResponse (not
 * even transitively through a route-only helper) — that's what makes it
 * safe to call from human-session routes, service-to-service migration
 * tooling, and (in a future slice) the Zeno execution bridge alike, none
 * of which should have to construct an HTTP response to get a decision.
 *
 * Evaluation order (explicit, tested — scripts/verify-workspace-permission-
 * evaluator.mts):
 *   1. Validate the permission key.
 *   2. Resolve the caller's identity/claims (resolveAuthedCaller).
 *   3. Confirm the sub-account exists and the caller has active access to
 *      it (resolveSubAccountAccess — the EXISTING tenancy logic, reused,
 *      not reimplemented).
 *   4. If a Workspace Mapping v2 record exists for this sub-account,
 *      confirm it isn't archived (absence of a mapping is normal and
 *      never itself a denial).
 *   5. Resolve entitlement/feature-gate requirements for this permission.
 *   6. Apply the role-to-permission compatibility mapping.
 *   7. Deny by default.
 *
 * Never trusts a caller-supplied role — the effective role is always
 * resolved server-side from resolveSubAccountAccess's own Firestore reads,
 * never taken from resourceContext or any other caller input.
 */
export async function evaluateWorkspacePermission(
  input: EvaluateWorkspacePermissionInput,
): Promise<WorkspacePermissionDecision> {
  const { uid, workspaceId, permission } = input;

  const base = { workspaceId, permission };

  // 1. Validate the permission key.
  if (!isWorkspacePermission(permission)) {
    const decision: WorkspacePermissionDecision = { allowed: false, reason: "denied_unknown_permission", ...base };
    return decision; // not audit-logged as a "permission" since it isn't a real one
  }

  if (!uid || !workspaceId) {
    const decision: WorkspacePermissionDecision = { allowed: false, reason: "denied_invalid_context", ...base };
    return decision;
  }

  // 2. Resolve caller identity — never trust a caller-supplied role.
  const callerResult = await resolveAuthedCaller(uid);
  if (!callerResult.ok) {
    const decision: WorkspacePermissionDecision = { allowed: false, reason: "denied_no_membership", ...base };
    logPermissionDecision(decision, uid);
    return decision;
  }

  // 3. Confirm sub-account exists + caller has active access — reuses the
  // EXACT existing tenancy logic (extracted, not reimplemented).
  const accessResult = await resolveSubAccountAccess(callerResult.caller, workspaceId);
  if (!accessResult.ok) {
    const reason = accessResult.reason === "sub_account_not_found" ? "denied_workspace_inactive" : "denied_no_membership";
    const decision: WorkspacePermissionDecision = { allowed: false, reason, ...base };
    logPermissionDecision(decision, uid);
    return decision;
  }
  const effectiveRole = accessResult.access.subAccountRole as EffectiveRole;

  // 4. Workspace Mapping v2 status, if one exists for this sub-account —
  // its absence is normal (most sub-accounts don't have one yet) and
  // never itself a denial.
  const mapping = await getMappingBySubAccountId(workspaceId);
  if (mapping && mapping.status === "archived") {
    const decision: WorkspacePermissionDecision = { allowed: false, reason: "denied_workspace_inactive", effectiveRole, ...base };
    logPermissionDecision(decision, uid);
    return decision;
  }

  // 5a. Client Billing v1 lapsed state blocks everything except the two
  // permissions a customer needs to see/resolve their own paywall —
  // mirrors the REAL existing BillingGuard behavior (CLAUDE.md's Client
  // Billing v1 section: "The agency owner is never walled"), not invented.
  const subSnap = await getAdminDb().doc(`subAccounts/${workspaceId}`).get();
  const sub = subSnap.data() as { billing?: SubAccountBilling } | undefined;
  if (effectiveRole !== "agencyOwner" && sub?.billing) {
    const billingState = effectiveBillingState(sub.billing);
    if (billingState === "lapsed" && permission !== "workspace.read" && permission !== "billing.read") {
      const decision: WorkspacePermissionDecision = { allowed: false, reason: "denied_entitlement", effectiveRole, ...base };
      logPermissionDecision(decision, uid);
      return decision;
    }
  }

  // 5b. Feature-gate requirement, if this permission has a REAL one
  // (requirementsFor never invents one — see workspace-permission-
  // requirements.ts). Agency owner is not exempted here: a gate being off
  // means the agency itself hasn't turned the feature on, which is a
  // different axis from who's allowed to use it once it is on.
  const requirements = requirementsFor(permission);
  if (requirements.featureGate) {
    const gateValue = (sub as Record<string, unknown> | undefined)?.[requirements.featureGate];
    if (gateValue !== true) {
      const decision: WorkspacePermissionDecision = { allowed: false, reason: "denied_feature_gate", effectiveRole, ...base };
      logPermissionDecision(decision, uid);
      return decision;
    }
  }
  // requirements.ascendTier is never set today (see the type's doc
  // comment) — nothing to check yet, deliberately not invented.

  // 5c. Optional resource-level territory check — reuses the EXISTING
  // territory-filter.ts logic, never reimplemented.
  if (input.resourceContext?.territoryId !== undefined) {
    const scope = await loadEffectiveTerritoryScope(accessResult.access);
    if (scope.enforce) {
      const territoryId = input.resourceContext.territoryId;
      if (!territoryId || !(scope.ids ?? []).includes(territoryId)) {
        const decision: WorkspacePermissionDecision = { allowed: false, reason: "denied_role", effectiveRole, ...base };
        logPermissionDecision(decision, uid);
        return decision;
      }
    }
  }

  // 6. Role-to-permission compatibility mapping.
  if (!roleHasPermission(effectiveRole, permission)) {
    const decision: WorkspacePermissionDecision = { allowed: false, reason: "denied_role", effectiveRole, ...base };
    logPermissionDecision(decision, uid);
    return decision;
  }

  // Allowed.
  const decision: WorkspacePermissionDecision = {
    allowed: true,
    reason: effectiveRole === "agencyOwner" ? "allowed_agency_owner" : "allowed_workspace_role",
    effectiveRole,
    ...base,
  };
  logPermissionDecision(decision, uid); // no-op for non-high-risk permissions, per workspace-permission-audit.ts
  return decision;
}
