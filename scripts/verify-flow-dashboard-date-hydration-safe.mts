/**
 * Final QA certification (2026-10-28) — the REAL root cause of the
 * persistently-reproducing React hydration error #418 on the Flow CRM
 * dashboard (/sa/[id]/dashboard, rendered by flow-dashboard.tsx -- this
 * page only redirects to /app/home when visited on the Ascend HOST with a
 * full_ascend-entitled workspace; crm.divinex.io always renders this
 * component directly, which is what every live repro attempt actually
 * hit). Two earlier, good-faith fixes this same day (the sidebar's
 * window.location.hostname, header's navigator.platform, and an
 * intelligence-status-badge.tsx Date.now() fix on the UNRELATED Ascend
 * Home page) did NOT resolve it, because none of them were the actual
 * cause on THIS page.
 *
 * Root cause: `const today = new Date().toLocaleDateString(...)` read
 * directly during render in a "use client" component.
 * toLocaleDateString() formats in whatever timezone the CALLER runs in --
 * the server (Render, UTC) and a real visitor's browser (their own local
 * zone) disagree on the calendar date for several hours around every UTC
 * day boundary. Confirmed deterministically reproducible (not just
 * "sometimes near midnight UTC") by forcing a real server(UTC) vs
 * browser(America/Chicago) mismatch with Playwright's `timezoneId`
 * context option against a local production build -- this is also WHY it
 * never reproduced testing against a plain local dev/production server
 * before: that server and the test browser share one machine's clock and
 * timezone, so there was nothing to disagree about.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-flow-dashboard-date-hydration-safe.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const src = readFileSync(
  new URL("../src/app/(dashboard)/sa/[subAccountId]/dashboard/flow-dashboard.tsx", import.meta.url),
  "utf8",
);

check("1. today starts as useState(\"\"), matching what the server can safely render", /const \[today, setToday\] = useState\(""\);/.test(src));
check(
  "2. the real, locale-formatted date is set inside a useEffect, never during render",
  /useEffect\(\(\) => \{\s*setToday\(\s*new Date\(\)\.toLocaleDateString\("en-US", \{/.test(src),
);
check(
  "3. no render-time (non-effect) call to toLocaleDateString remains assigned to `today` (the actual bug)",
  !/const today = new Date\(\)\.toLocaleDateString/.test(src),
);

console.log(
  failures === 0
    ? `\nverify-flow-dashboard-date-hydration-safe: all checks passed`
    : `\nverify-flow-dashboard-date-hydration-safe: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
