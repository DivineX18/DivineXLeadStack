/**
 * $297 COLLISION — product identity must never be derived from the amount.
 *
 * DivineX sells two different things at $297/month: Flow's "Team" client-
 * billing plan and ASCEND's "Team" tier. Anything that decided what a
 * customer bought by looking at the money would hand Flow customers ASCEND
 * entitlements and vice versa. These checks exercise the real routing and
 * the real plan-limit resolution with deliberately identical amounts.
 *
 *   pnpm tsx scripts/verify-price-collision.mts
 */
import { classifyCheckoutSession } from "../src/lib/stripe/checkout-identity";
import { normalizePlanLimits } from "../src/lib/server/billing-service";
import { checkPlanLimit } from "../src/lib/billing/plan-limits";
import { readFileSync } from "node:fs";

let pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

const TWO_NINETY_SEVEN = 29700;

// --- The two colliding sessions. Identical money, different products. -----
// A Flow agency's client paying for the Flow "Team" plan.
const flowTeam = {
  amount_total: TWO_NINETY_SEVEN,
  currency: "usd",
  metadata: {
    kind: "subAccountPlan",
    subAccountId: "sa_flow_client",
    planId: "plan_flow_team",
  },
} as const;

// A stranger buying ASCEND "Team" on the public pricing page. Same price.
// ASCEND's own webhook (BI repo) reads metadata.product; what matters on
// Flow's side is that this is NOT mistaken for a Flow client-billing plan.
const ascendTeam = {
  amount_total: TWO_NINETY_SEVEN,
  currency: "usd",
  metadata: {
    kind: "publicSelfServeSignup",
    product: "growth_system",
  },
} as const;

console.log("\n1. Two $297 sessions route to different products");
const flowRoute = classifyCheckoutSession(flowTeam);
const ascendRoute = classifyCheckoutSession(ascendTeam);
check("the amounts really are identical", flowTeam.amount_total === ascendTeam.amount_total);
check("Flow Team $297 routes to the Flow client-billing handler",
  flowRoute.route === "subAccountPlan", flowRoute.route);
check("ASCEND Team $297 does NOT route to the Flow client-billing handler",
  ascendRoute.route !== "subAccountPlan", ascendRoute.route);
check("ASCEND Team $297 routes to the self-serve provisioning handler",
  ascendRoute.route === "publicSelfServeSignup", ascendRoute.route);
check("two equal-priced sessions reach two different routes",
  flowRoute.route !== ascendRoute.route);

console.log("\n2. The Flow plan is identified by planId, not by price");
check("the Flow route carries the planId forward",
  flowRoute.route === "subAccountPlan" && flowRoute.planId === "plan_flow_team");
check("the Flow route carries the workspace forward",
  flowRoute.route === "subAccountPlan" && flowRoute.subAccountId === "sa_flow_client");
// A second Flow plan at the SAME price must stay distinguishable.
const flowTeamTwin = classifyCheckoutSession({
  metadata: { kind: "subAccountPlan", subAccountId: "sa_other", planId: "plan_flow_team_legacy" },
});
check("two Flow plans priced the same resolve to different planIds",
  flowRoute.route === "subAccountPlan" && flowTeamTwin.route === "subAccountPlan" &&
  flowRoute.planId !== flowTeamTwin.planId);

console.log("\n3. Entitlement differs even when the money does not");
// Same $297, two different plan documents. Flow's Team plan sells CRM seats
// and contacts; ASCEND's Team tier sells Growth Scans and intelligent
// generation. Neither plan can be inferred from the price they share.
const flowTeamLimits = normalizePlanLimits({
  maxMembers: 5, maxSubAccounts: 5, maxWebsites: 25,
});
const ascendTeamLimits = normalizePlanLimits({
  maxMembers: 5, maxSubAccounts: 5, maxGrowthScansPerMonth: 100, maxAiSpendPerMonth: 40,
});

