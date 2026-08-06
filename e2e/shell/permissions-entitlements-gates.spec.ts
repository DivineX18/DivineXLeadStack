import { test, expect } from "@playwright/test";
import { TEST_ACCOUNTS } from "../fixtures/test-accounts";
import { loginAs } from "../fixtures/auth";

/**
 * Ascend OS Phase 2, Slice 8.5 — certification checklist §9: permissions,
 * entitlements, gates, and rollout combined. These are the UI-visible
 * consequences of Slice 5's evaluateWorkspacePermission() and Slice 6's
 * evaluateWorkspaceEntitlements() as consumed by buildShellNavigation()
 * (Slice 8) — this slice never weakens either evaluator to make a UI test
 * pass (fixing policy §9); every case here is a pure UI/composition
 * check against real evaluator output.
 */

test.describe("collaborator without write permission", () => {
  const collaborator = TEST_ACCOUNTS.collaborator();
  test("permission-gated sections are hidden entirely (not shown-and-blocked)", async ({ page }) => {
    test.skip(!collaborator, "TEST_COLLABORATOR_EMAIL/_PASSWORD not set — see e2e/README.md");
    await loginAs(page, collaborator!, "/app/home");
    // Settings requires workspace.update -- a collaborator role should
    // never have it (Slice 5's compat role model: collaborator < admin).
    const settingsLink = page.getByRole("navigation", { name: "Lifecycle navigation" }).getByRole("link", { name: "Settings" });
    await expect(settingsLink).toHaveCount(0);
  });
});

test.describe("admin with allowed operational access", () => {
  const admin = TEST_ACCOUNTS.admin();
  test("admin sees Settings (has workspace.update)", async ({ page }) => {
    test.skip(!admin, "TEST_ADMIN_EMAIL/_PASSWORD not set — see e2e/README.md");
    await loginAs(page, admin!, "/app/home");
    const settingsLink = page.getByRole("navigation", { name: "Lifecycle navigation" }).getByRole("link", { name: "Settings" });
    await expect(settingsLink).toBeVisible();
  });
});

test.describe("agency owner exemption behavior", () => {
  const owner = TEST_ACCOUNTS.agencyOwner();
  test("agency owner reaches Full Ascend mode for a workspace they own, even without an explicit per-sub-account membership row", async ({ page }) => {
    test.skip(!owner, "TEST_AGENCY_OWNER_EMAIL/_PASSWORD not set — see e2e/README.md");
    await loginAs(page, owner!, "/app/home");
    await expect(page.locator(".theme-ascend")).toBeVisible();
  });
});

test.describe("no information leakage", () => {
  const account = TEST_ACCOUNTS.fullAscend();
  test("locked-section reason text never contains a raw internal reason code or module id", async ({ page }) => {
    test.skip(!account, "TEST_FULL_ASCEND_EMAIL/_PASSWORD not set — see e2e/README.md");
    await loginAs(page, account!, "/app/home");
    const lockedItems = page.getByRole("navigation", { name: "Lifecycle navigation" }).getByRole("button", { name: /locked/i });
    const count = await lockedItems.count();
    test.skip(count === 0, "No locked sections to check for this account's workspace.");
    for (let i = 0; i < count; i++) {
      const label = await lockedItems.nth(i).getAttribute("aria-label");
      // Real internal reason strings from workspace-entitlements.ts's
      // WorkspaceEntitlementDenialReason union -- these must NEVER leak
      // verbatim into customer-facing text.
      expect(label).not.toMatch(/feature_gate_disabled|billing_inactive|workspace_archived|denied_entitlement|denied_feature_gate/);
    }
  });

  test("page HTML never exposes another workspace's data via a client-side prop leak", async ({ page }) => {
    test.skip(!account, "TEST_FULL_ASCEND_EMAIL/_PASSWORD not set — see e2e/README.md");
    await loginAs(page, account!, "/app/home");
    const html = await page.content();
    // Structural sanity check only -- this can't enumerate every possible
    // other workspace id, so it just confirms the page doesn't dump a
    // raw list of every workspace the caller ISN'T supposed to see (e.g.
    // a naive "all sub-accounts" debug array).
    expect(html).not.toMatch(/"blockedModules":\s*\[[^\]]{500,}/);
  });
});
