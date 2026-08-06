/**
 * Ascend OS Phase 2, Slice 8 — GENUINE unit tests (real function calls,
 * real assertions) for every pure shell-decision function. No Firebase,
 * no next/headers, no next/navigation import anywhere in this file.
 */
import { decideShellMode } from "../src/lib/shell/decide-shell-mode.ts";
import { buildShellNavigation, LIFECYCLE_REQUIREMENTS } from "../src/lib/shell/build-shell-navigation.ts";
import { resolveShellBranding } from "../src/lib/shell/resolve-shell-branding.ts";
import { decideShellFallbackRoute } from "../src/lib/shell/resolve-shell-fallback-route.ts";
import type { ShellModeSignals } from "../src/types/ascend-shell.ts";
import type { WorkspaceIdentity } from "../src/types/identity.ts";
import type { WorkspaceEntitlementSummary } from "../src/types/workspace-entitlements.ts";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

// ── decideShellMode ───────────────────────────────────────────────────────
{
  const idealSignals: ShellModeSignals = {
    hostname: "app.divinex.io",
    ascendHostname: "app.divinex.io",
    workspaceTier: "full_ascend",
    unifiedShellFlagEnabled: true,
    devOverride: null,
    isProduction: true,
  };

  check("All signals qualify -> full_ascend", decideShellMode(idealSignals) === "full_ascend");
  check("Missing hostname -> crm_only (fail closed)", decideShellMode({ ...idealSignals, hostname: null }) === "crm_only");
  check("Missing ascendHostname -> crm_only (fail closed)", decideShellMode({ ...idealSignals, ascendHostname: null }) === "crm_only");
  check(
    "On the CRM domain (hostname mismatch) -> crm_only",
    decideShellMode({ ...idealSignals, hostname: "crm.divinex.io" }) === "crm_only",
  );
  check("No active workspace (tier null) -> crm_only", decideShellMode({ ...idealSignals, workspaceTier: null }) === "crm_only");
  check("Workspace entitled to crm_only tier -> crm_only", decideShellMode({ ...idealSignals, workspaceTier: "crm_only" }) === "crm_only");
  check("Rollout flag off -> crm_only", decideShellMode({ ...idealSignals, unifiedShellFlagEnabled: false }) === "crm_only");

  check(
    "Dev override to full_ascend wins outside production, even with otherwise-disqualifying signals",
    decideShellMode({ ...idealSignals, isProduction: false, workspaceTier: null, devOverride: "full_ascend" }) === "full_ascend",
  );
  check(
    "Dev override to crm_only FORCES crm_only outside production, even with otherwise-qualifying signals",
    decideShellMode({ ...idealSignals, isProduction: false, devOverride: "crm_only" }) === "crm_only",
  );
  check(
    "Dev override is IGNORED in production -- falls through to real signal evaluation",
    decideShellMode({ ...idealSignals, isProduction: true, devOverride: "crm_only" }) === "full_ascend",
  );
}

