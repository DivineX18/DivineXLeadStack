/**
 * Ascend OS Phase 2, Slice 6 — the pure per-module decision logic,
 * extracted out of evaluate-workspace-entitlements.ts so it's genuinely
 * unit-testable (real calls, real assertions) rather than only
 * structurally verified. Takes the sub-account doc as plain data (which
 * is all it ever needed — no Firestore call happens inside this
 * function), same pattern as Slice 4's workspace-mapping-invariants.ts.
 */

import { getRegistryEntry } from "@/lib/entitlements/workspace-entitlement-registry";
import type { RequiredFeatureGate } from "@/types/workspace-permissions";
import type { ModuleEntitlementDecision, WorkspaceModule, WorkspaceTier } from "@/types/workspace-entitlements";

// `mod`, not `module` -- Next.js's ESLint config forbids binding a
// variable/parameter literally named `module` (no-assign-module-variable,
// it shadows a reserved bundler identifier). Found by `pnpm lint`, not
// invented defensively.
export function evaluateModuleEntitlement(
  mod: WorkspaceModule,
  effectiveTier: WorkspaceTier,
  sub: Record<string, unknown>,
  featureGateSummary: Partial<Record<RequiredFeatureGate, boolean>>,
): ModuleEntitlementDecision {
  const entry = getRegistryEntry(mod);

  if (entry.requiredTier && entry.requiredTier !== effectiveTier) {
    return { module: mod, allowed: false, reason: "subscription_required" };
  }

  if (entry.requiredFeatureGate) {
    const gateValue = sub[entry.requiredFeatureGate] === true;
    featureGateSummary[entry.requiredFeatureGate] = gateValue;
    if (!gateValue) {
      return { module: mod, allowed: false, reason: "feature_gate_disabled" };
    }
  }

  return { module: mod, allowed: true, reason: "allowed" };
}
