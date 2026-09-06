/**
 * CAMPAIGN PERSISTENCE — the durable shared memory.
 *
 * The gap this closes: CampaignPlan was built in memory, used once and
 * discarded, so downstream assets had no approved context to inherit and each
 * generator re-decided the offer, audience and CTA independently.
 *
 * Certifies the properties that make it safe: tenancy, that an invalid plan
 * cannot be stored, that a changed CTA marks BUILT steps stale rather than
 * silently rewriting them, and that absence of a campaign is a normal state.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n")){const i=l.indexOf("=");if(i>0&&!l.startsWith("#"))process.env[l.slice(0,i).trim()]??=l.slice(i+1).trim().replace(/^["']|["']$/g,"");}
const SA=process.env.EDIT_SA??"gXQ6oH73xtvv7LsV1sQT", OTHER="dx-loop-test";
const OWNER="irkY5HKIzxb64l5qCyHroTrudJa2";
const svc = await import("../src/lib/server/campaigns-service.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db=getAdminDb(); let bad=0;
const check=(l:string,ok:boolean,n="")=>{console.log(`${ok?"PASS":"FAIL"} ${l}${n?` — ${n}`:""}`);if(!ok)bad++;};

const basePlan = {
  planVersion: 1 as const, status: "approved" as const,
  intent: { businessProfileId: 42, subAccountId: SA, objective: "appointments" as const,
            audience: "School activity coordinators", offerState: "use_existing" as const },
  funnelStrategy: {}, formRequirements: { fields: [] }, segmentationRules: [],
  followUpStrategy: { goalTag: "booked", goalState: "booked", handoffDays: 14, messages: [] },
  crmRequirements: {}, assetSelections: [], brandProfileVersion: null,
  approved: { centralPromise: "A book-ready assembly", primaryCta: "Request a date", audience: "School coordinators" },
  steps: [
    { id:"offer", label:"Offer", status:"approved" as const },
    { id:"page",  label:"Landing page", status:"connected" as const, assetKind:"funnel" as const, assetId:"f_123" },
    { id:"email", label:"Email series", status:"planned" as const },
  ],
  distribution: { social: { postCount: 6 } },
};

const id = await svc.createCampaign({ subAccountId: SA, createdByUid: OWNER, name: "CP probe campaign", plan: basePlan });
check("a campaign persists", !!id, id);

const back = await svc.getCampaign(SA, id);
check("it reads back with its plan", back?.plan.approved?.primaryCta === "Request a date");
check("campaignId is stamped onto the plan", back?.plan.campaignId === id);
check("approval snapshot recorded for change detection", back?.plan.changeAwareness?.ctaAtApproval === "Request a date");
check("offer state is preserved", back?.plan.intent.offerState === "use_existing");
check("social is distribution, NOT follow-up",
  (back?.plan.distribution?.social?.postCount ?? 0) === 6 && (back?.plan.followUpStrategy.messages.length ?? 0) === 0);

// TENANCY — a foreign workspace must not reach it.
check("another workspace cannot read it", (await svc.getCampaign(OTHER, id)) === null);
check("another workspace cannot update a step",
  (await svc.updateCampaignStep({ subAccountId: OTHER, campaignId: id, stepId: "offer", status: "skipped" })) === null);

// STEP UPDATES
const stepped = await svc.updateCampaignStep({ subAccountId: SA, campaignId: id, stepId: "email",
  status: "connected", assetKind: "message_template", assetId: "tpl_1", changeRequest: "Make them shorter" });
const email = stepped?.plan.steps?.find(s=>s.id==="email");
check("a step links a real asset by reference", email?.assetId === "tpl_1" && email?.assetKind === "message_template");
check("change requests are kept verbatim", email?.changeRequests?.[0] === "Make them shorter");

// CHANGE AWARENESS — the property that protects approved work.
const changed = await svc.updateCampaignDecisions({ subAccountId: SA, campaignId: id,
  approved: { primaryCta: "Book a date" } });
const stale = changed?.staleSteps.map(s=>s.id) ?? [];
check("changing the CTA identifies BUILT steps as stale", stale.includes("page") && stale.includes("email"),
  `stale: ${stale.join(", ")}`);
check("steps with nothing built are not marked stale", !stale.includes("offer"));
const afterChange = await svc.getCampaign(SA, id);
check("stale steps are flagged, NOT rewritten",
  afterChange?.plan.steps?.find(s=>s.id==="page")?.status === "needs_update" &&
  afterChange?.plan.steps?.find(s=>s.id==="page")?.assetId === "f_123",
  "asset reference intact");
check("the new decision is recorded", afterChange?.plan.approved?.primaryCta === "Book a date");

// CONTEXT FOR DOWNSTREAM GENERATORS
const ctx = await svc.campaignContextFor(SA, id);
check("downstream context exposes the approved decisions", ctx?.approved.primaryCta === "Book a date");
check("no campaign is a normal state, not an error", (await svc.campaignContextFor(SA, null)) === null);

// An invalid plan must not be storable.
let refused = false;
try { await svc.createCampaign({ subAccountId: SA, createdByUid: OWNER, name: "bad",
  plan: { ...basePlan, intent: { ...basePlan.intent, businessProfileId: 0, objective: undefined } } as never }); }
catch { refused = true; }
check("an invalid plan is refused", refused);

await db.doc(`campaigns/${id}`).delete();
console.log(`\n${bad===0?"CAMPAIGN PERSISTENCE: PASS":`CAMPAIGN PERSISTENCE: ${bad} FAILURE(S)`}`);
process.exit(bad?1:0);
