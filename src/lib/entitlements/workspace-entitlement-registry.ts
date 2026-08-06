/**
 * Ascend OS Phase 2, Slice 6 — the single canonical entitlement registry.
 * Pure, no Firebase import. Every module a route/screen might gate on
 * must be looked up here, never hard-coded inline — mirrors Slice 5's
 * "one permission registry" discipline for the entitlement axis.
 *
 * `requiredFeatureGate` values are the SAME real, grep-verified
 * `*EnabledByAgency` fields Slice 5 already uses (src/types/tenancy.ts) —
 * no module below is gated by a field that doesn't actually exist or
 * doesn't actually gate that behavior today. Ascend-Intelligence-owned
 * modules have no Flow-side gate at all (confirmed by audit, both this
 * slice and Slice 5) — their access is governed by `requiredTier` only.
 */

import type { WorkspaceEntitlementRegistryEntry, WorkspaceModule } from "@/types/workspace-entitlements";

export const WORKSPACE_ENTITLEMENT_REGISTRY: Readonly<Record<WorkspaceModule, WorkspaceEntitlementRegistryEntry>> = {
  // ── Flow-owned core CRM — always available, no tier, no gate ───────────
  crm: { module: "crm", label: "CRM", requiredTier: null, requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: false },
  contacts: { module: "contacts", label: "Contacts", requiredTier: null, requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: false },
  pipeline: { module: "pipeline", label: "Pipeline", requiredTier: null, requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: false },
  deals: { module: "deals", label: "Deals", requiredTier: null, requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: false },
  calendar: { module: "calendar", label: "Calendar", requiredTier: null, requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: false },
  products: { module: "products", label: "Products", requiredTier: null, requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: false },
  orders: { module: "orders", label: "Orders", requiredTier: null, requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: false },
  email: { module: "email", label: "Email", requiredTier: null, requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: true, optional: false },
  forms: { module: "forms", label: "Forms", requiredTier: null, requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: false },
  automation: { module: "automation", label: "Workflows & Automation", requiredTier: null, requiredFeatureGate: null, usageLimitType: "workflow_executions", addonSupport: false, metered: true, optional: false },

  // ── Flow-owned, real feature-gated modules ─────────────────────────────
  funnels: { module: "funnels", label: "Funnels", requiredTier: null, requiredFeatureGate: "funnelsEnabledByAgency", usageLimitType: null, addonSupport: false, metered: false, optional: true },
  websites: { module: "websites", label: "Websites", requiredTier: null, requiredFeatureGate: "websiteEnabledByAgency", usageLimitType: null, addonSupport: false, metered: false, optional: true },
  broadcasts: { module: "broadcasts", label: "Broadcasts", requiredTier: null, requiredFeatureGate: "broadcastsEnabledByAgency", usageLimitType: null, addonSupport: false, metered: true, optional: true },
  communities: { module: "communities", label: "Communities", requiredTier: null, requiredFeatureGate: "communityEnabledByAgency", usageLimitType: null, addonSupport: false, metered: false, optional: true },
  // Courses shares Communities' gate — confirmed real (Phase 1 blueprint's
  // finding, capabilities.ts imports both from the same service file).
  courses: { module: "courses", label: "Courses", requiredTier: null, requiredFeatureGate: "communityEnabledByAgency", usageLimitType: null, addonSupport: false, metered: false, optional: true },
  // AI Suite is Flow's OWN assistant (Slice 5: zeno.advise/execute ->
  // aiSuiteEnabledByAgency, no ascend tier) — not Ascend Intelligence.
  ai_suite: { module: "ai_suite", label: "AI Suite", requiredTier: null, requiredFeatureGate: "aiSuiteEnabledByAgency", usageLimitType: "ai_credits", addonSupport: true, metered: true, optional: true },

  // ── Composed / dual-owned (Phase 1 blueprint: "different data, not duplicates") ──
  reports: { module: "reports", label: "Reports", requiredTier: null, requiredFeatureGate: null, usageLimitType: "exports", addonSupport: false, metered: false, optional: false },

  // ── Ascend-Intelligence-owned — requires the full_ascend tier, no Flow gate exists ──
  ascend_intelligence: { module: "ascend_intelligence", label: "Ascend Intelligence", requiredTier: "full_ascend", requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: true },
  business_memory: { module: "business_memory", label: "Business Memory", requiredTier: "full_ascend", requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: true },
  growth_scan: { module: "growth_scan", label: "Growth Scan", requiredTier: "full_ascend", requiredFeatureGate: null, usageLimitType: "monthly_scans", addonSupport: false, metered: true, optional: true },
  cro_audit: { module: "cro_audit", label: "CRO Audit", requiredTier: "full_ascend", requiredFeatureGate: null, usageLimitType: "monthly_audits", addonSupport: false, metered: true, optional: true },
  blueprints: { module: "blueprints", label: "Blueprints", requiredTier: "full_ascend", requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: true },
  business_timeline: { module: "business_timeline", label: "Business Timeline", requiredTier: "full_ascend", requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: true },
  recommendations: { module: "recommendations", label: "Recommendations", requiredTier: "full_ascend", requiredFeatureGate: null, usageLimitType: null, addonSupport: false, metered: false, optional: true },

  // ── Future — genuinely not built anywhere, addon-supported by design ──
  connected_intelligence: {
    module: "connected_intelligence",
    label: "Connected Intelligence",
    requiredTier: "full_ascend",
    requiredFeatureGate: null,
    usageLimitType: "connector_quota",
    addonSupport: true,
    metered: true,
    optional: true,
  },
};

export function getRegistryEntry(mod: WorkspaceModule): WorkspaceEntitlementRegistryEntry {
  return WORKSPACE_ENTITLEMENT_REGISTRY[mod];
}
