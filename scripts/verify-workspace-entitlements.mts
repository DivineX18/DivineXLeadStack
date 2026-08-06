/**
 * Ascend OS Phase 2, Slice 6 — GENUINE unit tests (real function calls,
 * real assertions) for the pure entitlement registry, usage engine,
 * per-module decision logic, and upgrade-recommendation generator. No
 * Firebase import anywhere in this file.
 */
import { WORKSPACE_MODULES, isWorkspaceModule } from "../src/types/workspace-entitlements.ts";
import { WORKSPACE_ENTITLEMENT_REGISTRY, getRegistryEntry } from "../src/lib/entitlements/workspace-entitlement-registry.ts";
import { computeUsageStatus, isUsageWithinLimit } from "../src/lib/entitlements/workspace-usage.ts";
import { evaluateModuleEntitlement } from "../src/lib/entitlements/workspace-entitlement-decision.ts";
import { buildUpgradeRecommendation } from "../src/lib/entitlements/workspace-upgrade-recommendations.ts";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

// ── Registry ────────────────────────────────────────────────────────────
check("Registry has exactly the 25 modules listed in this slice's instructions", WORKSPACE_MODULES.length === 25);
check("Registry has no duplicate module keys", new Set(WORKSPACE_MODULES).size === WORKSPACE_MODULES.length);
check("Every registered module has a registry entry", WORKSPACE_MODULES.every((m) => WORKSPACE_ENTITLEMENT_REGISTRY[m] !== undefined));
check("isWorkspaceModule rejects an unknown string", !isWorkspaceModule("not_a_real_module"));
check("isWorkspaceModule accepts every real module", WORKSPACE_MODULES.every((m) => isWorkspaceModule(m)));

// Real Flow CRM modules have no invented tier requirement.
for (const m of ["crm", "contacts", "pipeline", "deals", "calendar", "products", "orders", "email", "forms"] as const) {
  check(`${m} has no tier requirement (real Flow-owned module, works CRM-only)`, getRegistryEntry(m).requiredTier === null);
}
// Ascend-owned modules require full_ascend, no invented Flow gate.
for (const m of ["ascend_intelligence", "business_memory", "growth_scan", "cro_audit", "blueprints", "business_timeline", "recommendations"] as const) {
  check(`${m} requires full_ascend tier`, getRegistryEntry(m).requiredTier === "full_ascend");
  check(`${m} has no invented Flow feature gate`, getRegistryEntry(m).requiredFeatureGate === null);
}
check("funnels maps to the REAL funnelsEnabledByAgency gate", getRegistryEntry("funnels").requiredFeatureGate === "funnelsEnabledByAgency");
check("courses shares communities' real gate (confirmed same service file, Phase 1 blueprint finding)", getRegistryEntry("courses").requiredFeatureGate === "communityEnabledByAgency");
check("No add-on system exists today -- addonSupport is false everywhere except the two genuinely future-facing modules", WORKSPACE_MODULES.filter((m) => getRegistryEntry(m).addonSupport).length <= 2);

// ── Usage engine ────────────────────────────────────────────────────────
{
  const unlimited = computeUsageStatus("ai_credits", 999999, null);
  check("null limit means unlimited -- never exhausted regardless of usage", unlimited.limit === null && unlimited.exhausted === false && unlimited.remaining === null);

  const underLimit = computeUsageStatus("monthly_scans", 3, 10);
  check("Usage under a real limit is not exhausted", !underLimit.exhausted && underLimit.remaining === 7);

  const atLimit = computeUsageStatus("monthly_scans", 10, 10);
  check("Usage exactly at the limit IS exhausted", atLimit.exhausted && atLimit.remaining === 0);

  const overLimit = computeUsageStatus("monthly_scans", 15, 10);
  check("Usage over the limit is exhausted, remaining floors at 0 (never negative)", overLimit.exhausted && overLimit.remaining === 0);

  check("isUsageWithinLimit matches the exhausted flag inversely", isUsageWithinLimit(underLimit) === true && isUsageWithinLimit(atLimit) === false);
}

