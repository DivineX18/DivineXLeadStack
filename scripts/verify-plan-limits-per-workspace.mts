/**
 * Per-workspace plan-limit resolution — real function calls against the real
 * production plan docs.
 *
 * Guards the fix that moved limits off the agency (where they merged to the
 * most generous ceiling across every plan on sale, and pooled every customer's
 * usage into one counter) and onto the plan the workspace actually bought.
 *
 * Run: node --experimental-strip-types scripts/verify-plan-limits-per-workspace.mts
 */
import { readFileSync } from "node:fs";

// Admin SDK config must exist before the module graph is imported.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!process.env[m[1]]) process.env[m[1]] = v;
}

const { resolvePlanLimits, checkPlanLimit, NO_LIMITS } = await import(
  "../src/lib/billing/plan-limits.ts"
);
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

const AGENCY_ID = "U5SBAHsB0nZ7ce552H9h";

/**
 * THE LOCKED LADDER, KEYED BY PLAN DOCUMENT — NOT BY PRICE.
 *
 * This table used to be keyed `product|priceMonthlyCents`, and unmatched
 * plans were skipped with `continue`. That is fail-open twice over: moving a
 * price to a founding rate silently unmatched every expectation and the
 * suite passed while checking nothing, and a brand-new plan was never
 * checked at all. Keyed by doc id, a price move changes nothing here, and
 * the coverage assertion below fails loudly when a sellable plan is missing.
 */
const EXPECTED: Record<
  string,
  { label: string; subs: number | null; sites: number | null; emails: number | null;
    ai: number | null; scans: number | null; members: number | null;
    aiSpend: number | null; voice: number | null; sms: number | null }
> = {
  Kzri3NyVTG9dyId7sJHa: { label: "Flow Solo", subs: 1, sites: 5, emails: 25_000, ai: 50, scans: 0, members: 1, aiSpend: 6, voice: 100, sms: 400 },
  "7fOwVNe9zRu8pPesDEXd": { label: "Flow Team", subs: 5, sites: 25, emails: 75_000, ai: 250, scans: 0, members: 5, aiSpend: 20, voice: 300, sms: 1_000 },
  ZdA2vnJSayAiquGQdXY6: { label: "Flow Agency", subs: 25, sites: 100, emails: 200_000, ai: 500, scans: 0, members: null, aiSpend: 50, voice: 750, sms: 1_500 },
  six9XRCcbmAx7rBrgCO6: { label: "Ascend Solo", subs: 1, sites: 5, emails: 2_000, ai: 100, scans: 10, members: 1, aiSpend: 15, voice: 200, sms: 500 },
  xZJultbFi4dTqF9vJTIY: { label: "Ascend Team", subs: 5, sites: 25, emails: 10_000, ai: 750, scans: 100, members: 5, aiSpend: 40, voice: 600, sms: 1_500 },
  SvnbPxTVu6yWsYIl6tT6: { label: "Ascend Agency", subs: 25, sites: 100, emails: 30_000, ai: 2_000, scans: 250, members: null, aiSpend: 90, voice: 1_500, sms: 4_000 },
};

/**
 * Plans deliberately outside the table: sold to nobody new, and grandfathered
 * unlimited on purpose. Listed by NAME rather than skipped by absence, so a
 * new plan cannot join them by accident.
 */
const GRANDFATHERED = new Set(["Growth Operations"]);

const db = getAdminDb();
const plans = await db.collection(`agencies/${AGENCY_ID}/plans`).get();

// ── Each purchased plan resolves to ITS OWN ceiling ──────────────────────
for (const doc of plans.docs) {
  const p = doc.data() as Record<string, unknown>;
  const expected = EXPECTED[doc.id];
  if (!expected) continue;

  // A workspace on this plan, exactly as the sub-account doc would look.
  const limits = await resolvePlanLimits("synthetic", {
    agencyId: AGENCY_ID,
    billing: { planId: doc.id },
  });
  const actual = {
    subs: limits.maxSubAccounts,
    sites: limits.maxWebsites,
    emails: limits.maxEmailsPerMonth,
    ai: limits.maxAiGenerationsPerMonth,
    scans: limits.maxGrowthScansPerMonth,
    members: limits.maxMembers,
    aiSpend: limits.maxAiSpendPerMonth,
    voice: limits.maxVoiceMinutesPerMonth,
    sms: limits.maxSharedSmsPerMonth,
  };
  const { label, ...want } = expected;
  check(
    `${label} resolves to its own tier limits`,
    JSON.stringify(actual) === JSON.stringify(want),
    `got ${JSON.stringify(actual)}`,
  );
}

