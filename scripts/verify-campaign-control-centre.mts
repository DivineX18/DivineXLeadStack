/**
 * CAMPAIGN PLAN CONTROL CENTRE (V1 requirement 15).
 *
 * The plan was already persisted, inherited and change-aware. It was
 * invisible: no way to see it, and no way to say yes to it. A plan nobody can
 * read is not a plan.
 *
 * What is certified is the DECISION contract, because that is where a mistake
 * would be expensive: approving must advance only the step decided on, asking
 * for changes must record the customer's own words without silently rewriting
 * approved work, dropping must not delete anything, and a change of mind about
 * the offer must flag what is now out of date rather than quietly rebuild it.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SA = process.env.EDIT_SA ?? "gXQ6oH73xtvv7LsV1sQT";
const OTHER = "dx-loop-test";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const svc = await import("../src/lib/server/campaigns-service.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const plan = {
  planVersion: 1 as const, status: "approved" as const,
  intent: { businessProfileId: 42, subAccountId: SA, objective: "appointments" as const,
            audience: "Homeowners", offerState: "use_existing" as const },
  funnelStrategy: {}, formRequirements: { fields: [] }, segmentationRules: [],
  followUpStrategy: { goalTag: "booked", goalState: "booked", handoffDays: 14, messages: [] },
  crmRequirements: {}, assetSelections: [], brandProfileVersion: null,
  approved: { centralPromise: "A written quote this week", primaryCta: "Request my quote", audience: "Homeowners" },
  steps: [
    { id: "page", label: "Landing page", status: "review" as const, assetKind: "funnel" as const, assetId: "f_1", rationale: "Where the ad traffic lands." },
    { id: "form", label: "Quote form", status: "review" as const, assetKind: "form" as const, assetId: "fm_1" },
    { id: "email", label: "Follow-up emails", status: "planned" as const },
  ],
  distribution: {},
};

const id = await svc.createCampaign({ subAccountId: SA, createdByUid: OWNER, name: "[E2E] control centre", plan });
check("a plan persists", !!id);

// -------------------------------------------------------------- approve
const approved = await svc.updateCampaignStep({ subAccountId: SA, campaignId: id, stepId: "page", status: "approved" });
check("approving advances that step", approved?.plan.steps?.find((s) => s.id === "page")?.status === "approved");
check("...and touches nothing else",
  approved?.plan.steps?.find((s) => s.id === "form")?.status === "review" &&
  approved?.plan.steps?.find((s) => s.id === "email")?.status === "planned");

// ------------------------------------------------------- request changes
const changed = await svc.updateCampaignStep({
  subAccountId: SA, campaignId: id, stepId: "form",
  status: "in_progress", changeRequest: "Ask for the suburb, not the full address.",
});
const formStep = changed?.plan.steps?.find((s) => s.id === "form");
check("asking for changes reopens the step", formStep?.status === "in_progress");
check("the customer's own words are kept verbatim",
  formStep?.changeRequests?.[0] === "Ask for the suburb, not the full address.");
check("the built asset is not thrown away while it is revised", formStep?.assetId === "fm_1");

const changedAgain = await svc.updateCampaignStep({
  subAccountId: SA, campaignId: id, stepId: "form", changeRequest: "Also drop the phone field.",
});
check("a second request is appended, not overwritten",
  changedAgain?.plan.steps?.find((s) => s.id === "form")?.changeRequests?.length === 2);

// ----------------------------------------------------------------- drop
const dropped = await svc.updateCampaignStep({ subAccountId: SA, campaignId: id, stepId: "email", status: "skipped" });
check("dropping a step marks it, never deletes it",
  dropped?.plan.steps?.length === 3 && dropped.plan.steps.find((s) => s.id === "email")?.status === "skipped");

// ------------------------------------------- changing the offer, mid-flight
const decision = await svc.updateCampaignDecisions({
  subAccountId: SA, campaignId: id,
  approved: { centralPromise: "A written quote this week", primaryCta: "Book my inspection", audience: "Homeowners" },
});
check("changing the call to action flags what is now out of date",
  decision?.staleSteps.some((s) => s.id === "page"), JSON.stringify(decision?.staleSteps.map((s) => s.id)));
check("...and NEVER rewrites the approved work itself",
  decision?.campaign.plan.steps?.find((s) => s.id === "page")?.assetId === "f_1" &&
  decision?.campaign.plan.steps?.find((s) => s.id === "page")?.status === "needs_update");
check("a planned step with nothing built is not marked stale",
  decision?.campaign.plan.steps?.find((s) => s.id === "email")?.status === "skipped");

// ------------------------------------------------------------- isolation
check("another workspace cannot read this plan", (await svc.getCampaign(OTHER, id)) === null);
check("another workspace cannot decide on its steps",
  (await svc.updateCampaignStep({ subAccountId: OTHER, campaignId: id, stepId: "page", status: "approved" })) === null);
const stillMine = await svc.getCampaign(SA, id);
check("...and the attempt changed nothing",
  stillMine?.plan.steps?.find((s) => s.id === "page")?.status === "needs_update");

// -------------------------------------------------------- customer words
// The panel's job is to be readable by someone who does not work here.
const panel = readFileSync(new URL("../src/components/divinex/campaign-plan-panel.tsx", import.meta.url), "utf8");
const shown = [...panel.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
check("no status enum reaches the customer",
  shown.every((l) => !/_/.test(l)) && shown.includes("Waiting on you"), shown.join(", "));
check("the three decisions read like decisions, not operations",
  panel.includes("Looks good") && panel.includes("Ask for changes") && panel.includes("Drop this"));
// Scanned over what actually REACHES THE SCREEN (JSX text nodes and
// placeholders), not the whole file: identifiers in the code above are how the
// component talks to the API, and are invisible to the customer.
const visible = [
  ...[...panel.matchAll(/>\s*([A-Za-z][^<>{}\n]{3,})\s*</g)].map((m) => m[1]),
  ...[...panel.matchAll(/placeholder="([^"]+)"/g)].map((m) => m[1]),
].join(" | ");
check("no developer language reaches the screen",
  !/\b(stepId|campaignId|assetKind|assetId|subAccountId|status enum|null|undefined)\b/.test(visible), visible.slice(0, 160));

await db.doc(`campaigns/${id}`).delete();
console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
