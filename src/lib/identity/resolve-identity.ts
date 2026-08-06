import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { resolveAuthedCaller, resolveSubAccountAccess } from "@/lib/auth/require-tenancy";
import { getIdentityLinkByFirebaseUid } from "@/lib/auth/identity-links-service";
import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { roleHasPermission } from "@/lib/permissions/workspace-permission-compat";
import { evaluateWorkspaceEntitlements } from "@/lib/entitlements/evaluate-workspace-entitlements";
import { decideWorkspaceSelection } from "@/lib/identity/workspace-selection";
import { deriveIdentitySource, deriveMigrationState } from "@/lib/identity/identity-migration-state";
import { logIdentityEvent } from "@/lib/identity/identity-audit";
import { WORKSPACE_PERMISSIONS, type EffectiveRole } from "@/types/workspace-permissions";
import type { IdentityContext, SessionIdentity, WorkspaceIdentity, WorkspaceIdentityStatus } from "@/types/identity";

/**
 * Ascend OS Phase 2, Slice 7 — the single canonical identity resolver.
 * Composes Slices 3-6 (identityLinks, the SSO bridge's reused access
 * checks, Workspace Mapping v2, the permission evaluator, the entitlement
 * evaluator) into one IdentityContext. Does NOT authenticate — `uid` must
 * already be a middleware-verified Firebase uid (from the `__session`
 * cookie, per src/middleware.ts's authMiddleware, which sets the
 * `x-user-uid` header this function's callers read). This function only
 * ever performs Firestore reads, never a credential check.
 *
 * Composition order (source-verified by
 * scripts/verify-resolve-identity.mts):
 *   1. resolveAuthedCaller(uid) -- Slice 5, reused. Inactive/missing
 *      account -> session.state = "account_inactive", no workspace.
 *   2. getIdentityLinkByFirebaseUid(uid) -- Slice 3, reused -> identity
 *      source + migration state (derivation only, never mutated here).
 *   3. Workspace candidates from userMemberships/{uid}/subAccounts -- the
 *      EXISTING denormalized index that already powers the sub-account
 *      switcher (CLAUDE.md) -- read directly, not reimplemented.
 *   4. decideWorkspaceSelection() -- pure, this slice. Never guesses
 *      between multiple candidates (no "last active" signal exists in the
 *      schema, confirmed by this slice's audit).
 *   5. If a workspace was selected: resolveSubAccountAccess() -- Slice 5,
 *      reused -- for role/membership status.
 *   6. evaluateWorkspaceEntitlements() -- Slice 6, reused -- which ALSO
 *      independently re-validates archived-SubAccount/archived-mapping
 *      state (resolveSubAccountAccess alone does not check
 *      SubAccountDoc.status, matching its EXISTING, unmodified behavior —
 *      see the Slice 7 ledger for why this composition, not a third
 *      independent check, is what surfaces the true archived state).
 *   7. allowedPermissions computed via the pure roleHasPermission() (Slice
 *      5) over all 53 registered permissions -- zero extra Firestore
 *      reads beyond what resolving effectiveRole already required.
 */
export async function resolveIdentity(uid: string, options?: { explicitWorkspaceId?: string }): Promise<IdentityContext> {
  const resolvedAt = Date.now();

  if (!uid) {
    return {
      session: { state: "no_session", user: null, metadata: null },
      workspaceSelection: { workspaceId: null, reason: "none_available", candidates: [] },
      workspace: null,
      migrationState: "firebase_native",
      resolvedAt,
    };
  }

  const callerResult = await resolveAuthedCaller(uid);
  if (!callerResult.ok) {
    logIdentityEvent("session_anomaly", uid, { reason: callerResult.reason });
    return {
      session: { state: "account_inactive", user: null, metadata: null },
      workspaceSelection: { workspaceId: null, reason: "none_available", candidates: [] },
      workspace: null,
      migrationState: "firebase_native",
      resolvedAt,
    };
  }
  const caller = callerResult.caller;

  const link = await getIdentityLinkByFirebaseUid(uid);
  const hasIdentityLink = !!link;
  const source = deriveIdentitySource(hasIdentityLink, link?.linkSource ?? null);
  const migrationState = deriveMigrationState(hasIdentityLink);
  if (hasIdentityLink && source === "unknown") {
    logIdentityEvent("identity_conflict", uid, { reason: "unrecognized_link_source", linkSource: link?.linkSource });
  }

  const session: SessionIdentity = {
    state: "active",
    user: { uid: caller.uid, email: caller.email, status: caller.status, agencyId: caller.agencyId, agencyRole: caller.agencyRole },
    metadata: { provider: "firebase", source, hasIdentityLink, linkedClerkUserId: link?.clerkUserId ?? null },
  };

  const membershipSnap = await getAdminDb().collection(`userMemberships/${uid}/subAccounts`).get();
  const candidateWorkspaceIds = membershipSnap.docs.map((d) => d.id);
  const workspaceSelection = decideWorkspaceSelection(options?.explicitWorkspaceId ?? null, candidateWorkspaceIds);

  let workspace: WorkspaceIdentity | null = null;
  if (workspaceSelection.workspaceId) {
    workspace = await resolveWorkspaceIdentity(uid, caller, workspaceSelection.workspaceId);
  }

  return { session, workspaceSelection, workspace, migrationState, resolvedAt };
}

async function resolveWorkspaceIdentity(
  uid: string,
  caller: Parameters<typeof resolveSubAccountAccess>[0],
  workspaceId: string,
): Promise<WorkspaceIdentity> {
  const accessResult = await resolveSubAccountAccess(caller, workspaceId);
  if (!accessResult.ok) {
    logIdentityEvent("workspace_resolution_failure", uid, { workspaceId, reason: accessResult.reason });
    const status: WorkspaceIdentityStatus = accessResult.reason === "sub_account_not_found" ? "not_found" : "inactive";
    return { workspaceId, status, effectiveRole: null, mappingStatus: null, allowedPermissions: [], entitlements: null };
  }

  const effectiveRole = accessResult.access.subAccountRole as EffectiveRole;
  const [mapping, entitlements] = await Promise.all([
    getMappingBySubAccountId(workspaceId),
    evaluateWorkspaceEntitlements({ workspaceId }, effectiveRole === "agencyOwner"),
  ]);

  // Slice 6's evaluator independently re-checks archived SubAccount /
  // archived mapping state -- resolveSubAccountAccess alone does not
  // (existing, unmodified behavior). A blanket workspace_archived /
  // workspace_inactive denial across every module is the authoritative
  // signal here, not just accessResult.ok.
  const firstBlockedReason = entitlements.blockedModules[0]?.reason;
  const isBlanketStructuralDenial =
    entitlements.allowedModules.length === 0 &&
    (firstBlockedReason === "workspace_archived" || firstBlockedReason === "workspace_inactive") &&
    entitlements.blockedModules.every((d) => d.reason === firstBlockedReason);

  if (isBlanketStructuralDenial) {
    const status: WorkspaceIdentityStatus = firstBlockedReason === "workspace_archived" ? "archived" : "inactive";
    logIdentityEvent("workspace_resolution_failure", uid, { workspaceId, reason: status });
    return { workspaceId, status, effectiveRole: null, mappingStatus: mapping?.status ?? null, allowedPermissions: [], entitlements };
  }

  const allowedPermissions = WORKSPACE_PERMISSIONS.filter((p) => roleHasPermission(effectiveRole, p));
  return { workspaceId, status: "active", effectiveRole, mappingStatus: mapping?.status ?? null, allowedPermissions, entitlements };
}