// ── Every sellable plan is covered, and every cost is bounded ────────────
// The three costs DivineX pays per use — model spend, Vapi minutes, and SMS
// on our own Twilio — were unbounded on the entire Flow ladder because the
// fields simply were not present, and an absent ceiling reads as unlimited.
// Nothing caught it, because the old table did not check those fields and
// skipped any plan it did not recognise.
const COST_DIMENSIONS = [
  ["maxAiSpendPerMonth", "AI spend"],
  ["maxVoiceMinutesPerMonth", "voice minutes"],
  ["maxSharedSmsPerMonth", "shared SMS"],
  ["maxEmailsPerMonth", "email"],
] as const;

let sellable = 0;
for (const doc of plans.docs) {
  const p = doc.data() as Record<string, unknown>;
  if (p.status !== "active") continue;
  const name = String(p.name ?? "");
  if (GRANDFATHERED.has(name)) continue;
  sellable++;

  check(
    `${name} ($${Number(p.priceMonthlyCents) / 100}) has an expectation in this file`,
    !!EXPECTED[doc.id],
    `plan ${doc.id} is on sale and unchecked`,
  );

  const limits = await resolvePlanLimits("synthetic", {
    agencyId: AGENCY_ID,
    billing: { planId: doc.id },
  });
  for (const [field, human] of COST_DIMENSIONS) {
    check(
      `${name} bounds ${human}`,
      limits[field] !== null,
      `${field} is unlimited on a plan we sell`,
    );
  }
}
check("some sellable plans were actually inspected", sellable >= 6, String(sellable));

// ── The bug this replaced: no cross-plan merge ───────────────────────────
const individual = plans.docs.find(
  (d) => d.data().product === "flow" && d.data().priceMonthlyCents === 9900,
);
if (individual) {
  const l = await resolvePlanLimits("synthetic", {
    agencyId: AGENCY_ID,
    billing: { planId: individual.id },
  });
  check(
    "a $99 workspace is NOT given the most generous ceiling on the agency",
    l.maxSubAccounts === 1 && l.maxEmailsPerMonth === 25_000,
    `subAccounts=${l.maxSubAccounts} emails=${l.maxEmailsPerMonth}`,
  );
}

// ── Grandfathering: no billing record means unlimited ────────────────────
const legacy = await resolvePlanLimits("synthetic", { agencyId: AGENCY_ID });
check(
  "workspace with NO billing record stays unlimited (legacy/comped grandfather)",
  JSON.stringify(legacy) === JSON.stringify(NO_LIMITS),
  JSON.stringify(legacy),
);

const comped = await resolvePlanLimits("synthetic", {
  agencyId: AGENCY_ID,
  billing: { planId: null },
});
check(
  "comped workspace (planId null) stays unlimited",
  comped.maxEmailsPerMonth === null && comped.maxSubAccounts === null,
);

const legacy97 = plans.docs.find((d) => !d.data().product && d.data().status === "active");
if (legacy97) {
  const l = await resolvePlanLimits("synthetic", {
    agencyId: AGENCY_ID,
    billing: { planId: legacy97.id },
  });
  check(
    "existing $97 customers keep unlimited (their plan carries no limits)",
    l.maxEmailsPerMonth === null && l.maxGrowthScansPerMonth === null,
    JSON.stringify(l),
  );
}

// ── The ceiling actually refuses ─────────────────────────────────────────
const atCeiling = await checkPlanLimit({
  subAccountId: null,
  kind: "emails",
  currentCount: 0,
  amount: 25_001,
  limits: { ...NO_LIMITS, maxEmailsPerMonth: 25_000 },
});
check("a send over the ceiling is refused", atCeiling.allowed === false, atCeiling.message ?? "");

const underCeiling = await checkPlanLimit({
  subAccountId: null,
  kind: "emails",
  currentCount: 0,
  amount: 25_000,
  limits: { ...NO_LIMITS, maxEmailsPerMonth: 25_000 },
});
check("a send exactly at the ceiling is allowed", underCeiling.allowed === true);

const scansOff = await checkPlanLimit({
  subAccountId: null,
  kind: "growthScans",
  limits: { ...NO_LIMITS, maxGrowthScansPerMonth: 0 },
});
check("Flow tiers (0 Growth Scans) refuse a scan", scansOff.allowed === false);

const unlimitedPasses = await checkPlanLimit({
  subAccountId: null,
  kind: "emails",
  amount: 10_000_000,
  limits: NO_LIMITS,
});
check("unlimited (null) never refuses", unlimitedPasses.allowed === true);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
