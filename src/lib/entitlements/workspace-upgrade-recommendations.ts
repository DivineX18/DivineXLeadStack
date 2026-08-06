/**
 * Ascend OS Phase 2, Slice 6 — pure upgrade-recommendation generation. No
 * Firebase import, no checkout integration, no pricing. Recommendations
 * only — matches this slice's explicit instruction.
 */

import { getRegistryEntry } from "@/lib/entitlements/workspace-entitlement-registry";
import type {
  ModuleEntitlementDecision,
  UpgradeRecommendation,
  WorkspaceAddon,
  WorkspaceModule,
  WorkspaceTier,
} from "@/types/workspace-entitlements";

const UPGRADE_PATH_BY_REASON: Record<string, string> = {
  feature_gate_disabled: "Ask your agency owner to enable this feature for your workspace.",
  billing_inactive: "Resolve your workspace's billing status to restore access.",
  subscription_required: "This module requires an active subscription.",
  addon_required: "This module requires an add-on that hasn't shipped yet.",
  usage_limit_reached: "You've reached this module's usage limit for the current period.",
  workspace_archived: "This workspace has been archived and can't be upgraded until it's restored.",
  workspace_inactive: "This workspace isn't currently active.",
};

/**
 * Builds one recommendation for a single blocked module decision. Never
 * invents a required tier/add-on beyond what the registry actually
 * declares for that module.
 */
export function buildUpgradeRecommendation(params: {
  decision: ModuleEntitlementDecision;
  currentTier: WorkspaceTier;
  blockedModules: WorkspaceModule[];
  blockedCapabilities: string[];
}): UpgradeRecommendation | null {
  if (params.decision.allowed) return null;
  const entry = getRegistryEntry(params.decision.module);

  let missingAddon: WorkspaceAddon | null = null;
  if (params.decision.reason === "addon_required" && entry.addonSupport) {
    // No real add-on catalog exists yet (confirmed by audit) -- named
    // generically rather than inventing a specific product SKU.
    missingAddon = "connected_intelligence_addon";
  }

  return {
    module: params.decision.module,
    currentTier: params.currentTier,
    requiredTier: entry.requiredTier,
    missingAddon,
    blockedModules: params.blockedModules,
    blockedCapabilities: params.blockedCapabilities,
    reason: params.decision.reason as UpgradeRecommendation["reason"],
    upgradePath: UPGRADE_PATH_BY_REASON[params.decision.reason] ?? "Contact your agency owner for access.",
  };
}
