/**
 * A website slot is spent by a PUBLISHED site, never by a document.
 *
 * The bug: an empty "Website 1" draft and an Apex build that failed inside
 * gitpage read as "2 of 5 websites used" in a workspace owning zero websites.
 *
 * Run: npx tsx scripts/verify-website-slot-accounting.mts
 */
import {
  consumesWebsiteSlot, countConsumedWebsiteSlots,
  effectiveWebsiteCap, DRAFT_HEADROOM, MAX_WEBSITES_PER_SUBACCOUNT,
} from "../src/lib/website/limits";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); if (!ok) fails++; };

const draft   = { status: "draft",    liveUrl: null };
const queued  = { status: "queued",   liveUrl: null };
const building= { status: "building", liveUrl: null };
const failed  = { status: "failed",   liveUrl: null, errorMessage: "Failed during GitLab setup: invalid_token" };
const ready   = { status: "ready",    liveUrl: "https://apex.gitpage.site" };

ck("empty draft consumes 0", !consumesWebsiteSlot(draft));
ck("queued consumes 0", !consumesWebsiteSlot(queued));
ck("in-flight build consumes 0", !consumesWebsiteSlot(building));
ck("failed unpublished build consumes 0", !consumesWebsiteSlot(failed));
ck("successful published site consumes 1", consumesWebsiteSlot(ready));

// The exact production state that produced the wrong number.
ck("Phase 12 QA (1 draft + 1 failed) reads 0, not 2",
  countConsumedWebsiteSlots([draft, failed]) === 0, `got ${countConsumedWebsiteSlots([draft, failed])}`);

// Retry keeps it at zero until it actually succeeds.
ck("retry of a failed build still 0", countConsumedWebsiteSlots([failed]) === 0);
ck("retry that finally succeeds counts 1", countConsumedWebsiteSlots([ready]) === 1);

ck("additional successes increment", countConsumedWebsiteSlots([ready, ready, ready]) === 3);
ck("mixed workspace counts only published",
  countConsumedWebsiteSlots([draft, failed, ready, building, ready]) === 2);

// A published site whose status was later muddled still counts — this is what
// stops delete/retry churn being a way around the cap.
ck("liveUrl alone still consumes", consumesWebsiteSlot({ status: "failed", liveUrl: "https://x.gitpage.site" }));

// Cap behaviour.
const cap = effectiveWebsiteCap(null);
ck("default cap unchanged", cap === MAX_WEBSITES_PER_SUBACCOUNT, `${cap}`);
ck("cap blocks the 6th PUBLISHED site", countConsumedWebsiteSlots(Array(5).fill(ready)) >= cap);
ck("5 published + drafts still at the cap", countConsumedWebsiteSlots([...Array(5).fill(ready), draft, failed]) === 5);
ck("plan override still honoured", effectiveWebsiteCap(null, 25) === 25);
ck("unlimited still unlimited", effectiveWebsiteCap({ websiteMaxSites: -1 }) === Infinity);
ck("draft headroom exists but is finite", DRAFT_HEADROOM > 0 && Number.isFinite(cap + DRAFT_HEADROOM));


console.log("\n── both counters use the same rule (the 3-of-5 regression) ──");
const fs2 = await import("node:fs");
const ascend = fs2.readFileSync("src/components/shell/ascend-create-content.tsx", "utf8");
const legacy = fs2.readFileSync("src/app/(dashboard)/sa/[subAccountId]/website/page.tsx", "utf8");
ck("Ascend surface counts consumed slots", /countConsumedWebsiteSlots\(orderedSites\)/.test(ascend));
ck("legacy Flow website page counts consumed slots", /countConsumedWebsiteSlots\(orderedSites\)/.test(legacy));
ck("legacy page no longer displays a raw document count",
  !/\{orderedSites\.length\} of \{maxSitesLabel\}/.test(legacy));
ck("legacy 'at cap' uses consumed slots too",
  /atCap = countConsumedWebsiteSlots\(orderedSites\) >= maxSites/.test(legacy));
// The exact production state: 1 draft + 1 failed + 1 building = 0 consumed.
ck("1 draft + 1 failed + 1 building reads 0, not 3",
  countConsumedWebsiteSlots([draft, failed, building]) === 0,
  `got ${countConsumedWebsiteSlots([draft, failed, building])}`);

console.log("\n── a quiet heartbeat must not fail a live build ──");
const poll = fs2.readFileSync("src/app/api/sub-accounts/[id]/website/[siteId]/poll/route.ts", "utf8");
ck("no longer settles as failed on a stale heartbeat",
  !/Build appears stuck/.test(poll));
ck("stale heartbeat keeps polling instead", /slowHeartbeatSince/.test(poll) && /keptPolling/.test(poll));
ck("the 15-minute cap is still the only timeout",
  /attempts > MAX_POLL_ATTEMPTS/.test(poll) && /taking longer than expected/i.test(poll));

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
