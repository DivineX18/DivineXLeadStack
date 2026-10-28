/**
 * Discovered during Bitrupt QA regression testing (2026-10-28, same session
 * as the BUG-013 fix that caused it): every /sa/* page threw a React
 * hydration error (#418, "text content did not match") on load — confirmed
 * live across /funnels/{id}, /forms, /dashboard, /workflows, all of which
 * share nothing except this sidebar. Root cause: the BUG-013 fix read
 * `window.location.hostname` directly inside render to decide the
 * Dashboard link's href, so the server (no `window`) and the client's
 * FIRST render produced different hrefs — a textbook hydration mismatch.
 *
 * Fixed with the standard safe pattern: start false, flip the value in a
 * post-mount effect, so the server and the client's first paint agree, and
 * the Ascend-host shortcut applies as an ordinary re-render afterward.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 *
 * Run: npx tsx scripts/verify-sidebar-hydration-safe.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const src = readFileSync(new URL("../src/components/dashboard/sidebar.tsx", import.meta.url), "utf8");

check("1. onAscendHost state starts false (matches the server, which has no window)", /const \[onAscendHost, setOnAscendHost\] = useState\(false\)/.test(src));
check(
  "2. it's set inside a useEffect (post-mount, never during render)",
  /useEffect\(\(\) => \{\s*setOnAscendHost\(window\.location\.hostname === ascendHostname\);\s*\}, \[\]\)/.test(src),
);
check(
  "3. the render path no longer reads window.location directly (the actual bug — a render-time client-only read)",
  !/item\.href === "\/dashboard" &&\s*typeof window/.test(src),
);
check("4. dashboardSkipsBounce now reads the state variable, not window directly", /dashboardSkipsBounce = item\.href === "\/dashboard" && onAscendHost/.test(src));

console.log(
  failures === 0
    ? `\nverify-sidebar-hydration-safe: all checks passed`
    : `\nverify-sidebar-hydration-safe: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
