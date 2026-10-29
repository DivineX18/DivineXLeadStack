/**
 * Final QA certification (2026-10-28) — live smoke testing against
 * production after the BUG-013 sidebar hydration fix (dbc817a) found that
 * React hydration error #418 STILL reproduced on every /sa/*dashboard
 * load. Root cause was NOT a regression from that fix: a second,
 * independent, pre-existing unsafe client-only read in
 * components/dashboard/header.tsx (`navigator.platform`, deciding "Ctrl K"
 * vs "⌘ K") was ALSO on the same page the whole time, throwing the same
 * error class. A follow-up sweep for the same pattern
 * (`typeof window`/`typeof navigator` read outside a useEffect) turned up
 * two more instances in components/settings/sub-account-api-recipes-
 * section.tsx (window.location.origin, used to build a displayed API
 * endpoint URL) — never reported by QA, but the identical bug class, found
 * and fixed in the same pass rather than left for the next report.
 *
 * All four now follow the one safe pattern already established for the
 * sidebar: start at the SSR-safe default, flip it in a post-mount
 * useEffect.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-hydration-unsafe-reads-fixed.mts
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const header = read("src/components/dashboard/header.tsx");
check("1. header.tsx's isMac starts as useState(false), matching the server", /const \[isMac, setIsMac\] = useState\(false\)/.test(header));
check(
  "2. it's set inside a useEffect, never during render",
  /useEffect\(\(\) => \{\s*setIsMac\(typeof navigator !== "undefined" && \/Mac\/\.test\(navigator\.platform\)\);\s*\}, \[\]\)/.test(header),
);
check(
  "3. no render-time read of navigator.platform remains (the actual bug)",
  !/const isMac =\s*typeof navigator/.test(header),
);

const recipes = read("src/components/settings/sub-account-api-recipes-section.tsx");
check("4. a shared useOrigin() hook exists, starting at the SSR-safe empty string", /function useOrigin\(\): string \{\s*const \[origin, setOrigin\] = useState\(""\);/.test(recipes));
check("5. it's set inside a useEffect, never during render", /useEffect\(\(\) => \{\s*setOrigin\(window\.location\.origin\);\s*\}, \[\]\)/.test(recipes));
check(
  "6. both guide components use the shared hook now, not an inline render-time window read",
  (recipes.match(/const baseUrl = useOrigin\(\);/g) ?? []).length === 2 && !/typeof window !== "undefined" \? window\.location\.origin/.test(recipes),
);

// Real-world confirmation, not just structural: a clean TypeScript build
// across the whole app with these changes in place (catches a broken
// useEffect signature, a missing import, etc. that regex alone would miss).
try {
  execSync("npx tsc --noEmit -p .", { cwd: new URL("..", import.meta.url), stdio: "pipe" });
  check("7. the full app type-checks cleanly with both fixes in place", true);
} catch {
  check("7. the full app type-checks cleanly with both fixes in place", false);
}

console.log(
  failures === 0
    ? `\nverify-hydration-unsafe-reads-fixed: all checks passed`
    : `\nverify-hydration-unsafe-reads-fixed: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