// ── Per-module decision logic ────────────────────────────────────────────
{
  const gateSummary: Record<string, boolean> = {};
  const allowedCrm = evaluateModuleEntitlement("contacts", "crm_only", {}, gateSummary);
  check("CRM-only tier can use a core CRM module with no gate requirement", allowedCrm.allowed === true && allowedCrm.reason === "allowed");

  const blockedAscend = evaluateModuleEntitlement("growth_scan", "crm_only", {}, gateSummary);
  check("CRM-only tier is blocked from an Ascend-tier module", blockedAscend.allowed === false && blockedAscend.reason === "subscription_required");

  const allowedAscend = evaluateModuleEntitlement("growth_scan", "full_ascend", {}, gateSummary);
  check("full_ascend tier can use an Ascend-tier module", allowedAscend.allowed === true);

  const gateOff = evaluateModuleEntitlement("funnels", "crm_only", { funnelsEnabledByAgency: false }, gateSummary);
  check("A real feature gate set to false blocks the module", gateOff.allowed === false && gateOff.reason === "feature_gate_disabled");

  const gateOn = evaluateModuleEntitlement("funnels", "crm_only", { funnelsEnabledByAgency: true }, gateSummary);
  check("The same real feature gate set to true allows the module", gateOn.allowed === true);

  const gateMissing = evaluateModuleEntitlement("funnels", "crm_only", {}, gateSummary);
  check("A gate field entirely absent from the sub doc is treated as off (strict === true check, matches every real route's convention)", gateMissing.allowed === false);

  const summaryTest: Record<string, boolean> = {};
  evaluateModuleEntitlement("funnels", "crm_only", { funnelsEnabledByAgency: true }, summaryTest);
  check("Feature-gate summary is populated as a side effect for gated modules", summaryTest.funnelsEnabledByAgency === true);
}

// ── Upgrade recommendations ──────────────────────────────────────────────
{
  const allowedDecision = { module: "contacts" as const, allowed: true as const, reason: "allowed" as const };
  const noRec = buildUpgradeRecommendation({ decision: allowedDecision, currentTier: "crm_only", blockedModules: [], blockedCapabilities: [] });
  check("No recommendation is generated for an ALLOWED decision", noRec === null);

  const tierBlocked = { module: "growth_scan" as const, allowed: false as const, reason: "subscription_required" as const };
  const tierRec = buildUpgradeRecommendation({ decision: tierBlocked, currentTier: "crm_only", blockedModules: ["growth_scan"], blockedCapabilities: [] });
  check("Tier-blocked module recommends the REAL required tier from the registry (full_ascend)", tierRec?.requiredTier === "full_ascend");
  check("Tier-blocked module has no invented missing add-on", tierRec?.missingAddon === null);

  const gateBlocked = { module: "funnels" as const, allowed: false as const, reason: "feature_gate_disabled" as const };
  const gateRec = buildUpgradeRecommendation({ decision: gateBlocked, currentTier: "crm_only", blockedModules: ["funnels"], blockedCapabilities: [] });
  check("Gate-blocked module has requiredTier null (funnels has no tier requirement, only a gate)", gateRec?.requiredTier === null);
  check("Every recommendation includes a non-empty, human-readable upgrade path", (tierRec?.upgradePath.length ?? 0) > 0 && (gateRec?.upgradePath.length ?? 0) > 0);

  const archivedDecision = { module: "contacts" as const, allowed: false as const, reason: "workspace_archived" as const };
  const archivedRec = buildUpgradeRecommendation({ decision: archivedDecision, currentTier: "crm_only", blockedModules: [], blockedCapabilities: [] });
  check("An archived-workspace denial still produces a recommendation with the correct reason (no crash on a non-tier/gate reason)", archivedRec?.reason === "workspace_archived");
}

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
