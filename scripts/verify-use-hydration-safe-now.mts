/**
 * Shared hook introduced during the final QA certification hydration
 * sweep (2026-10-28) — see the hook's own doc comment for the full bug
 * class it fixes. This just checks the contract every call site below
 * depends on: starts null, only ever set inside useEffect, optional
 * ticking interval cleaned up on unmount/change.
 *
 * Run: npx tsx scripts/verify-use-hydration-safe-now.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const src = readFileSync(new URL("../src/hooks/use-hydration-safe-now.ts", import.meta.url), "utf8");

check("1. marked \"use client\"", /^"use client";/.test(src));
check("2. starts as null (matches what the server can safely render)", /useState<number \| null>\(null\)/.test(src));
check("3. only ever set inside useEffect, never during render", /useEffect\(\(\) => \{\s*setNow\(Date\.now\(\)\);/.test(src));
check("4. the optional interval is cleared on cleanup", /return \(\) => clearInterval\(id\);/.test(src));
check("5. omitting intervalMs skips the interval entirely (cheap default path)", /if \(!intervalMs\) return;/.test(src));

console.log(failures === 0 ? "\nverify-use-hydration-safe-now: all checks passed" : `\nverify-use-hydration-safe-now: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
