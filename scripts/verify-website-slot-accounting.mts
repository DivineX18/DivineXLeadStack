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

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
