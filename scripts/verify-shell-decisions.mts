/**
 * Ascend shell — GENUINE unit tests (real function calls, real assertions)
 * for every pure shell-decision function. No Firebase, no next/headers, no
 * next/navigation import anywhere in this file.
 *
 * This suite is the ONLY guard on navigation gating: which lifecycle
 * section a caller can see, and which one is visible-but-locked. It had
 * been failing since the Production Experience 2.0 IA landed, in two
 * separate ways that are worth naming because the second is the dangerous
 * one:
 *
 *   1. It looked up section ids ("crm", "campaigns") that the IA renamed.
 *      `.find(...)!` on a missing id returns undefined, so the suite threw
 *      a TypeError mid-file -- which meant every assertion AFTER that point
 *      (branding, fallback routing) silently never ran at all. A crashing
 *      test is worse than a failing one: it takes its survivors with it.
 *
 *   2. Its "fully entitled" fixture hand-listed the modules that existed
 *      when it was written. Adding the `agents` section (module `ai_suite`)
 *      left the fixture one short, so the suite reported a gating failure
 *      that was really a test-data failure.
 *
 * Both are now structurally impossible rather than merely corrected: the
 * fixtures are DERIVED from LIFECYCLE_REQUIREMENTS, and the gating
 * assertions iterate every section in the registry instead of sampling two
 * by hand. Rename a section, add one, or change what it requires, and this
 * suite follows automatically.
 */
import { decideShellMode } from "../src/lib/shell/decide-shell-mode.ts";
import { buildShellNavigation, LIFECYCLE_REQUIREMENTS, isLifecycleSectionActive } from "../src/lib/shell/build-shell-navigation.ts";
import { resolveShellBranding } from "../src/lib/shell/resolve-shell-branding.ts";
import { decideShellFallbackRoute } from "../src/lib/shell/resolve-shell-fallback-route.ts";
import { ASCEND_LIFECYCLE_SECTIONS, type ShellModeSignals, type AscendLifecycleSectionId, type AscendNavigationSection } from "../src/types/ascend-shell.ts";
import type { WorkspaceIdentity } from "../src/types/identity.ts";
import type { WorkspaceModule, WorkspaceEntitlementSummary } from "../src/types/workspace-entitlements.ts";
import type { WorkspacePermission } from "../src/types/workspace-permissions.ts";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

/**
 * Look a section up WITHOUT the non-null assertion that crashed this file.
 * A missing id is a real failure and gets reported as one, but the rest of
 * the suite still runs.
 */
function section(nav: AscendNavigationSection[], id: AscendLifecycleSectionId): AscendNavigationSection | null {
  return nav.find((s) => s.id === id) ?? null;
}

