/**
 * DivineX-paid variable cost must be BOUNDED per workspace.
 *
 * The audit found three surfaces where one customer could generate
 * unlimited provider cost: Vapi voice minutes, AI provider spend, and SMS
 * on the shared DivineX Twilio credentials. Email was metered on broadcasts
 * only, so every other paid send path bypassed it.
 *
 * The properties that matter here are the ones that decide whether a price
 * is safe, and the ones that decide whether a customer gets wrongly cut off.
 */
import { NO_LIMITS, limitMessage, type LimitKind } from "../src/lib/billing/plan-limits";
import { normalizePlanLimits } from "../src/lib/server/billing-service";
import { computeAiCostUsd } from "../src/lib/billing/ai-cost";
import { ASCEND_SOLO_WORKSPACE_LIMITS } from "../src/lib/intelligence/ascend-solo-checkout";
import type { PlanLimits } from "../src/types/billing";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? `, ${detail}` : ""}`);
}

/** The arithmetic checkPlanLimit applies, through the real normalizer. */
const allows = (raw: unknown, field: keyof PlanLimits, used: number, adding = 1) => {
  const limit = normalizePlanLimits(raw)[field];
  return limit === null || limit === undefined ? true : used + adding <= limit;
};

console.log("══ legacy and unbilled stay unlimited ══");
{
  for (const f of ["maxVoiceMinutesPerMonth", "maxAiSpendPerMonth", "maxSharedSmsPerMonth"] as const) {
    check(`${f}: a plan predating the field is unlimited`, allows({}, f, 999_999));
    check(`${f}: explicit null is unlimited`, allows({ [f]: null }, f, 999_999));
    check(`${f}: present in NO_LIMITS as null`, NO_LIMITS[f] === null);
  }
  check("a comped workspace (NO_LIMITS) can always spend", allows(NO_LIMITS, "maxAiSpendPerMonth", 10_000));
}

console.log("\n══ voice minutes ══");
{
  check("under the cap is allowed", allows({ maxVoiceMinutesPerMonth: 200 }, "maxVoiceMinutesPerMonth", 100));
  check("exactly at the cap refuses the next minute", !allows({ maxVoiceMinutesPerMonth: 200 }, "maxVoiceMinutesPerMonth", 200));
  check("over the cap refuses", !allows({ maxVoiceMinutesPerMonth: 200 }, "maxVoiceMinutesPerMonth", 240));
  // Inbound is recorded but never gated, so a workspace can legitimately
  // finish over its cap. That must refuse the NEXT outbound, not error.
  check("an over-cap workspace still resolves a decision rather than throwing", !allows({ maxVoiceMinutesPerMonth: 200 }, "maxVoiceMinutesPerMonth", 1_000));
  check("Ascend Solo carries the approved 200", ASCEND_SOLO_WORKSPACE_LIMITS.maxVoiceMinutesPerMonth === 200);
}

console.log("\n══ AI spend, in dollars not messages ══");
{
  // The reason the ceiling is cost and not a message count: one Opus turn
  // costs far more than one Haiku reply, so a count would misprice them.
  const haiku = computeAiCostUsd("anthropic/claude-haiku-4-5", 1_000, 500);
  const opus = computeAiCostUsd("anthropic/claude-opus-4-8", 1_000, 500);
  check("a Haiku turn is priced", haiku > 0, `$${haiku.toFixed(6)}`);
  check("an Opus turn costs materially more than Haiku", opus > haiku * 4, `${(opus / haiku).toFixed(1)}x`);
  check("the OpenRouter vendor prefix is stripped for lookup",
    computeAiCostUsd("anthropic/claude-haiku-4-5", 1e6, 0) === computeAiCostUsd("claude-haiku-4-5", 1e6, 0));
  check("an unknown model bills at a real rate, never free",
    computeAiCostUsd("someone/brand-new-model", 1e6, 0) > 0);
  check("negative token counts cannot create a credit",
    computeAiCostUsd("claude-haiku-4-5", -1e9, -1e9) === 0);
  check("under the ceiling is allowed", allows({ maxAiSpendPerMonth: 15 }, "maxAiSpendPerMonth", 10, 0));
  check("at the ceiling refuses", !allows({ maxAiSpendPerMonth: 15 }, "maxAiSpendPerMonth", 15, 1));
  check("Ascend Solo carries the approved $15", ASCEND_SOLO_WORKSPACE_LIMITS.maxAiSpendPerMonth === 15);
}

console.log("\n══ shared SMS only ══");
{
  check("shared sends are capped", !allows({ maxSharedSmsPerMonth: 500 }, "maxSharedSmsPerMonth", 500));
  check("under the cap is allowed", allows({ maxSharedSmsPerMonth: 500 }, "maxSharedSmsPerMonth", 499));
  check("Ascend Solo carries the approved 500", ASCEND_SOLO_WORKSPACE_LIMITS.maxSharedSmsPerMonth === 500);
}

console.log("\n══ what the customer is told ══");
{
  const v = limitMessage("voiceMinutes" as LimitKind, 200, 200);
  const a = limitMessage("aiSpend" as LimitKind, 15, 15);
  const s = limitMessage("sharedSms" as LimitKind, 500, 500);
  const e = limitMessage("emails" as LimitKind, 2000, 2000);
  for (const [name, msg] of [["voice", v], ["ai", a], ["sms", s], ["email", e]] as const) {
    check(`${name}: says what to do next`, /upgrade|reset|1st/i.test(msg), msg.slice(0, 60));
  }
  // The AI ceiling is internal. A customer must never see the dollar figure,
  // a token count, or a provider name.
  const leaky = /\$\s?\d|token|anthropic|openrouter|opus|haiku|sonnet|margin|provider cost/i;
  check("the AI refusal leaks no provider or currency detail", !leaky.test(a), a);
  check("no refusal leaks provider or currency detail", ![v, a, s, e].some((m) => leaky.test(m)));
  // The ceiling is a DOLLAR figure. Rendering it as a count read
  // "you've used all 15 intelligent generations", which is both a leak of
  // the internal number and untrue. No digit belongs in this one.
  // "1st" is a date, not a ceiling. What must never appear is the internal
  // dollar figure itself, at any of the three configured tiers.
  for (const ceiling of [15, 40, 90]) {
    const msg = limitMessage("aiSpend" as LimitKind, ceiling, ceiling);
    check(
      `the AI refusal never prints the $${ceiling} ceiling`,
      !new RegExp(`\\b${ceiling}\\b`).test(msg),
      msg.slice(0, 70),
    );
  }
  // The other three are genuine counts and SHOULD state them.
  check("voice still states its real count", /200/.test(v));
  check("sms still states its real count", /500/.test(s));
  check("email still states its real count", /2000|2,000/.test(e));
}

console.log("\n══ zero is a ceiling, not an absence ══");
// normalizePlanLimits required `> 0`, so an explicit 0 was stored as null,
// and null means unlimited. A plan authored to include NONE of a metered
// thing was therefore stored as including an unbounded amount of it. That
// is fail-open on exactly the dimensions this file exists to bound.
{
  const zeroed = normalizePlanLimits({
    maxGrowthScansPerMonth: 0,
    maxVoiceMinutesPerMonth: 0,
    maxSharedSmsPerMonth: 0,
    maxAiSpendPerMonth: 0,
  });
  check("a zero Growth Scan ceiling survives the write path", zeroed.maxGrowthScansPerMonth === 0,
    String(zeroed.maxGrowthScansPerMonth));
  check("a zero voice ceiling survives the write path", zeroed.maxVoiceMinutesPerMonth === 0,
    String(zeroed.maxVoiceMinutesPerMonth));
  check("a zero SMS ceiling survives the write path", zeroed.maxSharedSmsPerMonth === 0,
    String(zeroed.maxSharedSmsPerMonth));
  check("a zero AI-spend ceiling survives the write path", zeroed.maxAiSpendPerMonth === 0,
    String(zeroed.maxAiSpendPerMonth));
  // The distinction that matters: absent still means unlimited, and must.
  const absent = normalizePlanLimits({});
  check("an absent ceiling still means unlimited", absent.maxGrowthScansPerMonth === null);
  check("zero and absent are not the same value",
    zeroed.maxGrowthScansPerMonth !== absent.maxGrowthScansPerMonth);
  // Garbage must not become zero either — that would wall a customer out of
  // something their plan never restricted.
  const junk = normalizePlanLimits({ maxGrowthScansPerMonth: "0", maxVoiceMinutesPerMonth: NaN });
  check("a string zero is not read as a zero ceiling", junk.maxGrowthScansPerMonth === null);
  check("NaN is not read as a zero ceiling", junk.maxVoiceMinutesPerMonth === null);
  // A negative must not survive in either direction: not as unlimited, and
  // not as a negative ceiling that refuses everything with a number nobody
  // typed.
  const neg = normalizePlanLimits({ maxVoiceMinutesPerMonth: -5, maxAiSpendPerMonth: -0.5 });
  check("a negative ceiling does not become unlimited", neg.maxVoiceMinutesPerMonth !== null);
  check("a negative ceiling is clamped to zero", neg.maxVoiceMinutesPerMonth === 0,
    String(neg.maxVoiceMinutesPerMonth));
  check("a negative fraction does not floor to -1", neg.maxAiSpendPerMonth === 0,
    String(neg.maxAiSpendPerMonth));
  // And the customer must read something true when they hit it.
  const zmsg = limitMessage("growthScans", 0, 0);
  check("a zero ceiling says the feature is not included",
    zmsg.includes("aren't included") && !zmsg.includes("all 0") && !zmsg.includes("0 of 0"), zmsg);
  for (const kind of ["voiceMinutes", "sharedSms", "emails"] as LimitKind[]) {
    const m = limitMessage(kind, 0, 0);
    check(`a zero ${kind} ceiling reads as not included`, m.includes("aren't included"), m);
  }
}

console.log(`\n${failures === 0 ? "COST GUARDRAILS: ALL CHECKS PASSED" : `COST GUARDRAILS: ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
