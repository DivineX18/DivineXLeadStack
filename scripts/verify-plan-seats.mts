/**
 * Plan member capacity, on the existing PlanLimits system.
 *
 * Team collaboration is included in the plan price. This is a capacity
 * ceiling, never a per-seat charge, and no Stripe object exists for it.
 *
 * The property that matters most is grandfather safety: introducing a limit
 * below a workspace's current headcount must leave every existing member
 * working and refuse only the NEXT addition.
 */
import { NO_LIMITS, limitMessage, type LimitKind } from "../src/lib/billing/plan-limits";
import { normalizePlanLimits } from "../src/lib/server/billing-service";
import { ASCEND_SOLO_WORKSPACE_LIMITS } from "../src/lib/intelligence/ascend-solo-checkout";
import type { PlanLimits } from "../src/types/billing";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? `, ${detail}` : ""}`);
}

/** The exact arithmetic checkPlanLimit applies, exercised through the real
 *  normalizer so a legacy document is modelled the way production reads it. */
function wouldAllow(rawPlan: unknown, activeMembers: number, adding = 1): boolean {
  const limits: PlanLimits = normalizePlanLimits(rawPlan);
  const limit = limits.maxMembers;
  if (limit === null || limit === undefined) return true;
  return activeMembers + adding <= limit;
}

console.log("══ unlimited is the default, everywhere ══");
{
  check("a legacy plan document with no limits at all is unlimited", wouldAllow({}, 999));
  check("a legacy plan with OTHER limits but no maxMembers is unlimited", wouldAllow({ maxWebsites: 5 }, 999));
  check("an explicit null is unlimited", wouldAllow({ maxMembers: null }, 999));
  check("zero is treated as unset, not as a lockout", wouldAllow({ maxMembers: 0 }, 999));
  check("a negative value cannot lock a workspace out", wouldAllow({ maxMembers: -3 }, 999));
  check("a non-numeric value is unlimited, not a crash", wouldAllow({ maxMembers: "five" }, 999));
  check("NO_LIMITS carries the new field as unlimited", NO_LIMITS.maxMembers === null);
  check("a comped workspace (NO_LIMITS) can always add", wouldAllow(NO_LIMITS, 50));
}

console.log("\n══ solo ══");
{
  check("Ascend Solo is one member", ASCEND_SOLO_WORKSPACE_LIMITS.maxMembers === 1, String(ASCEND_SOLO_WORKSPACE_LIMITS.maxMembers));
  check("solo permits its first member", wouldAllow({ maxMembers: 1 }, 0));
  check("solo refuses a second", !wouldAllow({ maxMembers: 1 }, 1));
}

console.log("\n══ team of five ══");
{
  for (let n = 0; n < 5; n++) {
    check(`permits member ${n + 1} of 5`, wouldAllow({ maxMembers: 5 }, n));
  }
  check("refuses the sixth", !wouldAllow({ maxMembers: 5 }, 5));
  check("refuses a bulk add that would overshoot", !wouldAllow({ maxMembers: 5 }, 4, 2));
  check("permits a bulk add that exactly fills", wouldAllow({ maxMembers: 5 }, 3, 2));
}

console.log("\n══ grandfather safety ══");
{
  // The property the rollout depends on: a limit introduced BELOW the
  // current headcount refuses the next member and touches nobody.
  check("an over-limit workspace is only refused the NEXT member", !wouldAllow({ maxMembers: 5 }, 6));
  // The refusal must REPORT the real headcount rather than clamp it. A
  // decision that quietly said "5 of 5" while six people were in the
  // workspace would be the shape of an implementation that corrects
  // membership instead of merely declining the next one.
  const over = limitMessage("members" as LimitKind, 5, 6);
  check("the refusal states the true over-limit count, not a clamped one", /6 of 5/.test(over), over);
  check("falling to 4 allows exactly one more", wouldAllow({ maxMembers: 5 }, 4) && !wouldAllow({ maxMembers: 5 }, 5));
  check("a workspace far over the cap still refuses rather than throwing", !wouldAllow({ maxMembers: 1 }, 99));
}

console.log("\n══ what the customer is told ══");
{
  const solo = limitMessage("members" as LimitKind, 1, 1);
  check("solo is told to upgrade to work with a team", /single user/i.test(solo) && /upgrade/i.test(solo), solo);
  const team = limitMessage("members" as LimitKind, 5, 5);
  check("team is told the number and the usage", /5-member limit/.test(team) && /5 of 5/.test(team), team);
  check("the refusal never mentions a per-seat charge", !/per.seat|per seat|buy a seat|add a seat/i.test(solo + team));
}

console.log("\n══ no Stripe surface ══");
{
  // maxMembers lives in the plan's Firestore `limits`, beside maxWebsites.
  // If it ever gained a Stripe id this would be the wrong file.
  const normalized = normalizePlanLimits({ maxMembers: 5 });
  check("normalizing produces only plan limits, no price fields", !("stripePriceId" in normalized) && !("priceMonthlyCents" in normalized));
  check("and it round-trips the value", normalized.maxMembers === 5);
}

console.log(`\n${failures === 0 ? "PLAN SEATS: ALL CHECKS PASSED" : `PLAN SEATS: ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
