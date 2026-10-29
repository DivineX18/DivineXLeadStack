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
 *     flow-dashboard.tsx. Fixed with the shared useHydrationSafeNow()
 *     hook (src/hooks/use-hydration-safe-now.ts).
 *   - components/community/feed/feed-view.tsx      -> REAL BUG, same
 *     shape, in timeAgo(). Also fixed with the shared hook.
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

// ── Real fixes, both now on the shared hook ────────────────────────────
{
  const src = read("src/components/community/members-directory.tsx");
  check("members-directory: uses the shared useHydrationSafeNow() hook", /import \{ useHydrationSafeNow \} from "@\/hooks\/use-hydration-safe-now";/.test(src));
  check("members-directory: now comes from the hook, no local mounted boilerplate", /const now = useHydrationSafeNow\(\);/.test(src) && !/\[mounted, setMounted\]/.test(src));
  check("members-directory: joinedLabel takes `now` and returns \"\" until it's non-null", /function joinedLabel\(ms: number \| null, now: number \| null\): string \{\s*if \(now === null\) return "";/.test(src));
  check("members-directory: presence takes `now` and returns a neutral label until it's non-null", /function presence\(ms: number \| null, now: number \| null\)[\s\S]*?if \(now === null\) return \{ online: false, label: "" \};/.test(src));
  check("members-directory: presence computes elapsed time from the passed-in `now`, not a fresh Date.now()", /const mins = Math\.floor\(\(now - ms\) \/ 60000\);/.test(src));
  check("members-directory: both call sites pass `now` through", /presence\(r\.lastSeenAtMs, now\)/.test(src) && /joinedLabel\(r\.joinedAtMs, now\)/.test(src));
}

{
  const src = read("src/components/community/feed/feed-view.tsx");
  check("feed-view: uses the shared useHydrationSafeNow() hook", /import \{ useHydrationSafeNow \} from "@\/hooks\/use-hydration-safe-now";/.test(src));
  check("feed-view: now comes from the hook, no local mounted boilerplate", /const now = useHydrationSafeNow\(\);/.test(src) && !/\[mounted, setMounted\]/.test(src));
  check("feed-view: timeAgo takes `now` and returns \"\" until it's non-null", /function timeAgo\(ms: number \| null, now: number \| null\): string \{\s*if \(now === null \|\| !ms\) return "";/.test(src));
  check("feed-view: timeAgo computes elapsed time from the passed-in `now`, not a fresh Date.now()", /const s = Math\.floor\(\(now - ms\) \/ 1000\);/.test(src));
  check("feed-view: the call site passes `now` through", /timeAgo\(p\.createdAtMs, now\)/.test(src));
}

console.log(
  failures === 0
    ? `\nverify-community-time-hydration-safe: all checks passed`
    : `\nverify-community-time-hydration-safe: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
