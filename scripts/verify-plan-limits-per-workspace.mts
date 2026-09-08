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

/** The locked V1 pricing, restated here so a silent plan-doc edit fails loudly. */
const EXPECTED: Record<string, [number, number, number, number, number]> = {
  // name|product            subs  sites   emails    ai  scans
  "flow|9900": [1, 5, 25_000, 50, 0],
  "flow|29700": [5, 25, 75_000, 250, 0],
  "flow|69700": [25, 100, 200_000, 500, 0],
  "unified|19700": [1, 5, 25_000, 100, 10],
  "unified|39700": [5, 25, 75_000, 300, 30],
  "unified|79700": [25, 100, 200_000, 600, 60],
};

const db = getAdminDb();
const plans = await db.collection(`agencies/${AGENCY_ID}/plans`).get();

// ── Each purchased plan resolves to ITS OWN ceiling ──────────────────────
for (const doc of plans.docs) {
  const p = doc.data() as Record<string, unknown>;
  const key = `${(p.product as string) ?? "flow"}|${p.priceMonthlyCents}`;
  const expected = EXPECTED[key];
  if (!expected) continue;

  // A workspace on this plan, exactly as the sub-account doc would look.
  const limits = await resolvePlanLimits("synthetic", {
    agencyId: AGENCY_ID,
    billing: { planId: doc.id },
  });
  const actual = [
    limits.maxSubAccounts,
    limits.maxWebsites,
    limits.maxEmailsPerMonth,
    limits.maxAiGenerationsPerMonth,
    limits.maxGrowthScansPerMonth,
  ];
  check(
    `${key} resolves to its own tier limits`,
    JSON.stringify(actual) === JSON.stringify(expected),
    `got ${JSON.stringify(actual)}`,
  );
}

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
