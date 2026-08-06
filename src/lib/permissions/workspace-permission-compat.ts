/**
 * Ascend OS Phase 2, Slice 5 — compatibility role-to-permission mapping.
 * Pure, dependency-free (no Firebase import), so it's genuinely
 * unit-testable.
 *
 * This is NOT a permission-by-permission audit of every existing API
 * route's exact current guard (that would mean reading dozens of route
 * files this slice didn't touch). It's built from the verified STRUCTURAL
 * pattern that actually governs today's authorization, confirmed directly
 * against firestore.rules and lib/auth/require-tenancy.ts during this
 * slice's audit:
 *
 *   - canAccessSub (any active member, admin or collaborator) is the
 *     ceiling for ordinary operational read/write — contacts, deals,
 *     pipeline, tasks, calendar, and reading almost everything else.
 *   - canAdminSub (admin or agency owner) is the ceiling for structural,
 *     financial, and administrative actions — billing, Stripe, domains,
 *     API keys, member management, deletions, publishing, sending.
 *   - The agency-owner claim shortcut is unconditional across every
 *     sub-account in the agency (0 extra Firestore reads, matches
 *     firestore.rules' isAgencyOwner()).
 *
 * Where this slice's classification of an individual permission is a
 * judgment call rather than a directly-verified route guard, it errs
 * toward the MORE restrictive option (deny for collaborator) — the
 * explicitly preferred failure mode ("deny by default", this slice's
 * required evaluation order, step 6). Any future slice that touches a
 * specific domain's real routes and finds this mapping wrong in either
 * direction should correct it there and record the correction in the
 * ledger, per this slice's "record contradictions, don't silently
 * change" instruction — this is not asserted as a byte-perfect mirror of
 * every route today.
 */

import { WORKSPACE_PERMISSIONS, type EffectiveRole, type WorkspacePermission } from "@/types/workspace-permissions";

/** Agency-scoped only — not even a sub-account admin gets this merely by
 *  administering their own sub-account. Matches firestore.rules: there is
 *  no per-sub-account "manage the agency" concept at all today. */
const AGENCY_OWNER_ONLY: readonly WorkspacePermission[] = ["agency.manage"];

/** Requires canAdminSub today (admin or agency owner) — structural,
 *  financial, or administrative actions. */
const ADMIN_OR_ABOVE: readonly WorkspacePermission[] = [
  "workspace.update",
  "members.invite",
  "members.manage",
  "billing.read",
  "billing.manage",
  "assessments.run", // spends metered/paid Ascend usage — admin+ only, matches the target-model matrix in PHASE_1_IMPLEMENTATION_BLUEPRINT.md §4.2
  "memory.write",
  "memory.approve",
  "recommendations.approve",
  "contacts.delete",
  "funnels.create",
  "funnels.edit",
  "funnels.publish",
  "websites.create",
  "websites.edit",
  "websites.publish",
  "forms.manage",
  "workflows.edit",
  "workflows.activate",
  "broadcasts.create",
  "broadcasts.send",
  "products.manage",
  "orders.refund",
  "stripe.connect",
  "domains.manage",
  "integrations.manage",
  "api.manage",
  "reports.export",
  "zeno.execute", // consequential, confirm-gated actions — admin+ only, matches PHASE_1_IMPLEMENTATION_BLUEPRINT.md §4.6
];

/** Everything not listed above is canAccessSub-tier — any active member,
 *  admin or collaborator. This is the majority of the registry: ordinary
 *  reads plus the core day-to-day CRM operations (contacts create/update,
 *  pipeline/deals/tasks/calendar manage) collaborators already do today. */
function computeCompatMap(): Record<WorkspacePermission, EffectiveRole[]> {
  const map = {} as Record<WorkspacePermission, EffectiveRole[]>;
  for (const permission of WORKSPACE_PERMISSIONS) {
    if (AGENCY_OWNER_ONLY.includes(permission)) {
      map[permission] = ["agencyOwner"];
    } else if (ADMIN_OR_ABOVE.includes(permission)) {
      map[permission] = ["agencyOwner", "admin"];
    } else {
      map[permission] = ["agencyOwner", "admin", "collaborator"];
    }
  }
  return map;
}

export const WORKSPACE_PERMISSION_COMPAT_MAP: Readonly<Record<WorkspacePermission, readonly EffectiveRole[]>> =
  Object.freeze(computeCompatMap());

/** Pure role-to-permission check — no I/O, the actual decision logic the
 *  evaluator calls after resolving the caller's EffectiveRole. Unknown
 *  role values (never expected from requireSubAccountMember today, but
 *  defensive regardless) deny by default. */
export function roleHasPermission(role: string, permission: WorkspacePermission): boolean {
  const allowed = WORKSPACE_PERMISSION_COMPAT_MAP[permission];
  if (!allowed) return false; // unknown permission — should already have been rejected upstream, deny defensively anyway
  return (allowed as readonly string[]).includes(role);
}
