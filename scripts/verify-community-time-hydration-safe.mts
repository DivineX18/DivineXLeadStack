/**
 * Follow-up to the flow-dashboard.tsx hydration fix (final QA
 * certification, 2026-10-28). An initial grep sweep flagged four more
 * files reading Date.now()/new Date() outside a "use client" guard:
 *
 *   - funnels/sections/countdown-section.tsx  -> FALSE POSITIVE. `left`
 *     starts null and timeLeft() is only ever called inside useEffect/
 *     setInterval, never during render. Server and client's first paint
 *     both render null; nothing to fix.
 *   - app/docs/api/page.tsx                   -> FALSE POSITIVE. The
 *     Date.now() text is inside a template-literal CODE SAMPLE shown as
 *     documentation, never executed by this page.
 *   - app/c/[saId]/[groupSlug]/community/page.tsx -> NOT a hydration
 *     risk. Pure Server Component, Date.now() called once and used only
 *     for a boolean filter/sort, no client re-execution to disagree with.
 *   - components/community/members-directory.tsx  -> REAL BUG. Found
 *     while checking the Server Component above's children: a
 *     "use client" component calling joinedLabel()/presence()
 *     unconditionally during render -- the former formats with the
 *     runtime's default locale/timezone, the latter depends on real
 *     elapsed time since the server rendered. Same bug class as
 *     flow-dashboard.tsx. Fixed with a `mounted` gate.
 *   - components/community/feed/feed-view.tsx      -> REAL BUG, same
 *     shape, in timeAgo(). Also fixed with a `mounted` gate.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-community-time-hydration-safe.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── Confirmed false positives / non-risks — still checked, so a future
//    edit that DOES introduce a render-time read here gets caught. ──────
{
  const src = read("src/components/funnels/sections/countdown-section.tsx");
  check("countdown-section: left starts null", /const \[left, setLeft\] = useState<ReturnType<typeof timeLeft>\s*\|\s*null>\(null\)/.test(src));
  check("countdown-section: timeLeft() is only called inside useEffect, not during render", /useEffect\(\(\) => \{\s*setLeft\(timeLeft\(config\.endsAt\)\)/.test(src));
}

// ── Real fixes ───────────────────────────────────────────────────────────
{
  const src = read("src/components/community/members-directory.tsx");
  check("members-directory: mounted starts false", /const \[mounted, setMounted\] = useState\(false\)/.test(src));
  check("members-directory: mounted flips in a useEffect", /useEffect\(\(\) => setMounted\(true\), \[\]\)/.test(src));
  check("members-directory: joinedLabel takes mounted and returns \"\" until mounted", /function joinedLabel\(ms: number \| null, mounted: boolean\): string \{\s*if \(!mounted\) return "";/.test(src));
  check("members-directory: presence takes mounted and returns a neutral label until mounted", /function presence\(ms: number \| null, mounted: boolean\)[\s\S]*?if \(!mounted\) return \{ online: false, label: "" \};/.test(src));
  check("members-directory: both call sites pass mounted through", /presence\(r\.lastSeenAtMs, mounted\)/.test(src) && /joinedLabel\(r\.joinedAtMs, mounted\)/.test(src));
}

{
  const src = read("src/components/community/feed/feed-view.tsx");
  check("feed-view: mounted starts false", /const \[mounted, setMounted\] = useState\(false\)/.test(src));
  check("feed-view: mounted flips in a useEffect", /useEffect\(\(\) => setMounted\(true\), \[\]\)/.test(src));
  check("feed-view: timeAgo takes mounted and returns \"\" until mounted", /function timeAgo\(ms: number \| null, mounted: boolean\): string \{\s*if \(!mounted \|\| !ms\) return "";/.test(src));
  check("feed-view: the call site passes mounted through", /timeAgo\(p\.createdAtMs, mounted\)/.test(src));
}

console.log(
  failures === 0
    ? `\nverify-community-time-hydration-safe: all checks passed`
    : `\nverify-community-time-hydration-safe: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
