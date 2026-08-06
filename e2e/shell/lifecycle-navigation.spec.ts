import { test, expect } from "@playwright/test";
import { TEST_ACCOUNTS } from "../fixtures/test-accounts";
import { loginAs } from "../fixtures/auth";
import { ASCEND_LIFECYCLE_SECTIONS } from "../../src/types/ascend-shell";

/**
 * Ascend OS Phase 2, Slice 8.5 — certification checklist §6, lifecycle
 * navigation. Iterates the SAME registry the shell itself uses
 * (ASCEND_LIFECYCLE_SECTIONS, src/types/ascend-shell.ts) so this test
 * can never drift from the real section list — if a section is ever
 * added/removed/renamed there, this test picks it up automatically
 * rather than needing a manual update, and there's no way for an
 * "unknown registry entry" to reach the UI (buildShellNavigation only
 * ever iterates this exact const array — verified in
 * scripts/verify-shell-decisions.mts already).
 */
const account = TEST_ACCOUNTS.fullAscend();

test.beforeEach(async () => {
  test.skip(!account, "TEST_FULL_ASCEND_EMAIL/_PASSWORD not set — see e2e/README.md");
});

for (const sectionId of ASCEND_LIFECYCLE_SECTIONS) {
  test(`direct URL access to /app/${sectionId} is independently protected and renders`, async ({ page }) => {
    await loginAs(page, account!, `/app/${sectionId}`);
    await expect(page).toHaveURL(new RegExp(`/app/${sectionId}$`));
    await expect(page.locator(".theme-ascend")).toBeVisible();
  });
}

test("visible nav items highlight the active section via aria-current", async ({ page }) => {
  await loginAs(page, account!, "/app/grow");
  const growLink = page.getByRole("navigation", { name: "Lifecycle navigation" }).getByRole("link", { name: "Grow" });
  await expect(growLink).toHaveAttribute("aria-current", "page");
  const homeLink = page.getByRole("navigation", { name: "Lifecycle navigation" }).getByRole("link", { name: "Home" });
  await expect(homeLink).not.toHaveAttribute("aria-current", "page");
});

test("locked sections (permission present, module not entitled) are keyboard-discoverable with an accessible reason, not just a hover tooltip", async ({ page }) => {
  await loginAs(page, account!, "/app/home");
  const lockedItems = page.getByRole("navigation", { name: "Lifecycle navigation" }).getByRole("button", { name: /locked/i });
  const count = await lockedItems.count();
  test.skip(count === 0, "This test account's workspace has no locked lifecycle sections to verify — configure one with a partial entitlement set to exercise this path.");
  await expect(lockedItems.first()).toHaveAttribute("tabindex", "0");
  await expect(lockedItems.first()).toHaveAttribute("aria-disabled", "true");
});

test("browser back/forward between lifecycle sections works normally", async ({ page }) => {
  await loginAs(page, account!, "/app/home");
  await page.goto("/app/grow");
  await page.goto("/app/optimize");
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/grow/);
  await page.goForward();
  await expect(page).toHaveURL(/\/app\/optimize/);
});
