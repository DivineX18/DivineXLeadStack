import { defineConfig, devices } from "@playwright/test";

/**
 * Ascend OS Phase 2, Slice 8.5 — the repository's first browser-test
 * setup, scoped deliberately narrow: certifying the Slice 8 unified
 * Ascend shell (`/app/*`) before Slice 9 begins. No test framework
 * existed in this repo before this slice (confirmed by audit — no
 * Playwright/Cypress/Jest/Vitest config anywhere).
 *
 * IMPORTANT — most specs under e2e/shell/ require real authenticated test
 * accounts and are SKIPPED (not run, not faked as passing) unless the
 * TEST_* env vars documented in e2e/README.md are set. See that file for
 * exact operator setup instructions. This was a deliberate Slice 8.5
 * scoping decision: the local .env.local in this environment points at a
 * real, non-disposable Firebase project, so no live signup/login/write
 * was performed against it during this slice — see
 * docs/architecture/SLICE_8_5_SHELL_CERTIFICATION.md for the full
 * rationale and what WAS safely run live (the fully unauthenticated,
 * read-only checks).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
