/**
 * Deterministic regression test for the flow-dashboard.tsx hydration bug
 * (final QA certification, 2026-10-28): forces a REAL server(UTC) vs
 * browser(America/Chicago) timezone mismatch against a LOCAL PRODUCTION
 * build (must be started with `TZ=UTC pnpm build && TZ=UTC pnpm start`
 * first), rather than hoping to catch the narrow daily UTC-boundary
 * window on a live site. The mismatch, not the exact wall-clock moment,
 * is what makes `new Date().toLocaleDateString()` disagree between
 * server and client.
 *
 * Run:
 *   TZ=UTC pnpm build && TZ=UTC pnpm start &
 *   npx tsx scripts/e2e-flow-dashboard-timezone-hydration.mts
 */
import { chromium, getCustomTokenForEmail, signInBrowserWithCustomToken } from "./e2e-setup-prod.mts";

const APP_URL = process.env.E2E_LOCAL_URL ?? "http://localhost:3000";
const SA_ID = "73BcuAKXx5mWSDQYVdj1";

const customToken = await getCustomTokenForEmail("hello@divinex.io");
const browser = await chromium.launch();
// The whole point: server renders in UTC (see the TZ=UTC start command
// above), this browser context renders in a real, different zone.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Chicago" });
const page = await ctx.newPage();
const pageErrors: string[] = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}

try {
  await page.goto(`${APP_URL}/login`, { waitUntil: "domcontentloaded" });
  await signInBrowserWithCustomToken(page, customToken);
  await page.goto(`${APP_URL}/sa/${SA_ID}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  check("no hydration/page error under a forced server(UTC)/browser(America/Chicago) mismatch", pageErrors.length === 0);
  if (pageErrors.length > 0) console.log("  errors:", pageErrors);
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
