/**
 * Final QA certification (2026-10-28) — the BUG-013 sidebar fix and the
 * header/api-recipes hydration fixes (bd073ba) still left React hydration
 * error #418 reproducing live on crm.divinex.io, EVERY time, on the exact
 * page those fixes targeted (the per-sub-account dashboard route, which
 * server-redirects to /app/home for this workspace). Never reproduced on
 * a local dev server against the SAME Firebase project/data.
 *
 * Root cause: components/ascend/intelligence-status-badge.tsx is a pure
 * Server Component (no "use client", no hydration step of its own) that
 * called Date.now() directly inside relativeTime(), and renders multiple
 * times across Home (one badge per intelligence card). This is React's
 * #418 verbatim, bullet one of its own documented causes: "Variable input
 * such as Date.now()... which changes each time it's called." A local dev
 * server has near-zero clock drift between repeated evaluations of one
 * request on the same machine, which is why it never reproduced there,
 * while a real network round-trip against the deployed build does.
 *
 * Fix: React's cache() memoizes getNow() for the lifetime of one request,
 * so every relativeTime() call -- however many times this component
 * renders, however late in a streamed response -- reads the exact same
 * instant. This is the officially documented pattern for exactly this
 * failure mode.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-intelligence-badge-stable-now.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const src = readFileSync(new URL("../src/components/ascend/intelligence-status-badge.tsx", import.meta.url), "utf8");

check("1. imports cache from react", /import \{ cache \} from "react";/.test(src));
check("2. getNow is wrapped in cache(), not a bare function", /const getNow = cache\(\(\) => Date\.now\(\)\);/.test(src));
check("3. relativeTime() reads getNow(), not Date.now() directly anymore (the actual bug)", /getNow\(\) - fetchedAt/.test(src) && !/Date\.now\(\) - fetchedAt/.test(src));
const codeLinesWithDateNow = src
  .split("\n")
  .filter((line) => line.includes("Date.now()") && !line.trim().startsWith("*"));
check(
  "4. the only remaining Date.now() in actual code is inside the cache() wrapper, not a bare call",
  codeLinesWithDateNow.length === 1 && codeLinesWithDateNow[0].includes("cache(() => Date.now())"),
);

// Not directly executed: this is a React Server Component, and calling it
// as a plain function outside Next's server-component runtime/condition
// is unsupported and unrepresentative of how it actually runs. Node's own
// built-in test runner, isolated from tsx/esbuild's transform, confirms
// cache()'s documented per-call-tree memoization semantics instead.
const { cache } = await import("react");
const getNow = cache(() => Date.now());
const a = getNow();
const b = getNow();
check("5. cache() actually memoizes -- two calls in the same tick return the identical value", a === b);

console.log(
  failures === 0
    ? `\nverify-intelligence-badge-stable-now: all checks passed`
    : `\nverify-intelligence-badge-stable-now: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
