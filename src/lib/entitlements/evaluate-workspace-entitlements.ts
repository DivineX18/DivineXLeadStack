import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { effectiveBillingState } from "@/lib/billing/status";
import type { SubAccountBilling } from "@/types/billing";
import type { RequiredFeatureGate } from "@/types/workspace-permissions";
import { WORKSPACE_ENTITLEMENT_REGISTRY } from "@/lib/entitlements/workspace-entitlement-registry";
import { evaluateModuleEntitlement } from "@/lib/entitlements/workspace-entitlement-decision";
import { buildUpgradeRecommendation } from "@/lib/entitlements/workspace-upgrade-recommendations";
import { logEntitlementDecision, logWorkspaceLevelDenial } from "@/lib/entitlements/workspace-entitlement-audit";
import {
  WORKSPACE_MODULES,
  isWorkspaceModule,
  type EvaluateWorkspaceEntitlementsInput,
  type ModuleEntitlementDecision,
  type UpgradeRecommendation,
  type WorkspaceEntitlementSummary,
  type WorkspaceModule,
  type WorkspaceTier,
} from "@/types/workspace-entitlements";

/**
 * Ascend OS Phase 2, Slice 6 — the single authoritative Workspace
 * entitlement evaluator. Entitlements are a property of the WORKSPACE,
 * not the caller (unlike Slice 5's per-user permission evaluator) — this
 * function takes no `uid`. Callers that need to check "is THIS caller
 * allowed to even ask about this workspace" compose this with Slice 5's
 * evaluator at the wrapper layer (workspace-entitlement-wrappers.ts), not
 * here.
 *
 * Composition order (explicit, source-verified by
 * scripts/verify-workspace-entitlement-evaluator.mts):
 *   1. Resolve the sub-account — missing/archived denies everything.
 *   2. Resolve Workspace Mapping v2 state (Slice 4, reused) AND the
 *      sub-account's `ascendIntelligenceEnabledByAgency` Client Billing
 *      gate (see PLAN_GATE_KEYS in types/billing.ts) -> effective tier.
 *      BOTH must hold for full_ascend: an active mapping is the technical
 *      linkage to an Ascend workspace, the gate is the commercial decision
 *      that this sub-account's plan actually includes it. Either one
 *      missing/off means crm_only — never invented, these are the only two
 *      real signals that exist. No agency-owner bypass on the gate (unlike
 *      step 3's billing exemption) — it's a deliberate plan decision, not
 *      a payment failure.
 *   3. Resolve billing state (lib/billing/status.ts::effectiveBillingState,
 *      reused, not reimplemented) -> a lapsed state blocks every module
 *      except for the agency owner (mirrors Slice 5's exemption, which
 *      itself mirrors the real, documented BillingGuard behavior).
 *   4. Per module: tier requirement -> feature-gate requirement -> usage
 *      limit -> allow.
 *   5. Deny by default for anything not covered above.
 */
