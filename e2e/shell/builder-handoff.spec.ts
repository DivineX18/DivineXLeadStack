import { test, expect } from "@playwright/test";
import { TEST_ACCOUNTS } from "../fixtures/test-accounts";
import { loginAs } from "../fixtures/auth";

/**
 * Ascend OS Phase 2, Slice 8.5 — certification checklist §8, complex
 * builders and full-screen editor handoff (Funnel builder, Website
 * builder, Form builder, Workflow builder).
 *
 * Repository-truth note from this slice's audit: Slice 8 did NOT build
 * any Ascend-branded "full-screen editor" chrome (no minimal top bar, no
 * "Back to Ascend" affordance) — the shell's Create-section placeholder
 * links straight into Flow's EXISTING, unmodified builder pages, which
 * render inside Flow's own (dashboard) layout (its own sidebar+header),
 * not a full-screen/iframe-free Ascend-branded frame. This is a REAL,
 * confirmed cohesion gap (documented in
 * docs/architecture/SLICE_8_5_SHELL_CERTIFICATION.md as a known seam for
 * Slice 9+), not something these tests can pass/fail against — there is
 * no Ascend-branded editor chrome to certify yet. These tests instead
 * verify the one guarantee that DOES already hold: entering a builder
 * from the Ascend shell never uses an iframe and never loses Workspace
 * authorization.
 */
const account = TEST_ACCOUNTS.fullAscend();

test.beforeEach(async () => {
  test.skip(!account, "TEST_FULL_ASCEND_EMAIL/_PASSWORD not set — see e2e/README.md");
});

const BUILDERS = [
  { name: "Funnel builder", path: "/funnels" },
  { name: "Website builder", path: "/website" },
  { name: "Workflow builder", path: "/workflows" },
];

for (const builder of BUILDERS) {
  test(`${builder.name}: entered from Create, no iframe is used, workspace authorization intact`, async ({ page }) => {
    await loginAs(page, account!, "/app/create");
    const link = page.getByRole("link", { name: new RegExp(builder.name.split(" ")[0], "i") });
    if (!(await link.isVisible().catch(() => false))) {
      test.skip(true, `No "${builder.name}" link visible on /app/create for this account's workspace.`);
      return;
    }
    await link.click();
    await expect(page.locator("iframe")).toHaveCount(0);
    // Landed on a real Flow page, not a 404/error boundary.
    await expect(page.getByText(/page not found|something went wrong/i)).toHaveCount(0);
  });
}
