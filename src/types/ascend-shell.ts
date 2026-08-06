/**
 * Ascend OS Phase 2, Slice 8 — the canonical Ascend Shell Context. Composes
 * Slice 7's IdentityContext with shell-specific state (mode, navigation,
 * branding, rollout, capabilities). This is a NEW type family — Slice 8's
 * spec explicitly asks for it, distinct from (not a replacement for)
 * IdentityContext, which stays the identity/session authority.
 *
 * "Workspace" here means the same thing it means everywhere since Slice 5
 * (Locked Decision 3): the existing Flow SubAccount.
 */

import type { IdentityContext, WorkspaceIdentity, WorkspaceSelection } from "@/types/identity";
import type { WorkspacePermission } from "@/types/workspace-permissions";
import type { WorkspaceModule } from "@/types/workspace-entitlements";

// ── Shell mode ───────────────────────────────────────────────────────────

/**
 * Two customer-facing product modes served from this ONE Next.js codebase
 * (Architecture spec Locked Decision 1 + 2). "full_ascend" is the Ascend-
 * branded, lifecycle-organized experience (target domain app.divinex.io).
 * "crm_only" is Flow's existing, unmodified operational product (target
 * domain crm.divinex.io) — the default and the fail-closed state. There is
 * no third "internal/operator" mode in this slice — the Architecture spec's
 * internal Ascend operator console lives in the (untouched) Ascend
 * Intelligence repository, out of scope here.
 */
export type ShellMode = "full_ascend" | "crm_only";

// ── Lifecycle navigation ─────────────────────────────────────────────────

/**
 * The eight primary Full Ascend navigation destinations, per this slice's
 * spec verbatim. Settings is a primary nav item; Zeno is deliberately
 * EXCLUDED from this list — it's globally available (capabilities.canUseZeno)
 * but not a primary lifecycle section, matching the spec's explicit
 * instruction ("Zeno is globally available but is not a primary navigation
 * item").
 */
export const ASCEND_LIFECYCLE_SECTIONS = [
  "home",
  "identify",
  "create",
  "launch",
  "grow",
  "optimize",
  "scale",
  "settings",
] as const;
export type AscendLifecycleSectionId = (typeof ASCEND_LIFECYCLE_SECTIONS)[number];

/**
 * One resolved navigation destination. `visible`/`locked` mirror the
 * existing sidebar's dual-gate pattern (src/components/dashboard/sidebar.tsx
 * — confirmed by this slice's audit, see the Slice 8 ledger entry):
 *   - no required permission (or the caller HAS it) + no required module
 *     (or the workspace owns it)          -> visible=true,  locked=false
 *   - caller lacks the required PERMISSION -> visible=false (hidden
 *     entirely, same as the existing sidebar's role-based hiding — a
 *     collaborator without a permission never even sees a locked row for
 *     something their role can't reach)
 *   - caller HAS the permission but the workspace doesn't own the required
 *     MODULE -> visible=true, locked=true (the existing "Locked by your
 *     agency" pattern, now driven by Slice 6's entitlement engine instead
 *     of a hand-rolled gate-field check)
 */
export interface AscendNavigationSection {
  id: AscendLifecycleSectionId;
  label: string;
  href: string;
  requiredPermission: WorkspacePermission | null;
  requiredModule: WorkspaceModule | null;
  visible: boolean;
  locked: boolean;
  lockedReason: string | null;
}

// ── Branding ─────────────────────────────────────────────────────────────

/**
 * Deliberately a small, DATA-only descriptor — this slice does not restyle
 * every existing Flow screen (explicitly out of scope per the spec). In
 * "crm_only" mode this is a pass-through of Flow's EXISTING resolved brand
 * (lib/landing/resolve-brand.ts) — zero behavior change for CRM-only
 * customers. In "full_ascend" mode it carries the Architecture spec's
 * locked design tokens (Locked Decision 4 -- jade/indigo/cobalt, dark
 * premium aesthetic) so the new shell frame (this slice) and Slice 9's
 * screens have one canonical source for them, instead of every future
 * component hardcoding hex values.
 */
export interface AscendBrandingContext {
  mode: ShellMode;
  productName: string;
  tagline: string;
  /** "ascend_dark" activates the new Ascend CSS custom properties (see
   *  globals.css's `.theme-ascend` block, additive, scoped to the new
   *  shell frame only). "flow_default" means: render exactly as Flow
   *  renders today, untouched. */
  theme: "ascend_dark" | "flow_default";
  tokens: {
    jade: string;
    indigo: string;
    cobalt: string;
  } | null;
}

// ── Rollout ──────────────────────────────────────────────────────────────

/**
 * Reuses Slice 2's isFeatureFlagEnabled() verbatim -- never a second
 * rollout-evaluation mechanism. "unified_shell" and "unified_navigation"
 * are both already-registered FeatureFlagId values (src/types/feature-flags.ts)
 * anticipating exactly this slice.
 */
export interface AscendShellRolloutContext {
  unifiedShellEnabled: boolean;
  unifiedNavigationEnabled: boolean;
}

// ── Capabilities ─────────────────────────────────────────────────────────

export interface AscendShellCapabilities {
  canSwitchWorkspace: boolean;
  canAccessSettings: boolean;
  canAccessAgency: boolean;
  /** Reuses Slice 5's real "zeno.advise" permission -- not a new ad hoc
   *  check. False whenever no workspace is active. */
  canUseZeno: boolean;
}

// ── Shell context (the composed result) ─────────────────────────────────

export interface AscendShellContext {
  mode: ShellMode;
  identity: IdentityContext;
  workspace: WorkspaceIdentity | null;
  workspaceSelection: WorkspaceSelection;
  navigation: AscendNavigationSection[];
  branding: AscendBrandingContext;
  rollout: AscendShellRolloutContext;
  capabilities: AscendShellCapabilities;
}

// ── Shell-mode decision signals ──────────────────────────────────────────

/**
 * Every input decideShellMode() (lib/shell/decide-shell-mode.ts) is allowed
 * to look at. Deliberately explicit and narrow -- no function in this
 * slice reads `process.env` or `headers()` directly from inside decision
 * logic; the orchestrator (resolve-shell-context.ts) gathers these THEN
 * calls the pure decider, so the decision itself stays unit-testable
 * without Next.js/Firestore.
 */
export interface ShellModeSignals {
  /** Normalized (lowercased, "www." stripped) request Host header, or null
   *  when unavailable (e.g. a Server Action with no Request object). */
  hostname: string | null;
  /** Normalized hostname of NEXT_PUBLIC_ASCEND_APP_URL, or null if unset /
   *  unparseable -- fails closed, same discipline as middleware.ts's
   *  customDomainRewrite() incident-note pattern (never guess). */
  ascendHostname: string | null;
  /** From Slice 6's WorkspaceEntitlementSummary.effectiveTier. Null when no
   *  workspace is active. */
  workspaceTier: "crm_only" | "full_ascend" | null;
  /** isFeatureFlagEnabled("unified_shell", ctx) -- Slice 2, reused. */
  unifiedShellFlagEnabled: boolean;
  /** Explicit dev/test override (e.g. ASCEND_SHELL_MODE_OVERRIDE env var).
   *  Only ever honored outside production -- see decide-shell-mode.ts. */
  devOverride: ShellMode | null;
  /** True in production (NODE_ENV === "production"). Decider uses this,
   *  not process.env directly, to stay a pure function of its inputs. */
  isProduction: boolean;
}
