/**
 * Ascend OS Phase 2, Slice 5 — permission -> entitlement/feature-gate
 * requirement map. Pure, dependency-free.
 *
 * Only maps permissions to gates that ACTUALLY exist and ACTUALLY gate
 * that behavior today (verified against src/types/tenancy.ts's real field
 * list and CLAUDE.md's Agency feature gates section during this slice's
 * audit) — per the explicit instruction not to invent an entitlement
 * requirement where none exists today. Permissions not listed here have
 * NO gate/entitlement requirement; they're evaluated on role alone.
 */

import type { PermissionRequirements, WorkspacePermission } from "@/types/workspace-permissions";

export const WORKSPACE_PERMISSION_REQUIREMENTS: Partial<Record<WorkspacePermission, PermissionRequirements>> = {
  "api.manage": { featureGate: "apiAccessEnabledByAgency" },
  "broadcasts.send": { featureGate: "broadcastsEnabledByAgency" },
  "stripe.connect": { featureGate: "funnelCheckoutEnabledByAgency" },
  "funnels.create": { featureGate: "funnelsEnabledByAgency" },
  "funnels.publish": { featureGate: "funnelsEnabledByAgency" },
  "websites.create": { featureGate: "websiteEnabledByAgency" },
  "websites.publish": { featureGate: "websiteEnabledByAgency" },
  "domains.manage": { featureGate: "customDomainsEnabledByAgency" },
  "zeno.advise": { featureGate: "aiSuiteEnabledByAgency" },
  "zeno.execute": { featureGate: "aiSuiteEnabledByAgency" },
  // Deliberately NOT mapped (no real gate/entitlement exists today, not
  // invented): assessments.*, memory.*, recommendations.* (Ascend
  // Intelligence has no Flow-side gate at all yet — see
  // RequiredAscendTier's doc comment in types/workspace-permissions.ts),
  // and every other permission in the registry.
};

export function requirementsFor(permission: WorkspacePermission): PermissionRequirements {
  return WORKSPACE_PERMISSION_REQUIREMENTS[permission] ?? {};
}
