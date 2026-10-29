/**
 * Systematic hydration sweep (final QA certification, 2026-10-28),
 * batch 2 of 3: six confirmed real instances of the Date.now() /
 * toLocaleString family / Intl.DateTimeFormat-in-render bug class, all
 * fixed with the shared useHydrationSafeNow() hook
 * (src/hooks/use-hydration-safe-now.ts).
 *
 *   - booking/public-event-view.tsx: isPast (drives StatusBadge text +
 *     whether cancel/reschedule buttons render) read Date.now()
 *     unconditionally; formatLong/formatTime/formatDate left locale
 *     unqualified (undefined) even though timeZone was already safely
 *     threaded via a mount-gated viewerTz state.
 *   - calendar/calendar-view.tsx: formatTime() used no timeZone option,
 *     defaulting to the calling runtime's own zone (server vs browser).
 *   - conversations/conversation-ai-controls.tsx: `paused` (Date.now())
 *     controls whether the "Bot paused. Resume" button mounts at all --
 *     a node-presence mismatch, not just a text swap.
 *   - community/dm/dm-inbox.tsx and feed/post-detail-view.tsx: timeAgo()
 *     helpers, same shape as feed-view.tsx/members-directory.tsx.
 *   - conversations/conversation-list.tsx: formatShort() had both the
 *     elapsed-time branch AND an unqualified locale.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-batch2-hydration-fixes.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

{
  const src = read("src/components/booking/public-event-view.tsx");
  check("public-event-view: imports the shared hook", /import \{ useHydrationSafeNow \} from "@\/hooks\/use-hydration-safe-now";/.test(src));
  check("public-event-view: isPast is gated on now !== null, not a bare Date.now() comparison", /const isPast = now !== null && new Date\(currentEnd\)\.getTime\(\) < now;/.test(src));
  check("public-event-view: formatLong/formatTime/formatDate all pin \"en-US\" instead of undefined", (src.match(/new Intl\.DateTimeFormat\("en-US", \{/g) ?? []).length === 3);
  check("public-event-view: no formatter still passes undefined as the locale", !/new Intl\.DateTimeFormat\(undefined,/.test(src));
}

{
  const src = read("src/components/calendar/calendar-view.tsx");
  check("calendar-view: imports the shared hook", /import \{ useHydrationSafeNow \} from "@\/hooks\/use-hydration-safe-now";/.test(src));
  check("calendar-view: formatTime takes `now` and returns \"\" until it's non-null", /function formatTime\(d: Date, now: number \| null\): string \{\s*if \(now === null\) return "";/.test(src));
  check("calendar-view: the call site passes `now` through", /formatTime\(start, now\)/.test(src));
}

{
  const src = read("src/components/conversations/conversation-ai-controls.tsx");
  check("conversation-ai-controls: imports the shared hook", /import \{ useHydrationSafeNow \} from "@\/hooks\/use-hydration-safe-now";/.test(src));
  check("conversation-ai-controls: paused requires now !== null, defaulting to not-paused pre-mount", /const paused =\s*now !== null && mode !== "off" && !!pausedUntil && pausedUntil\.getTime\(\) > now;/.test(src));
}

{
  const src = read("src/components/community/dm/dm-inbox.tsx");
  check("dm-inbox: imports the shared hook", /import \{ useHydrationSafeNow \} from "@\/hooks\/use-hydration-safe-now";/.test(src));
  check("dm-inbox: timeAgo takes `now` and returns \"\" until it's non-null", /function timeAgo\(ms: number \| null, now: number \| null\): string \{\s*if \(!ms \|\| now === null\) return "";/.test(src));
  check("dm-inbox: the call site passes `now` through", /timeAgo\(t\.lastAtMs, now\)/.test(src));
}

{
  const src = read("src/components/conversations/conversation-list.tsx");
  check("conversation-list: imports the shared hook", /import \{ useHydrationSafeNow \} from "@\/hooks\/use-hydration-safe-now";/.test(src));
  check("conversation-list: formatShort takes `now`, returns \"\" until it's non-null, and pins \"en-US\"", /function formatShort\(d: Date, now: number \| null\): string \{\s*if \(now === null\) return "";/.test(src) && !/toLocaleTimeString\(undefined/.test(src) && !/toLocaleDateString\(undefined/.test(src));
  check("conversation-list: the call site passes `now` through", /formatShort\(ts, now\)/.test(src));
}

{
  const src = read("src/components/community/feed/post-detail-view.tsx");
  check("post-detail-view: imports the shared hook", /import \{ useHydrationSafeNow \} from "@\/hooks\/use-hydration-safe-now";/.test(src));
  check("post-detail-view: timeAgo takes `now` and returns \"\" until it's non-null", /function timeAgo\(ms: number \| null, now: number \| null\): string \{\s*if \(!ms \|\| now === null\) return "";/.test(src));
  check("post-detail-view: PostDetailView's own post timestamp passes `now` through", /timeAgo\(post\.createdAtMs, now\)/.test(src));
  check("post-detail-view: CommentBubble calls the hook itself (separate component instance per row, not threaded as a prop)", /timeAgo\(comment\.createdAtMs, now\)/.test(src) && (src.match(/const now = useHydrationSafeNow\(\);/g) ?? []).length === 2);
}

console.log(
  failures === 0
    ? `\nverify-batch2-hydration-fixes: all checks passed`
    : `\nverify-batch2-hydration-fixes: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
