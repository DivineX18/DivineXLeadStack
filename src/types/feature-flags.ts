/**
 * Ascend OS Phase 2 — progressive-rollout feature flags. Distinct from the
 * existing per-agency feature GATES (emailDomainEnabledByAgency, etc. —
 * those are entitlement/paid-access booleans). Flags here gate whether a
 * not-yet-certified internal build is visible to a given caller at all,
 * independent of what they're entitled to.
 */

export type FeatureFlagRolloutStage =
  | "off"
  | "internal_admin"
  | "internal_qa"
  | "single_workspace"
  | "beta"
  | "ga";

export interface FeatureFlagDoc {
  id: string;
  name: string;
  description: string;
  rolloutStage: FeatureFlagRolloutStage;
  /** Only consulted when rolloutStage === "single_workspace" or "beta". */
  allowedWorkspaceIds: string[];
  /** Only consulted when rolloutStage === "internal_qa" or "beta" — lets a
   *  specific tester in ahead of their workspace being flagged in. */
  allowedUids: string[];
  createdAt: unknown;
  updatedAt: unknown;
  updatedByUid: string;
}

/** The flag IDs known at this point in Phase 2 (Section 3.3 of the Phase 2
 *  prompt). Adding a flag ID here is required before it can be evaluated —
 *  prevents a typo'd flag name from silently always evaluating to false. */
export const FEATURE_FLAG_IDS = [
  "unified_shell",
  "unified_navigation",
  "firebase_first_ascend_login",
  "workspace_mapping_v2",
  "native_home",
  "native_identify",
  "native_grow_operations",
  "native_create_launch_management",
  "unified_zeno_execution",
  "shared_business_memory_events",
  "unified_reporting",
  "legacy_route_redirects",
] as const;

export type FeatureFlagId = (typeof FEATURE_FLAG_IDS)[number];