const flowScans = await checkPlanLimit({
  subAccountId: null, limits: flowTeamLimits, kind: "growthScans", currentCount: 0,
});
const ascendScansFresh = await checkPlanLimit({
  subAccountId: null, limits: ascendTeamLimits, kind: "growthScans", currentCount: 0,
});
const ascendScansAtCeiling = await checkPlanLimit({
  subAccountId: null, limits: ascendTeamLimits, kind: "growthScans", currentCount: 100,
});
check("the ASCEND $297 plan carries a finite scan ceiling",
  ascendScansFresh.limit === 100, String(ascendScansFresh.limit));
check("the Flow $297 plan carries no scan ceiling at all",
  flowScans.limit === null, String(flowScans.limit));
check("two plans at the same price disagree about the scan ceiling",
  flowScans.limit !== ascendScansFresh.limit);
check("the ASCEND scan ceiling is actually refused at the ceiling",
  !ascendScansAtCeiling.allowed);

const flowWebsites = await checkPlanLimit({
  subAccountId: null, limits: flowTeamLimits, kind: "websites", currentCount: 24,
});
const ascendWebsites = await checkPlanLimit({
  subAccountId: null, limits: ascendTeamLimits, kind: "websites", currentCount: 24,
});
check("the Flow $297 plan caps websites", flowWebsites.limit === 25, String(flowWebsites.limit));
check("the ASCEND $297 plan does not cap websites", ascendWebsites.limit === null,
  String(ascendWebsites.limit));
check("two plans at the same price disagree about the website ceiling",
  flowWebsites.limit !== ascendWebsites.limit);

const flowSpend = await checkPlanLimit({
  subAccountId: null, limits: flowTeamLimits, kind: "aiSpend", currentCount: 0,
});
const ascendSpend = await checkPlanLimit({
  subAccountId: null, limits: ascendTeamLimits, kind: "aiSpend", currentCount: 0,
});
check("the ASCEND $297 plan carries a finite AI spend allowance",
  ascendSpend.limit === 40, String(ascendSpend.limit));
check("two plans at the same price disagree about AI spend",
  flowSpend.limit !== ascendSpend.limit);

console.log("\n4. No routing or identity code reads the amount");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const identityCode = stripComments(readFileSync("src/lib/stripe/checkout-identity.ts", "utf8"));
check("the comment-stripper actually removed the prose",
  !identityCode.includes("collision") && identityCode.includes("classifyCheckoutSession"));
for (const field of ["amount_total", "amount_subtotal", "unit_amount", "priceCents", "currency"]) {
  check(`the classifier's code never reads ${field}`, !identityCode.includes(field));
}
const billingSrc = readFileSync("src/lib/server/billing-service.ts", "utf8");
// The plan doc is fetched by id. Prove the lookup path is id-keyed.
check("the activation handler loads the plan by planId",
  /agencies\/\$\{agencyId\}\/plans\/\$\{planId\}/.test(billingSrc));
check("the activation handler reads planId out of metadata",
  /session\.metadata\?\.planId/.test(billingSrc));
const webhookSrc = readFileSync("src/lib/stripe/webhooks.ts", "utf8");
// amount_total may be recorded (founders commission) but must not branch.
const branchingOnAmount = /if\s*\([^)]*amount_(total|subtotal)\s*[=!<>]/.test(webhookSrc);
check("no webhook branch is taken on the amount", !branchingOnAmount);

console.log("\n5. ASCEND grants entitlements from metadata.product, not price");
const biStripe = "/Users/boss/DivineX-Business-Intelligence/artifacts/api-server/src/lib/stripe.ts";
let biSrc = "";
try { biSrc = readFileSync(biStripe, "utf8"); } catch { /* repo may be absent */ }
if (biSrc) {
  check("ASCEND resolves the product from session metadata",
    /const product = session\.metadata\?\.product as ProductKey/.test(biSrc));
  check("ASCEND's growth_system bundle grants growth_operations",
    /product === "growth_system"[\s\S]{0,400}grantEntitlement\(clerkUserId, "growth_operations"/.test(biSrc));
  const grantOnAmount = /grantEntitlement\([^)]*amount_total/.test(biSrc);
  check("no ASCEND entitlement is granted off the amount", !grantOnAmount);
} else {
  console.log("  skip ASCEND source not present on this machine");
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
