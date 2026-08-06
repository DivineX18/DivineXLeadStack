import { test } from "@playwright/test";

/**
 * Ascend OS Phase 2, Slice 8.5 — certification checklist §4 "Rollout
 * disabled" + §10's rollback requirement (item 10 in this slice's
 * OBJECTIVE list: "Roll back instantly by disabling the rollout flag").
 *
 * The DEFAULT-OFF case (no featureFlags/unified_shell doc exists at all)
 * needs no live test here — it's already covered two other ways:
 *   1. Structurally: Slice 8's verify-shell-composition.mts confirms
 *      decideShellMode() requires unifiedShellFlagEnabled === true, and
 *      isFeatureFlagEnabled() (Slice 2, unmodified) fails closed to false
 *      when no flag doc exists.
 *   2. Live: e2e/shell/crm-only-fallback.spec.ts's "direct /app/* access
 *      redirects into the existing CRM surface" test IS the default-off
 *      case for any account whose workspace isn't specifically flagged
 *      in — which is every workspace in this deployment today.
 *
 * The TRUE rollback scenario (a workspace that WAS in full_ascend mode,
 * then has the flag disabled for it, reverting live without a redeploy or
 * data migration) requires toggling a real featureFlags/unified_shell doc
 * against a real entitled workspace — not performed in this slice (see
 * docs/architecture/SLICE_8_5_SHELL_CERTIFICATION.md for why). This spec
 * documents that exact scenario as a skip-guarded test so a human with
 * write access can run it in ~30 seconds via the existing Slice 2 flag
 * management route.
 */
test("rollback: disabling unified_shell for a previously-qualifying workspace reverts to CRM-only immediately, no migration", async () => {
  test.skip(
    true,
    "Requires: (1) a real workspace already in full_ascend mode, (2) PATCHing its featureFlags/unified_shell doc " +
      "(remove the workspace from allowedWorkspaceIds, or flip rolloutStage to 'off') via the existing Slice 2 " +
      "admin route, (3) reloading /app/* with the SAME account and confirming it now redirects to the existing " +
      "CRM dashboard with zero data changes. Not performed in this slice -- see e2e/README.md 'Rollback drill' " +
      "section for the exact manual steps a human operator can run.",
  );
});