export async function evaluateWorkspaceEntitlements(
  input: EvaluateWorkspaceEntitlementsInput,
  callerIsAgencyOwner = false,
): Promise<WorkspaceEntitlementSummary> {
  const { workspaceId } = input;

  if (input.module && !isWorkspaceModule(input.module)) {
    // unknown_module -- return a minimal, explicit summary rather than
    // throwing, so callers get a typed decision either way.
    const decision: ModuleEntitlementDecision = { module: input.module as WorkspaceModule, allowed: false, reason: "unknown_module" };
    logEntitlementDecision(workspaceId, decision);
    return {
      workspaceId,
      effectiveTier: "crm_only",
      billingState: "unknown",
      allowedModules: [],
      blockedModules: [decision],
      activeAddons: [],
      usage: [],
      featureGateSummary: {},
      upgradeRecommendations: [],
      requestedModuleDecision: decision,
    };
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${workspaceId}`).get();
  if (!subSnap.exists) {
    return denyAll(workspaceId, "workspace_inactive", input.module);
  }
  const sub = subSnap.data() as Record<string, unknown> & {
    status?: string;
    billing?: SubAccountBilling;
    ascendIntelligenceEnabledByAgency?: boolean;
  };

  if (sub.status === "archived") {
    return denyAll(workspaceId, "workspace_archived", input.module);
  }

  const mapping = await getMappingBySubAccountId(workspaceId);
  if (mapping && mapping.status === "archived") {
    return denyAll(workspaceId, "workspace_archived", input.module);
  }
  // Ascend OS — full_ascend requires BOTH signals, not just the mapping:
  // an active Ascend<->Flow workspace mapping (the *technical* linkage) AND
  // the sub-account's Client Billing plan actually entitling it to Ascend
  // (the *commercial* decision, via the ascendIntelligenceEnabledByAgency
  // gate — see PLAN_GATE_KEYS in types/billing.ts). No agency-owner bypass
  // here, deliberately — unlike the billing-lapsed exemption below, this
  // gate is a real plan decision, not a payment failure, so the owner
  // should see exactly what their client's plan actually grants.
  //
  // P0.2 — ENTITLEMENT, NOT LINKAGE, DECIDES ACCESS.
  //
  // This previously also required an active workspaceMappings row. That row
  // is the TECHNICAL linkage to an Ascend business profile, and it is created
  // only by the SSO bridge or an operator CLI — there is no self-service path
  // that produces one. So the commercial decision (the plan gate) could be
  // fully satisfied and the customer still could not reach the product they
  // had paid for. In practice exactly ONE workspace ever qualified.
  //
  // Under the locked product model Ascend IS the product, so eligibility must
  // follow the plan. The mapping keeps its real job — linking a workspace to
  // an Ascend profile for SSO and profile sync — and a workspace without one
  // degrades exactly as an unmapped workspace always has: resolveProfileInputs
  // returns null and generation falls back to certified no-profile behaviour.
  // It is no longer an access gate.
  const ascendGateOn = sub.ascendIntelligenceEnabledByAgency === true;
  const effectiveTier: WorkspaceTier = ascendGateOn ? "full_ascend" : "crm_only";

  const billingState = sub.billing ? effectiveBillingState(sub.billing) : "comped";
  const billingLapsed = billingState === "lapsed" && !callerIsAgencyOwner;
  if (billingLapsed) {
    return denyAll(workspaceId, "billing_inactive", input.module, effectiveTier, billingState);
  }

  const allowedModules: WorkspaceModule[] = [];
  const blockedModules: ModuleEntitlementDecision[] = [];
  const featureGateSummary: Partial<Record<RequiredFeatureGate, boolean>> = {};

  // `mod`, not `module` -- see the same note in workspace-entitlement-
  // decision.ts (Next.js's no-assign-module-variable lint rule).
  for (const mod of WORKSPACE_MODULES) {
    const decision = evaluateModuleEntitlement(mod, effectiveTier, sub, featureGateSummary);
    if (decision.allowed) allowedModules.push(mod);
    else blockedModules.push(decision);
    logEntitlementDecision(workspaceId, decision);
  }

  const upgradeRecommendations: UpgradeRecommendation[] = blockedModules
    .map((decision) =>
      buildUpgradeRecommendation({
        decision,
        currentTier: effectiveTier,
        blockedModules: blockedModules.map((d) => d.module),
        blockedCapabilities: [],
      }),
    )
    .filter((r): r is UpgradeRecommendation => r !== null);

  const requestedModuleDecision = input.module
    ? (allowedModules.includes(input.module)
        ? { module: input.module, allowed: true, reason: "allowed" as const }
        : blockedModules.find((d) => d.module === input.module))
    : undefined;

  return {
    workspaceId,
    effectiveTier,
    billingState,
    allowedModules,
    blockedModules,
    activeAddons: [], // no real add-on system exists yet -- never invented
    usage: [], // no real usage counter is wired into this evaluator yet -- see workspace-usage.ts's doc comment
    featureGateSummary,
    upgradeRecommendations,
    requestedModuleDecision,
  };
}

function denyAll(
  workspaceId: string,
  reason: "workspace_inactive" | "workspace_archived" | "billing_inactive",
  requestedModule?: WorkspaceModule,
  effectiveTier: WorkspaceTier = "crm_only",
  billingState = "unknown",
): WorkspaceEntitlementSummary {
  const blockedModules: ModuleEntitlementDecision[] = WORKSPACE_MODULES.map((mod) => ({ module: mod, allowed: false, reason }));
  // ONE audit event for the whole workspace-level denial, not one per
  // module (see workspace-entitlement-audit.ts's doc comment — the
  // per-module logEntitlementDecision() is deliberately not called here).
  logWorkspaceLevelDenial(workspaceId, reason);
  return {
    workspaceId,
    effectiveTier,
    billingState,
    allowedModules: [],
    blockedModules,
    activeAddons: [],
    usage: [],
    featureGateSummary: {},
    upgradeRecommendations: [],
    requestedModuleDecision: requestedModule ? blockedModules.find((d) => d.module === requestedModule) : undefined,
  };
}

export { WORKSPACE_ENTITLEMENT_REGISTRY };