// ── Registry drift ────────────────────────────────────────────────────────
// The section list and the requirement map are two hand-maintained
// structures that must agree. They drifted once already (this file is the
// evidence), so check it directly rather than discovering it as a
// confusing downstream gating failure.
{
  const requirementIds = Object.keys(LIFECYCLE_REQUIREMENTS) as AscendLifecycleSectionId[];
  check(
    "Every section in ASCEND_LIFECYCLE_SECTIONS has a requirement entry",
    ASCEND_LIFECYCLE_SECTIONS.every((id) => id in LIFECYCLE_REQUIREMENTS),
  );
  check(
    "LIFECYCLE_REQUIREMENTS has no entry for a section that no longer exists",
    requirementIds.every((id) => (ASCEND_LIFECYCLE_SECTIONS as readonly string[]).includes(id)),
  );

  /**
   * The gating assertions below iterate whatever requirements the registry
   * declares, which proves the MECHANISM works but cannot notice a section
   * quietly losing its gate: drop `agents`' module and the loop simply
   * stops testing it, and the suite stays green while Agents becomes free
   * for every workspace. (Confirmed by mutation -- it passed.)
   *
   * So the intended gate for every section is pinned here too. Changing
   * what a section costs is a product decision; it should require editing
   * this table and saying why, not fall out of a refactor.
   */
  const EXPECTED_REQUIREMENTS: Record<AscendLifecycleSectionId, { permission: WorkspacePermission | null; module: WorkspaceModule | null }> = {
    home: { permission: null, module: null },
    create: { permission: "funnels.read", module: "funnels" },
    leads: { permission: "pipeline.read", module: "pipeline" },
    agents: { permission: "workspace.read", module: "ai_suite" },
    performance: { permission: "reports.read", module: "reports" },
    intelligence: { permission: "assessments.read", module: "growth_scan" },
    settings: { permission: "workspace.update", module: null },
  };
  for (const id of ASCEND_LIFECYCLE_SECTIONS) {
    const actual = LIFECYCLE_REQUIREMENTS[id];
    const expected = EXPECTED_REQUIREMENTS[id];
    check(
      `${id}: gate is still permission=${expected?.permission ?? "none"}, module=${expected?.module ?? "none"}`,
      actual !== undefined && expected !== undefined && actual.permission === expected.permission && actual.module === expected.module,
    );
  }
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
  // DERIVED, not hand-listed. The previous fixture enumerated the modules
  // and permissions that happened to exist when it was written, so the next
  // section added to the IA broke it. Reading them off the requirement map
  // means "fully entitled" stays true by construction.
  const everyRequiredModule = [
    ...new Set(Object.values(LIFECYCLE_REQUIREMENTS).map((r) => r.module).filter((m): m is WorkspaceModule => m !== null)),
  ];
  const everyRequiredPermission = [
    ...new Set(Object.values(LIFECYCLE_REQUIREMENTS).map((r) => r.permission).filter((p): p is WorkspacePermission => p !== null)),
  ];

  const entitlementsAllModules: WorkspaceEntitlementSummary = {
    workspaceId: "sa_1",
    effectiveTier: "full_ascend",
    billingState: "active",
    allowedModules: everyRequiredModule,
    blockedModules: [],
    activeAddons: [],
    usage: [],
    featureGateSummary: {},
    upgradeRecommendations: [],
  };
  const activeWorkspace: WorkspaceIdentity = {
    workspaceId: "sa_1",
    status: "active",
    effectiveRole: "admin",
    mappingStatus: null,
    allowedPermissions: everyRequiredPermission,
    entitlements: entitlementsAllModules,
  };

  check("Null workspace -> empty navigation", buildShellNavigation(null).length === 0);
  check(
    "Non-active workspace status -> empty navigation",
    buildShellNavigation({ ...activeWorkspace, status: "archived" }).length === 0,
  );

  const fullNav = buildShellNavigation(activeWorkspace);
  check(
    `A fully-permissioned, fully-entitled workspace resolves all ${ASCEND_LIFECYCLE_SECTIONS.length} sections`,
    fullNav.length === ASCEND_LIFECYCLE_SECTIONS.length,
  );
  check("Every section is visible and unlocked when role + entitlement both allow it", fullNav.every((s) => s.visible && !s.locked));
  check(
    "Navigation preserves the registry's section order",
    fullNav.map((s) => s.id).join(",") === ASCEND_LIFECYCLE_SECTIONS.join(","),
  );
  check("Home has no permission/module requirement", LIFECYCLE_REQUIREMENTS.home.permission === null && LIFECYCLE_REQUIREMENTS.home.module === null);
  check(
    "Home is the bare root; every other section is its own id",
    section(fullNav, "home")?.href === "/" &&
      fullNav.filter((s) => s.id !== "home").every((s) => s.href === `/${s.id}`),
  );

  // ── Exhaustive gating, one section at a time ───────────────────────────
  // The old suite hand-picked ONE section for the permission case and ONE
  // for the module case, so a section wired to the wrong gate (or to no
  // gate at all) passed unnoticed. Every section with a requirement is now
  // exercised on its own.
  for (const id of ASCEND_LIFECYCLE_SECTIONS) {
    const req = LIFECYCLE_REQUIREMENTS[id];

    if (req.permission !== null) {
      // Missing PERMISSION -> hidden entirely (role-based hide, mirroring
      // the existing Flow sidebar: a collaborator never sees a locked row
      // for something their role cannot reach at all).
      const withoutPermission = buildShellNavigation({
        ...activeWorkspace,
        allowedPermissions: everyRequiredPermission.filter((p) => p !== req.permission),
      });
      const item = section(withoutPermission, id);
      check(
        `${id}: without "${req.permission}" the section is hidden (visible=false, locked=false)`,
        item !== null && item.visible === false && item.locked === false,
      );

      // ...and removing it must not disturb any OTHER section. A gate that
      // over-reaches is as wrong as one that does not fire.
      const collateral = withoutPermission.filter((s) => s.id !== id).filter((s) => !s.visible);
      const expectedCollateral = collateral.filter((s) => LIFECYCLE_REQUIREMENTS[s.id].permission !== req.permission);
      check(
        `${id}: hiding it leaves every section with a different permission untouched`,
        expectedCollateral.length === 0,
      );
    }

    if (req.module !== null) {
      // Has the permission, workspace does not own the MODULE -> visible
      // but locked, with a reason the UI can render ("Locked by your
      // agency").
      const withoutModule = buildShellNavigation({
        ...activeWorkspace,
        entitlements: { ...entitlementsAllModules, allowedModules: everyRequiredModule.filter((m) => m !== req.module) },
      });
      const item = section(withoutModule, id);
      check(
        `${id}: without the "${req.module}" module the section is visible=true, locked=true, with a reason`,
        item !== null && item.visible === true && item.locked === true && typeof item.lockedReason === "string" && item.lockedReason.length > 0,
      );
    }
  }

  // A section with NO module requirement can never be locked, whatever the
  // workspace owns. Home and Settings rely on this.
  const noModulesAtAll = buildShellNavigation({
    ...activeWorkspace,
    entitlements: { ...entitlementsAllModules, allowedModules: [] },
  });
  check(
    "Sections with no module requirement stay unlocked even when the workspace owns nothing",
    ASCEND_LIFECYCLE_SECTIONS.filter((id) => LIFECYCLE_REQUIREMENTS[id].module === null).every(
      (id) => section(noModulesAtAll, id)?.locked === false,
    ),
  );

  // Entitlements are nullable on WorkspaceIdentity. A workspace that has
  // not resolved them must fail CLOSED (locked), never open.
  const nullEntitlements = buildShellNavigation({ ...activeWorkspace, entitlements: null as unknown as WorkspaceEntitlementSummary });
  check(
    "Null entitlements lock every module-gated section rather than granting it",
    ASCEND_LIFECYCLE_SECTIONS.filter((id) => LIFECYCLE_REQUIREMENTS[id].module !== null).every(
      (id) => section(nullEntitlements, id)?.locked === true,
    ),
  );

  // A caller with no permissions at all sees only the ungated sections.
  const noPermissions = buildShellNavigation({ ...activeWorkspace, allowedPermissions: [] });
  check(
    "A caller with zero permissions sees only the sections that require none",
    noPermissions.filter((s) => s.visible).every((s) => LIFECYCLE_REQUIREMENTS[s.id].permission === null) &&
      noPermissions.some((s) => s.visible),
  );
}

