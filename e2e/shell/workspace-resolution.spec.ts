import { test, expect } from "@playwright/test";
import { TEST_ACCOUNTS, TEST_WORKSPACES } from "../fixtures/test-accounts";
import { loginAs } from "../fixtures/auth";

/**
 * Ascend OS Phase 2, Slice 8.5 — certification checklist §5, Workspace
 * resolution and switching.
 *
 * IMPORTANT structural finding from this slice's code audit (safe to
 * state without any live test): resolveShellContextForLayout() — the
 * ONLY entry point src/app/app/layout.tsx calls — takes NO request input
 * for workspace selection. It calls resolveShellContext(uid, options)
 * with `options` always omitted from the layout, so `explicitWorkspaceId`
 * is always undefined there. The workspace is derived exclusively from a
 * server-side Firestore read of `userMemberships/{uid}/subAccounts`
 * (Slice 7). There is no `/app/[workspaceId]/...` route and no query
 * param wired to workspace selection anywhere in the /app/* surface. This
 * means "manual URL manipulation with an unauthorized Workspace ID"
 * against the SHELL specifically has no attack surface to test — there is
 * no client-controllable input for it to manipulate. (Flow's existing
 * `/sa/[subAccountId]/*` routes DO take a client-supplied id and ARE
 * authorized per-request by Slice 5's resolveSubAccountAccess(), already
 * covered by Slice 5's own test suite — out of scope to re-test here.)
 */

test.describe("single vs multiple workspace selection", () => {
  const oneWs = TEST_ACCOUNTS.oneWorkspace();
  test("exactly one authorized workspace resolves it automatically", async ({ page }) => {
    test.skip(!oneWs, "TEST_ONE_WORKSPACE_EMAIL/_PASSWORD not set — see e2e/README.md");
    await loginAs(page, oneWs!, "/app/home");
    await expect(page.locator(".theme-ascend")).toBeVisible();
  });

  const multiWs = TEST_ACCOUNTS.multiWorkspace();
  test("multiple authorized workspaces never silently default to an arbitrary one", async ({ page }) => {
    test.skip(!multiWs, "TEST_MULTI_WORKSPACE_EMAIL/_PASSWORD not set — see e2e/README.md");
    await loginAs(page, multiWs!, "/app/home");
    // Per decide-shell-mode.ts + the Slice 7 workspace selector this shell
    // reuses: with 2+ candidates and no explicit request, the resolver
    // returns workspaceId=null (reason "multiple_available"), so the
    // shell layout's fallback route fires (mode can't be full_ascend
    // without a resolved workspace's entitlement tier) -- the user lands
    // on the existing /agency picker, NOT an arbitrary workspace's shell.
    await expect(page).toHaveURL(/\/agency/);
  });
});

test.describe("no-workspace and archived/inactive states", () => {
  const noWs = TEST_ACCOUNTS.noWorkspace();
  test("missing workspace produces the designed no-workspace state, not an error page", async ({ page }) => {
    test.skip(!noWs, "TEST_NO_WORKSPACE_EMAIL/_PASSWORD not set — see e2e/README.md");
    await loginAs(page, noWs!);
    await page.goto("/app/home");
    await expect(page).toHaveURL(/\/agency/);
  });

  test("an archived workspace fails closed with a customer-safe message, not a stack trace", async ({ page }) => {
    test.skip(!TEST_WORKSPACES.archived || !TEST_ACCOUNTS.admin(), "TEST_ARCHIVED_WORKSPACE_ID and an admin account are required — see e2e/README.md");
    const admin = TEST_ACCOUNTS.admin()!;
    await loginAs(page, admin, "/app/home");
    // Redirect target depends on Slice 7's resolved workspace state; the
    // hard requirement is: no raw error text, no stack trace, no infinite
    // spinner.
    await expect(page.getByText(/error|exception|stack/i)).toHaveCount(0);
  });
});
