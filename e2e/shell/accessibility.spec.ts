import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Ascend OS Phase 2, Slice 8.5 — automated accessibility scan, SAFE to run
 * against the public /login page without any credentials. This is the
 * repository's first automated a11y check of any kind (confirmed by
 * audit — no axe/pa11y config existed before this slice).
 *
 * The authenticated Ascend shell (/app/*) needs the same scan run with a
 * real session — see e2e/shell/full-ascend-entry.spec.ts's axe check,
 * which is skipped without TEST_FULL_ASCEND_* credentials (see
 * e2e/README.md). This file proves the tooling itself works; it is not a
 * substitute for scanning the authenticated shell.
 *
 * Per this slice's explicit instruction: this does NOT claim full WCAG
 * certification — axe catches a meaningful subset of issues (missing
 * labels, contrast, landmark structure, etc), not everything a manual
 * audit would.
 */
test("login page has no critical/serious automated accessibility violations", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();

  const seriousOrWorse = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  if (seriousOrWorse.length > 0) {
    console.log(JSON.stringify(seriousOrWorse, null, 2));
  }
  expect(seriousOrWorse, "See console output above for full axe violation details").toHaveLength(0);
});