// ── isLifecycleSectionActive ─────────────────────────────────────────────
// Which nav item is highlighted. Measured on production before this existed:
// "/" marked Home active and "/home" marked nothing, even though /home is
// the canonical URL a Flow visitor redirected into this shell lands on.
{
  const home = { id: "home" as const, href: "/" };
  const create = { id: "create" as const, href: "/create" };

  check("Home is active on the bare root", isLifecycleSectionActive("/", home));
  check("Home is active on /home, the canonical landing URL", isLifecycleSectionActive("/home", home));
  check("Home is active on a path under /home", isLifecycleSectionActive("/home/anything", home));
  check("Home is NOT active on another section", !isLifecycleSectionActive("/create", home) && !isLifecycleSectionActive("/leads", home));
  check(
    "Home does not swallow every path (the root is a prefix of all of them)",
    !isLifecycleSectionActive("/create/funnels/abc", home) && !isLifecycleSectionActive("/settings", home),
  );

  check("A normal section is active on its own path", isLifecycleSectionActive("/create", create));
  check("A normal section is active on its subsections", isLifecycleSectionActive("/create/forms", create) && isLifecycleSectionActive("/create/funnels/abc", create));
  check("A normal section is NOT active on a sibling", !isLifecycleSectionActive("/leads", create));
  check(
    "A normal section is NOT active on a path that merely shares its prefix",
    !isLifecycleSectionActive("/created", create) && !isLifecycleSectionActive("/create-something", create),
  );

  // Exactly one section highlighted, for every real section URL. This is the
  // property the rendered suite asserts in a browser; asserting it here too
  // means a regression fails locally in a second instead of needing a deploy.
  const everyPermission = [...new Set(Object.values(LIFECYCLE_REQUIREMENTS).map((r) => r.permission).filter((p): p is WorkspacePermission => p !== null))];
  const everyModule = [...new Set(Object.values(LIFECYCLE_REQUIREMENTS).map((r) => r.module).filter((m): m is WorkspaceModule => m !== null))];
  const nav = buildShellNavigation({
    workspaceId: "sa_1",
    status: "active",
    effectiveRole: "admin",
    mappingStatus: null,
    allowedPermissions: everyPermission,
    entitlements: {
      workspaceId: "sa_1", effectiveTier: "full_ascend", billingState: "active",
      allowedModules: everyModule, blockedModules: [], activeAddons: [], usage: [],
      featureGateSummary: {}, upgradeRecommendations: [],
    },
  });
  for (const s of nav) {
    const ownPath = s.href === "/" ? `/${s.id}` : s.href;
    const matches = nav.filter((candidate) => isLifecycleSectionActive(ownPath, candidate));
    check(
      `${ownPath}: exactly one section highlights (got ${matches.map((m) => m.id).join(",") || "none"})`,
      matches.length === 1 && matches[0].id === s.id,
    );
  }
  check("The bare root highlights only Home", nav.filter((c) => isLifecycleSectionActive("/", c)).length === 1);
}

// ── resolveShellBranding ─────────────────────────────────────────────────
// Everything below here never executed while this file was crashing.
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
