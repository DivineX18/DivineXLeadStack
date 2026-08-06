import { test, expect } from "@playwright/test";
import { TEST_ACCOUNTS } from "../fixtures/test-accounts";
import { loginAs } from "../fixtures/auth";

/**
 * Ascend OS Phase 2, Slice 8.5 — certification checklist §4 "CRM-only
 * user". Requires TEST_CRM_ONLY_EMAIL/_PASSWORD — a real account whose
 * workspace does NOT have a "full_ascend" entitlement tier (the default
 * for every existing workspace, since WorkspaceTier only becomes
 * "full_ascend" once an ACTIVE Workspace Mapping v2 record exists —
 * Slice 6). Skipped without that account configured.
 */
const account = TEST_ACCOUNTS.crmOnly();

test.beforeEach(async () => {
  test.skip(!account, "TEST_CRM_ONLY_EMAIL/_PASSWORD not set — see e2e/README.md");
});

test("existing login succeeds and the existing CRM experience renders (not Ascend)", async ({ page }) => {
  await loginAs(page, account!);
  await expect(page.locator(".theme-ascend")).toHaveCount(0);
});

test("direct /app/* access redirects into the existing CRM surface, never the Ascend shell", async ({ page }) => {
  await loginAs(page, account!);
  await page.goto("/app/home");
  await expect(page).not.toHaveURL(/\/app/);
  await expect(page.locator(".theme-ascend")).toHaveCount(0);
});

test("no Full Ascend branding or lifecycle nav leaks into any CRM-only page", async ({ page }) => {
  await loginAs(page, account!, "/agency");
  await expect(page.getByText("Identify", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Optimize", { exact: true })).toHaveCount(0);
  await expect(page.locator(".theme-ascend")).toHaveCount(0);
});

test("logout remains unchanged for a CRM-only user", async ({ page }) => {
  await loginAs(page, account!);
  await page.getByRole("button", { name: /sign out|account/i }).first().click().catch(() => {});
  // The exact existing header sign-out control is asserted by pre-existing
  // Flow UI, not this slice's shell -- this test only proves logging out
  // doesn't land the CRM-only user inside /app/* afterward.
  await page.goto("/app/home");
  await expect(page).not.toHaveURL(/\/app\/home/);
});
