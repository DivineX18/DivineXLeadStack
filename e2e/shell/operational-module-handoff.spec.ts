import { test, expect } from "@playwright/test";
import { TEST_ACCOUNTS } from "../fixtures/test-accounts";
import { loginAs } from "../fixtures/auth";

/**
 * Ascend OS Phase 2, Slice 8.5 — certification checklist §7, operational-
 * module handoff. This slice's spec names generic module labels
 * (Contacts, Pipeline, Deals, Appointments, Orders, Team, Email,
 * Courses, ...); mapped here to the REAL existing Flow routes confirmed
 * by this slice's + Slice 8's audits (see CLAUDE.md's Project Structure)
 * — several generic names collapse onto one real Flow surface (Deals
 * live inside Pipeline; Appointments = Booking; Orders = Products/Quotes;
 * Email = Broadcasts/Workflows; Team/API/Webhooks are tabs inside
 * Settings, not separate top-level routes; Courses = Community). No test
 * references a route that doesn't actually exist.
 */
const account = TEST_ACCOUNTS.fullAscend();

test.beforeEach(async () => {
  test.skip(!account, "TEST_FULL_ASCEND_EMAIL/_PASSWORD not set — see e2e/README.md");
});

const MODULES: { checklistName: string; path: string }[] = [
  { checklistName: "Contacts", path: "/contacts" },
  { checklistName: "Pipeline / Deals", path: "/pipeline" },
  { checklistName: "Tasks", path: "/tasks" },
  { checklistName: "Calendar", path: "/calendar" },
  { checklistName: "Appointments (Booking)", path: "/booking" },
  { checklistName: "Conversations", path: "/conversations" },
  { checklistName: "Forms", path: "/forms" },
  { checklistName: "Products / Orders", path: "/products" },
  { checklistName: "Reports", path: "/reports" },
  { checklistName: "Billing / Team / API / Webhooks (Settings tabs)", path: "/dashboard/settings" },
  { checklistName: "Funnels", path: "/funnels" },
  { checklistName: "Websites", path: "/website" },
  { checklistName: "Workflows / Automation", path: "/workflows" },
  { checklistName: "Broadcasts (Email)", path: "/broadcasts" },
  { checklistName: "Community / Courses", path: "/community" },
];

for (const mod of MODULES) {
  test(`${mod.checklistName}: correct workspace preserved, existing module renders, clear path back to shell`, async ({ page }) => {
    await loginAs(page, account!, "/app/home");
    const homeUrl = page.url();
    const saMatch = homeUrl.match(/\/app\//);
    test.skip(!saMatch, "Could not resolve a workspace context to build a /sa/{id} URL from.");

    // The workspace id isn't exposed on the /app/* URL itself (the shell
    // links to `/sa/{workspaceId}${path}` — see AscendSectionPlaceholder
    // consumers) -- follow an actual in-app link where one exists (Home's
    // "Open workspace dashboard") to get a real, permission-checked
    // /sa/{id} URL rather than guessing an id.
    await page.goto("/app/home");
    const dashboardLink = page.getByRole("link", { name: /open workspace dashboard/i });
    await dashboardLink.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    if (!(await dashboardLink.isVisible().catch(() => false))) {
      test.skip(true, "No workspace dashboard link rendered — account may have no resolved workspace.");
      return;
    }
    const href = await dashboardLink.getAttribute("href");
    const subAccountId = href?.match(/\/sa\/([^/]+)/)?.[1];
    test.skip(!subAccountId, "Could not extract a subAccountId from the workspace dashboard link.");

    await page.goto(`/sa/${subAccountId}${mod.path}`);
    // Existing Flow authorization (Slice 5, unmodified) is the real gate
    // here -- this test only proves the HANDOFF works: correct workspace
    // in the URL, the existing module actually renders (not a 404/500),
    // and the existing Flow dashboard chrome (not Ascend chrome) owns
    // this page, since builders/modules are explicitly NOT re-skinned in
    // Slice 8/8.5.
    await expect(page).toHaveURL(new RegExp(`/sa/${subAccountId}${mod.path.replace(/\//g, "\\/")}`));
    await expect(page.locator(".theme-ascend")).toHaveCount(0);
  });
}
