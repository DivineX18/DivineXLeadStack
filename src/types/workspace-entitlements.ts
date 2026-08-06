/**
 * Ascend OS Phase 2, Slice 6 — the canonical entitlement model.
 *
 * Distinct from Slice 5's permissions on purpose:
 *   - Permissions answer "what is this USER allowed to DO?"
 *   - Entitlements answer "what does this WORKSPACE OWN/have access to?"
 * A permission check without an entitlement check is meaningless (a
 * Manager can have `funnels.publish` permission, but if the Workspace
 * doesn't own the Funnels module, there's nothing to publish) — Slice 5's
 * evaluator already composes a narrow slice of this (its `featureGate`
 * hook) for exactly that reason; this slice generalizes it into the full
 * product/module/add-on/usage model.
 */

import type { RequiredFeatureGate } from "@/types/workspace-permissions";

// ── Tier ──────────────────────────────────────────────────────────────────

/**
 * No real "CRM-only vs Full Ascend" field exists anywhere in the schema
 * today (confirmed by audit, both this slice and Slice 5). The only real,
 * verified signal is whether an ACTIVE Workspace Mapping v2 record (Slice
 * 4) exists for the sub-account — that's what the evaluator actually uses.
 * This type just names the two states.
 */
export type WorkspaceTier = "crm_only" | "full_ascend";

// ── Modules ──────────────────────────────────────────────────────────────

export const WORKSPACE_MODULES = [
  "crm",
  "contacts",
  "pipeline",
  "deals",
  "calendar",
  "products",
  "orders",
  "email",
  "forms",
  "automation",
  "funnels",
  "websites",
  "broadcasts",
  "communities",
  "courses",
  "ai_suite",
  "reports",
  "ascend_intelligence",
  "business_memory",
  "growth_scan",
  "cro_audit",
  "blueprints",
  "business_timeline",
  "recommendations",
  "connected_intelligence",
] as const;
export type WorkspaceModule = (typeof WORKSPACE_MODULES)[number];

export function isWorkspaceModule(value: string): value is WorkspaceModule {
  return (WORKSPACE_MODULES as readonly string[]).includes(value);
}

// ── Add-ons (future — none active today, confirmed by audit) ──────────────

export const WORKSPACE_ADDONS = [
  "connected_intelligence_addon",
  "advanced_automation_addon",
  "ai_credits_addon",
  "marketplace_addon",
] as const;
export type WorkspaceAddon = (typeof WORKSPACE_ADDONS)[number];

export function isWorkspaceAddon(value: string): value is WorkspaceAddon {
  return (WORKSPACE_ADDONS as readonly string[]).includes(value);
}

// ── Usage limits (engine only — no real limit values exist today) ─────────

export const USAGE_LIMIT_TYPES = [
  "ai_credits",
  "monthly_scans",
  "monthly_audits",
  "connector_quota",
  "storage",
  "exports",
  "team_seats",
  "workflow_executions",
] as const;
export type UsageLimitType = (typeof USAGE_LIMIT_TYPES)[number];

export interface WorkspaceUsageStatus {
  type: UsageLimitType;
  used: number;
  /** null = unlimited (the only state that exists in the repository today
   *  — no real plan carries a finite limit for any of these yet). */
  limit: number | null;
  remaining: number | null;
  exhausted: boolean;
}

// ── Capabilities (fine-grained, module-adjacent — e.g. "publish a funnel"
// as distinct from "own the Funnels module at all") ────────────────────────

export interface WorkspaceCapability {
  module: WorkspaceModule;
  key: string; // e.g. "funnels.publish" -- deliberately loose, mirrors Slice 5's WorkspacePermission where relevant but not required to be 1:1
}

// ── Registry ─────────────────────────────────────────────────────────────

export interface WorkspaceEntitlementRegistryEntry {
  module: WorkspaceModule;
  label: string;
  /** null = available regardless of tier (every Flow-owned CRM module
   *  today — confirmed real, not gated by any Ascend-tier concept). */
  requiredTier: WorkspaceTier | null;
  /** Reuses Slice 5's RequiredFeatureGate type — the SAME real, verified
   *  gate fields, never a second gate-name system. null = no gate exists
   *  for this module today. */
  requiredFeatureGate: RequiredFeatureGate | null;
  usageLimitType: UsageLimitType | null;
  /** Whether a future add-on could unlock or expand this module. False
   *  for everything today — no add-on system exists yet. */
  addonSupport: boolean;
  /** Whether usage of this module is (or will be) metered. */
  metered: boolean;
  /** Whether this module can be individually toggled off (a gate/tier
   *  exists) vs. always-on core CRM functionality. */
  optional: boolean;
}

// ── Decision contract ─────────────────────────────────────────────────────

export type WorkspaceEntitlementDenialReason =
  | "feature_gate_disabled"
  | "billing_inactive"
  | "subscription_required"
  | "addon_required"
  | "usage_limit_reached"
  | "workspace_archived"
  | "workspace_inactive"
  | "unknown_entitlement"
  | "unknown_module";

export type WorkspaceEntitlementAllowReason = "allowed";

export interface ModuleEntitlementDecision {
  module: WorkspaceModule;
  allowed: boolean;
  reason: WorkspaceEntitlementAllowReason | WorkspaceEntitlementDenialReason;
  usage?: WorkspaceUsageStatus;
}

export interface UpgradeRecommendation {
  module: WorkspaceModule;
  currentTier: WorkspaceTier;
  requiredTier: WorkspaceTier | null;
  missingAddon: WorkspaceAddon | null;
  blockedModules: WorkspaceModule[];
  blockedCapabilities: string[];
  reason: WorkspaceEntitlementDenialReason;
  /** Human-readable guidance only — no checkout integration, no pricing,
   *  no Stripe call. */
  upgradePath: string;
}

export interface EvaluateWorkspaceEntitlementsInput {
  /** Today, the Flow subAccountId — same convention as Slice 5's
   *  WorkspaceId, for the same reason (Locked Decision 3). */
  workspaceId: string;
  /** Optional — when supplied, the evaluator returns a decision scoped to
   *  just this module in addition to the full summary. */
  module?: WorkspaceModule;
}

export interface WorkspaceEntitlementSummary {
  workspaceId: string;
  effectiveTier: WorkspaceTier;
  billingState: string; // EffectiveBillingState, re-exported as string to avoid a circular type import
  allowedModules: WorkspaceModule[];
  blockedModules: ModuleEntitlementDecision[];
  activeAddons: WorkspaceAddon[]; // always [] today -- no add-on system exists yet, never invented
  usage: WorkspaceUsageStatus[]; // always [] today unless a real counter is wired -- see workspace-usage.ts
  featureGateSummary: Partial<Record<RequiredFeatureGate, boolean>>;
  upgradeRecommendations: UpgradeRecommendation[];
  /** Present only when a single `module` was requested in the input. */
  requestedModuleDecision?: ModuleEntitlementDecision;
}
