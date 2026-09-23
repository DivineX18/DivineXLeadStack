/**
 * REGRESSION: an Ascend-provisioned workspace must be metered.
 *
 * It carries no `billing.planId`, so it fell through the grandfather clause
 * that reads an absent plan as unlimited — leaving a paying $197 customer
 * with no ceiling on Growth Scans, asset generations or broadcast email the
 * moment any agency gate was flipped on. This pins the fallback, and pins
 * that the grandfather clause still applies to everyone it is meant for.
 *
 * Run:
 *   npx tsx --tsconfig ./scripts/tsconfig.verify.json ./scripts/verify-ascend-solo-limits.mts
 *
 * Needs .env.local only because resolvePlanLimits initialises the Admin SDK
 * before it reads the argument it was handed; no Firestore read happens on
 * any path this exercises.
 *
 * Mutation-tested: deleting the branch, dropping the provisionedByAscend
 * check, and moving the branch below the grandfather clause each fail it.
 */
import fs from "node:fs";
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (m) process.env[m[1]] ??= m[2].replace(/^"|"$/g, "").replace(/\\n/g, "\n");
}
const { resolvePlanLimits, NO_LIMITS } = await import("@/lib/billing/plan-limits");
const { ASCEND_SOLO_WORKSPACE_LIMITS } = await import("@/lib/intelligence/ascend-solo-checkout");

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
let fails = 0;
const check = (name: string, pass: boolean) => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) fails++;
};

const solo = await resolvePlanLimits(null, {
  agencyId: "ag1",
  ascendOperations: { provisionedByAscend: true, status: "active" },
});
check("Ascend-provisioned workspace is metered, not unlimited",
  eq(solo, ASCEND_SOLO_WORKSPACE_LIMITS) && !eq(solo, NO_LIMITS));

const comped = await resolvePlanLimits(null, { agencyId: "ag1" });
check("comped / legacy workspace still unlimited", eq(comped, NO_LIMITS));

const notProvisioned = await resolvePlanLimits(null, {
  agencyId: "ag1",
  ascendOperations: { provisionedByAscend: false, status: "active" },
});
check("grant not raised by provisioning stays unlimited", eq(notProvisioned, NO_LIMITS));

check("ceiling carries the real numbers",
  ASCEND_SOLO_WORKSPACE_LIMITS.maxGrowthScansPerMonth === 15 &&
  ASCEND_SOLO_WORKSPACE_LIMITS.maxAiGenerationsPerMonth === 50 &&
  ASCEND_SOLO_WORKSPACE_LIMITS.maxEmailsPerMonth === 25000);

console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