// ── buildShellNavigation ─────────────────────────────────────────────────
{
  const entitlementsAllModules: WorkspaceEntitlementSummary = {
    workspaceId: "sa_1",
    effectiveTier: "full_ascend",
    billingState: "active",
    allowedModules: ["growth_scan", "funnels", "broadcasts", "pipeline", "reports", "recommendations"],
    blockedModules: [],
    activeAddons: [],
    usage: [],
    featureGateSummary: {},
    upgradeRecommendations: [],
  };
  const allowedPermissionsFull: WorkspaceIdentity["allowedPermissions"] = [
    "assessments.read",
    "funnels.read",
    "broadcasts.read",
    "pipeline.read",
    "reports.read",
    "recommendations.read",
    "workspace.update",
  ];
  const activeWorkspace: WorkspaceIdentity = {
    workspaceId: "sa_1",
    status: "active",
    effectiveRole: "admin",
    mappingStatus: null,
    allowedPermissions: allowedPermissionsFull,
    entitlements: entitlementsAllModules,
  };

  check("Null workspace -> empty navigation", buildShellNavigation(null).length === 0);
  check(
    "Non-active workspace status -> empty navigation",
    buildShellNavigation({ ...activeWorkspace, status: "archived" }).length === 0,
  );

  const fullNav = buildShellNavigation(activeWorkspace);
  check("A fully-permissioned, fully-entitled workspace resolves all 8 sections", fullNav.length === 8);
  check("Every section is visible and unlocked when role + entitlement both allow it", fullNav.every((s) => s.visible && !s.locked));
  check("Home has no permission/module requirement", LIFECYCLE_REQUIREMENTS.home.permission === null && LIFECYCLE_REQUIREMENTS.home.module === null);

  // Missing PERMISSION -> hidden entirely (role-based hide, mirrors the existing sidebar)
  const noGrowPermission: WorkspaceIdentity = {
    ...activeWorkspace,
    allowedPermissions: allowedPermissionsFull.filter((p) => p !== "pipeline.read"),
  };
  const navMissingPermission = buildShellNavigation(noGrowPermission);
  const growItem = navMissingPermission.find((s) => s.id === "grow")!;
  check("Missing the required PERMISSION hides the section entirely (visible=false)", growItem.visible === false && growItem.locked === false);

  // Has permission, workspace lacks the MODULE -> visible but locked
  const noBroadcastsModule: WorkspaceIdentity = {
    ...activeWorkspace,
    entitlements: { ...entitlementsAllModules, allowedModules: entitlementsAllModules.allowedModules.filter((m) => m !== "broadcasts") },
  };
  const navMissingModule = buildShellNavigation(noBroadcastsModule);
  const launchItem = navMissingModule.find((s) => s.id === "launch")!;
  check(
    "Has the permission but the workspace doesn't own the MODULE -> visible=true, locked=true, with a reason",
    launchItem.visible === true && launchItem.locked === true && typeof launchItem.lockedReason === "string",
  );
}

// ── resolveShellBranding ─────────────────────────────────────────────────
{
  const flowBrand = {
    name: "Flow",
    logoUrl: null,
    tagline: "The Growth Operating System",
    shortDescription: "desc",
    supportEmail: "hello@divinex.io",
    primaryDomain: "crm.divinex.io",
  };

  const crmBranding = resolveShellBranding("crm_only", flowBrand);
  check("crm_only mode passes through Flow's existing brand name unchanged", crmBranding.productName === "Flow");
  check("crm_only mode uses theme 'flow_default' with no Ascend tokens", crmBranding.theme === "flow_default" && crmBranding.tokens === null);

  const ascendBranding = resolveShellBranding("full_ascend", flowBrand);
  check("full_ascend mode uses the 'Ascend' product name, not Flow's", ascendBranding.productName === "Ascend");
  check(
    "full_ascend mode carries the Architecture spec's LOCKED token values verbatim",
    ascendBranding.tokens?.jade === "158 64% 45%" &&
      ascendBranding.tokens?.indigo === "239 84% 67%" &&
      ascendBranding.tokens?.cobalt === "217 91% 60%",
  );
}

// ── decideShellFallbackRoute ─────────────────────────────────────────────
{
  check("Inactive session -> /login", decideShellFallbackRoute({ sessionState: "account_inactive", workspaceId: null }) === "/login");
  check("No session -> /login", decideShellFallbackRoute({ sessionState: "no_session", workspaceId: "sa_1" }) === "/login");
  check(
    "Active session with a resolved workspace -> that workspace's existing dashboard",
    decideShellFallbackRoute({ sessionState: "active", workspaceId: "sa_1" }) === "/sa/sa_1/dashboard",
  );
  check(
    "Active session with no resolved workspace -> the agency picker",
    decideShellFallbackRoute({ sessionState: "active", workspaceId: null }) === "/agency",
  );
}

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
