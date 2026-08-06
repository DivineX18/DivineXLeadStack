/**
 * Ascend OS Phase 2, Slice 5 — the single, canonical Workspace permission
 * registry. Type-safe: an unrecognized string is a compile error at every
 * call site, and the runtime evaluator (evaluate-workspace-permission.ts)
 * denies any string not in this list rather than guessing.
 *
 * "Workspace" here is, today, the existing Flow SubAccount (Locked
 * Decision 3, PHASE_1_IMPLEMENTATION_BLUEPRINT.md §1.1) — not the Slice 4
 * workspaceMappings UUID. A Workspace Mapping v2 record is optional
 * additional context the evaluator layers on top when one exists for the
 * sub-account; its absence is normal (most sub-accounts don't have one
 * yet) and never itself a denial reason.
 */

export const WORKSPACE_PERMISSIONS = [
  "workspace.read",
  "workspace.update",
  "members.read",
  "members.invite",
  "members.manage",
  "billing.read",
  "billing.manage",
  "assessments.read",
  "assessments.run",
  "memory.read",
  "memory.write",
  "memory.approve",
  "recommendations.read",
  "recommendations.approve",
  "contacts.read",
  "contacts.create",
  "contacts.update",
  "contacts.delete",
  "pipeline.read",
  "pipeline.manage",
  "deals.read",
  "deals.manage",
  "tasks.read",
  "tasks.manage",
  "calendar.read",
  "calendar.manage",
  "funnels.read",
  "funnels.create",
  "funnels.edit",
  "funnels.publish",
  "websites.read",
  "websites.create",
  "websites.edit",
  "websites.publish",
  "forms.manage",
  "workflows.read",
  "workflows.edit",
  "workflows.activate",
  "broadcasts.read",
  "broadcasts.create",
  "broadcasts.send",
  "products.manage",
  "orders.read",
  "orders.refund",
  "stripe.connect",
  "domains.manage",
  "integrations.manage",
  "api.manage",
  "agency.manage",
  "reports.read",
  "reports.export",
  "zeno.advise",
  "zeno.execute",
] as const;

export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

export function isWorkspacePermission(value: string): value is WorkspacePermission {
  return (WORKSPACE_PERMISSIONS as readonly string[]).includes(value);
}

// ── Compatibility role model ────────────────────────────────────────────
//
// Existing Flow roles (unchanged, not migrated): SubAccountRole
// ("admin" | "collaborator") + the claims-based "agencyOwner" shortcut
// already synthesized by requireSubAccountMember(). This EffectiveRole
// type mirrors that exactly — it does not introduce a fourth value.
export type EffectiveRole = "agencyOwner" | "admin" | "collaborator";

// The future seven-role matrix (Owner/Admin/Manager/Marketing/Sales/
// Support/Viewer) from the architecture docs. Represented here in types
// ONLY, per this slice's explicit instruction — no persisted membership
// record is migrated to this, and it is not exposed in any UI yet. Kept
// so a future slice's mapping work has a name to target without inventing
// one from scratch.
export type FutureWorkspaceRole = "owner" | "admin" | "manager" | "marketing" | "sales" | "support" | "viewer";

// ── Entitlement / feature-gate requirement hooks ────────────────────────

/** A permission (or, since Slice 6, a workspace entitlement/module) may
 *  require an agency feature gate to be on. Field names are the REAL,
 *  verified gate fields on SubAccountDoc (grep-confirmed against
 *  src/types/tenancy.ts, Slice 5 ledger entry) — never invented.
 *  `communityEnabledByAgency` was added in Slice 6 for the
 *  communities/courses entitlement modules — it was already part of the
 *  same verified 15-field list Slice 5's audit found, Slice 5 just didn't
 *  need it for any of its 53 permissions. Shared here (not duplicated in
 *  a second gate-name type) so both slices' evaluators agree on exactly
 *  the same set of real gate fields. */
export type RequiredFeatureGate =
  | "apiAccessEnabledByAgency"
  | "broadcastsEnabledByAgency"
  | "funnelCheckoutEnabledByAgency"
  | "funnelsEnabledByAgency"
  | "websiteEnabledByAgency"
  | "customDomainsEnabledByAgency"
  | "aiSuiteEnabledByAgency"
  | "communityEnabledByAgency";

/** Placeholder for a future CRM-only vs. Full Ascend distinction. No
 *  permission in this slice's registry sets this — there is no real
 *  enforcement mechanism for it in Flow today (confirmed by audit), and
 *  this slice's instructions explicitly forbid inventing one. Kept as a
 *  named, typed extension point so a future slice can wire it (the most
 *  likely real signal: whether an ACTIVE Workspace Mapping v2 record
 *  exists for the sub-account) without a breaking type change. */
export type RequiredAscendTier = "full_ascend";

export interface PermissionRequirements {
  featureGate?: RequiredFeatureGate;
  ascendTier?: RequiredAscendTier; // never set today — see above
}

// ── Decision contract ─────────────────────────────────────────────────────

export type WorkspacePermissionDenialReason =
  | "denied_no_membership"
  | "denied_role"
  | "denied_entitlement"
  | "denied_feature_gate"
  | "denied_workspace_inactive"
  | "denied_unknown_permission"
  | "denied_invalid_context";

export type WorkspacePermissionAllowReason = "allowed_agency_owner" | "allowed_workspace_role";

export interface WorkspacePermissionDecision {
  allowed: boolean;
  reason: WorkspacePermissionAllowReason | WorkspacePermissionDenialReason;
  effectiveRole?: EffectiveRole;
  workspaceId: string;
  permission: WorkspacePermission;
}

export interface EvaluateWorkspacePermissionInput {
  uid: string;
  /** Today, this is the Flow subAccountId — see the file-level doc
   *  comment above. */
  workspaceId: string;
  permission: WorkspacePermission;
  resourceContext?: {
    /** When set, and the sub-account has territory scoping on, the
     *  evaluator additionally reuses the EXISTING
     *  lib/auth/territory-filter.ts logic — never reimplemented. */
    territoryId?: string | null;
    contactId?: string;
  };
}
