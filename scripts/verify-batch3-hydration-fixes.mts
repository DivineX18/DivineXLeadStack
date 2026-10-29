/**
 * Systematic hydration sweep (final QA certification, 2026-10-28),
 * final pass: the two triage agents covering batches 1 and 3 (32 files)
 * plus three files a widened grep turned up (Intl.DateTimeFormat with an
 * unpinned locale, which the original pattern list missed) hit a session
 * rate limit before finishing, so this pass was done directly rather than
 * via subagents. Five more confirmed real bugs, all fixed with the
 * shared useHydrationSafeNow() hook or a pinned locale/timeZone, same
 * shape as every other fix in this sweep:
 *
 *   - ai-agents/outbound/campaigns/[campaignId]/page.tsx:
 *     isRecipientLive() read Date.now() directly and controlled whether
 *     <LiveBadge/> mounts -- a node-presence mismatch. A pre-existing
 *     15s re-render ticker (forceTick) is now just useHydrationSafeNow
 *     (15000), doing double duty as the hydration fix and the live
 *     refresh.
 *   - booking/[slug]/bookings/page.tsx: Date.now() fed both filter-chip
 *     membership and the rendered upcoming/completed COUNTS; a separate
 *     BookingRow sub-component's whenLabel left locale unqualified.
 *   - booking/public-booking-view.tsx: three Intl.DateTimeFormat calls
 *     left locale unqualified even though timeZone was already
 *     mount-gated correctly (same shape as public-event-view.tsx).
 *   - quotes/public-quote-view.tsx: validUntilDisplay had no timeZone
 *     option, and `quote` is a required prop with real data on the very
 *     first render (no async-loading gate) -- pinned to UTC so the
 *     deadline date reads the same for every viewer.
 *   - social/social-content-calendar.tsx: the month-header label left
 *     locale unqualified.
 *
 * Every other file in these batches was confirmed a false positive via
 * one of two established safe patterns: list/record state starts
 * empty/null and is only populated post-mount (contacts, tasks, forms,
 * social posts, API keys, webhook subscriptions, email logs, workflow
 * runs, Google metrics, etc.), or the risky code is behind an
 * interaction-gated dialog/panel that starts closed (command palette,
 * test-call progress, growth-scan polling, the AI Suite chat history
 * panel). Number.prototype.toLocaleString() on plain counts (page
 * views, token totals) is a related but distinct, out-of-scope class --
 * not a Date/time value -- noted for awareness, not fixed here.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-batch3-hydration-fixes.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

{
  const src = read("src/app/(dashboard)/sa/[subAccountId]/ai-agents/outbound/campaigns/[campaignId]/page.tsx");
  check("outbound campaign detail: imports the shared hook", /import \{ useHydrationSafeNow \} from "@\/hooks\/use-hydration-safe-now";/.test(src));
  check("outbound campaign detail: uses it with a 15s tick, replacing the old bespoke forceTick ticker", /const now = useHydrationSafeNow\(15000\);/.test(src) && !/forceTick/.test(src));
  check("outbound campaign detail: isRecipientLive takes `now`, defaults to not-live until it's non-null", /function isRecipientLive\(r: VoiceCampaignRecipientDoc, now: number \| null\): boolean \{\s*if \(now === null\) return false;/.test(src));
  check("outbound campaign detail: both call sites pass `now` through", (src.match(/isRecipientLive\(r, now\)/g) ?? []).length === 2);
}

{
  const src = read("src/app/(dashboard)/sa/[subAccountId]/booking/[slug]/bookings/page.tsx");
  check("booking list: imports the shared hook", /import \{ useHydrationSafeNow \} from "@\/hooks\/use-hydration-safe-now";/.test(src));
  check("booking list: now comes from the hook, not a bare Date.now()", /const now = useHydrationSafeNow\(\);/.test(src) && !/const now = Date\.now\(\);/.test(src));
  check("booking list: isPast requires now !== null in both the filter and the counts", (src.match(/const isPast = now !== null && startMs < now;/g) ?? []).length === 2);
  check("booking list: BookingRow pins \"en-US\" instead of undefined", /new Intl\.DateTimeFormat\("en-US", \{/.test(src) && !/new Intl\.DateTimeFormat\(undefined,/.test(src));
}

{
  const src = read("src/components/booking/public-booking-view.tsx");
  check("public-booking-view: all three formatters pin \"en-US\" instead of undefined", (src.match(/new Intl\.DateTimeFormat\("en-US", \{/g) ?? []).length === 3);
  check("public-booking-view: no formatter still passes undefined as the locale", !/new Intl\.DateTimeFormat\(undefined,/.test(src));
}

{
  const src = read("src/components/quotes/public-quote-view.tsx");
  check("public-quote-view: validUntilDisplay pins timeZone: \"UTC\"", /new Date\(quote\.validUntil\)\.toLocaleDateString\("en-GB", \{\s*day: "numeric",\s*month: "short",\s*year: "numeric",\s*timeZone: "UTC",/.test(src));
}

{
  const src = read("src/components/social/social-content-calendar.tsx");
  check("social-content-calendar: monthLabel pins \"en-US\" instead of undefined", /cursor\.toLocaleDateString\("en-US", \{/.test(src));
  check("social-content-calendar: no formatter still passes undefined as the locale", !/toLocaleDateString\(undefined,/.test(src));
}

console.log(
  failures === 0
    ? `\nverify-batch3-hydration-fixes: all checks passed`
    : `\nverify-batch3-hydration-fixes: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
