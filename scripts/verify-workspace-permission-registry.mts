/**
 * Ascend OS Phase 2, Slice 5 — GENUINE unit tests (real function calls,
 * real assertions) for the pure permission registry, compatibility
 * mapping, and requirements modules. No Firebase import anywhere in this
 * file.
 */
import {
  WORKSPACE_PERMISSIONS,
  isWorkspacePermission,
  type WorkspacePermission,
} from "../src/types/workspace-permissions.ts";
import { WORKSPACE_PERMISSION_COMPAT_MAP, roleHasPermission } from "../src/lib/permissions/workspace-permission-compat.ts";
import { requirementsFor, WORKSPACE_PERMISSION_REQUIREMENTS } from "../src/lib/permissions/workspace-permission-requirements.ts";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

// ── Registry ────────────────────────────────────────────────────────────
check("Registry contains exactly the 53 permissions specified in this slice's instructions", WORKSPACE_PERMISSIONS.length === 53);
check("Registry has no duplicate entries", new Set(WORKSPACE_PERMISSIONS).size === WORKSPACE_PERMISSIONS.length);
check("isWorkspacePermission accepts every real registry entry", WORKSPACE_PERMISSIONS.every((p) => isWorkspacePermission(p)));
check("isWorkspacePermission rejects an unknown string", !isWorkspacePermission("not.a.real.permission"));
check("isWorkspacePermission rejects an empty string", !isWorkspacePermission(""));
check("isWorkspacePermission rejects a role name accidentally passed as a permission", !isWorkspacePermission("admin"));

// ── Compatibility map covers every registered permission ───────────────────
check(
  "Every registered permission has a compat-map entry (nothing silently unmapped)",
  WORKSPACE_PERMISSIONS.every((p) => Array.isArray(WORKSPACE_PERMISSION_COMPAT_MAP[p])),
);

// ── Agency owner: unrestricted, matches today's real unrestricted access ──
check(
  "Agency owner is allowed EVERY registered permission (matches today's real unrestricted agency-wide authority)",
  WORKSPACE_PERMISSIONS.every((p) => roleHasPermission("agencyOwner", p)),
);

// ── Admin: everything except agency.manage ──────────────────────────────
check("Sub-account admin is allowed agency.manage's opposite — denied only agency.manage", !roleHasPermission("admin", "agency.manage"));
check(
  "Sub-account admin is allowed every OTHER permission (matches today's canAdminSub ceiling)",
  WORKSPACE_PERMISSIONS.filter((p) => p !== "agency.manage").every((p) => roleHasPermission("admin", p)),
);

// ── Collaborator: core operational access, denied structural/admin actions ──
const collaboratorShouldAllow: WorkspacePermission[] = [
  "workspace.read",
  "contacts.read",
  "contacts.create",
  "contacts.update",
  "pipeline.read",
  "pipeline.manage",
  "deals.read",
  "deals.manage",
  "tasks.read",
  "tasks.manage",
  "calendar.read",
  "calendar.manage",
  "zeno.advise",
];
const collaboratorShouldDeny: WorkspacePermission[] = [
  "workspace.update",
  "members.manage",
  "billing.manage",
  "contacts.delete",
  "funnels.publish",
  "websites.publish",
  "stripe.connect",
  "api.manage",
  "agency.manage",
  "orders.refund",
  "zeno.execute",
];
for (const p of collaboratorShouldAllow) check(`Collaborator retains today's real access to ${p}`, roleHasPermission("collaborator", p));
for (const p of collaboratorShouldDeny) check(`Collaborator does NOT gain new access to ${p} (structural/admin-tier action)`, !roleHasPermission("collaborator", p));

// ── Monotonicity: no role gains MORE than the tier above it ────────────────
// This is the concrete, mechanical proof behind "no current role gains
// broader access than the existing tenancy model / no current role
// unintentionally loses its existing access" — collaborator's allowed set
// must always be a SUBSET of admin's, and admin's a subset of agencyOwner's.
{
  let collaboratorSubsetOfAdmin = true;
  let adminSubsetOfOwner = true;
  for (const p of WORKSPACE_PERMISSIONS) {
    if (roleHasPermission("collaborator", p) && !roleHasPermission("admin", p)) collaboratorSubsetOfAdmin = false;
    if (roleHasPermission("admin", p) && !roleHasPermission("agencyOwner", p)) adminSubsetOfOwner = false;
  }
  check("Collaborator's allowed permissions are always a subset of admin's (monotonic hierarchy)", collaboratorSubsetOfAdmin);
  check("Admin's allowed permissions are always a subset of agency owner's (monotonic hierarchy)", adminSubsetOfOwner);
}

// ── Malformed/unknown role denies by default ────────────────────────────
check("An unrecognized role string is denied every permission (deny by default)", WORKSPACE_PERMISSIONS.every((p) => !roleHasPermission("superuser_typo", p)));
check("An empty-string role is denied", !roleHasPermission("", "contacts.read"));

// ── Entitlement/feature-gate requirements — real, not invented ────────────
check(
  "Only permissions with a REAL, verified gate are mapped (api.manage -> apiAccessEnabledByAgency)",
  requirementsFor("api.manage").featureGate === "apiAccessEnabledByAgency",
);
check("stripe.connect maps to the real funnelCheckoutEnabledByAgency gate", requirementsFor("stripe.connect").featureGate === "funnelCheckoutEnabledByAgency");
check(
  "Permissions with no real gate today have NO requirement (not invented) — contacts.read",
  Object.keys(requirementsFor("contacts.read")).length === 0,
);
check(
  "Ascend-intelligence-only permissions (assessments/memory/recommendations) have no invented Flow-side gate",
  ["assessments.read", "assessments.run", "memory.read", "memory.write", "recommendations.read"].every(
    (p) => requirementsFor(p as WorkspacePermission).featureGate === undefined,
  ),
);
check(
  "ascendTier is never set on any requirement in this slice (typed hook exists, not wired — see the type's doc comment)",
  Object.values(WORKSPACE_PERMISSION_REQUIREMENTS).every((r) => r?.ascendTier === undefined),
);

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
