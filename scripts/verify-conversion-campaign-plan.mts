// Regression coverage for the Build-Campaign Orchestrator's Campaign Plan
// (Conversion Engine, P1 — Milestone 6a). Pure + deterministic. Verifies the
// plan is coherent per objective and references only REAL platform primitives
// (valid workflow node types + triggers, real framework ids, canonical
// pipeline stages), and stays message-matched to the strategy.
//
// Run: npx tsx scripts/verify-conversion-campaign-plan.mts

const { buildCampaignPlan } = await import("../src/lib/conversion/campaign-plan");
const { buildCampaignStrategy } = await import("../src/lib/conversion/strategy-builder");
const { allFrameworkIds } = await import("../src/lib/conversion/framework-library");

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// The real, addable workflow node types (mirrors lib/workflows/catalog.ts
// ADDABLE_TYPES) — the plan must never reference a node the builder lacks.
const VALID_NODES = new Set(["send_email", "send_sms", "whatsapp_template", "wait", "add_tag", "remove_tag", "move_stage", "update_field", "create_task", "create_deal", "notify", "webhook", "if_else", "goal"]);
const VALID_TRIGGERS = new Set(["form.submitted", "contact.created", "contact.tag.added", "pipeline.stage.changed", "booking.created", "quote.accepted", "quote.paid"]);
const FRAMEWORK_IDS = new Set(allFrameworkIds());

// --- 1. Lead-generation campaign ---
{
  const strategy = buildCampaignStrategy({ context: { objective: "lead_generation" }, offer: { productOrService: "Free roofing lead audit" } });
  const plan = buildCampaignPlan(strategy);
  check("1a. genre is lead_gen", plan.landingPage.genre === "lead_gen");
  check("1b. section sequence is non-empty and starts with a hero", plan.landingPage.sectionSequence[0] === "hero" && plan.landingPage.sectionSequence.length > 1);
  check("1c. form captures name + email", plan.form.fields.includes("name") && plan.form.fields.includes("email"));
  check("1d. trigger is form.submitted", plan.workflow.trigger === "form.submitted");
  check("1e. email sequence uses the post-conversion framework + has a stop condition", plan.emailSequence.frameworkId === "post-conversion-sequence-design" && /stop/i.test(plan.emailSequence.stopCondition));
  check("1f. >=3 emails, each with a distinct purpose", plan.emailSequence.emails.length >= 3 && new Set(plan.emailSequence.emails.map((e) => e.purpose)).size === plan.emailSequence.emails.length);
  check("1g. CRM stages include New + Contacted", plan.crm.pipelineStages.includes("New") && plan.crm.pipelineStages.includes("Contacted"));
  check("1h. tracking preserves UTM + click ids", ["utm_source", "gclid", "fbclid", "referrer"].every((p) => plan.tracking.preserveParams.includes(p)));
}

// --- 2. Every workflow node + trigger + framework id is REAL ---
{
  const objectives = ["lead_generation", "appointment", "application", "free_trial", "purchase", "webinar_registration", "audit_request"] as const;
  let allNodesValid = true, allTriggersValid = true, allFrameworksValid = true, hasGoal = true, hasEmailNode = true;
  for (const objective of objectives) {
    const priced = objective === "purchase";
    const plan = buildCampaignPlan(buildCampaignStrategy({ context: { objective }, offer: priced ? { priceCents: 4700 } : {} }));
    for (const n of plan.workflow.nodes) if (!VALID_NODES.has(n.type)) allNodesValid = false;
    if (!VALID_TRIGGERS.has(plan.workflow.trigger)) allTriggersValid = false;
    for (const id of plan.landingPage.frameworkStack) if (!FRAMEWORK_IDS.has(id)) allFrameworksValid = false;
    if (!plan.workflow.nodes.some((n) => n.type === "goal")) hasGoal = false;
    if (!plan.workflow.nodes.some((n) => n.type === "send_email")) hasEmailNode = false;
  }
  check("2a. Every planned workflow node is a real addable node type", allNodesValid);
  check("2b. Every planned trigger is a real workflow trigger", allTriggersValid);
  check("2c. Every framework in the landing-page stack exists in the library", allFrameworksValid);
  check("2d. Every workflow ends with a goal (convert-and-stop)", hasGoal);
  check("2e. Every workflow sends at least one email", hasEmailNode);
}

// --- 3. Appointment campaign specifics ---
{
  const plan = buildCampaignPlan(buildCampaignStrategy({ context: { objective: "appointment" } }));
  check("3a. form captures a phone number", plan.form.fields.includes("phone"));
  check("3b. trigger is booking.created", plan.workflow.trigger === "booking.created");
  check("3c. tracking includes booking_completed", plan.tracking.events.includes("booking_completed"));
  check("3d. CRM reaches Qualified", plan.crm.pipelineStages.includes("Qualified"));
  check("3e. email archetype is appointment-oriented", /appointment/i.test(plan.emailSequence.archetype));
}

// --- 4. Priced purchase campaign ---
{
  const plan = buildCampaignPlan(buildCampaignStrategy({ context: { objective: "purchase" }, offer: { priceCents: 9700 } }));
  check("4a. genre is tripwire (priced sales page)", plan.landingPage.genre === "tripwire");
  check("4b. sequence includes an offer + guarantee section", plan.landingPage.sectionSequence.includes("offer") && plan.landingPage.sectionSequence.includes("guarantee"));
  check("4c. tracking includes purchase_completed + checkout_started", plan.tracking.events.includes("purchase_completed") && plan.tracking.events.includes("checkout_started"));
  check("4d. CRM reaches Won", plan.crm.pipelineStages.includes("Won"));
}

// --- 5. Free trial campaign ---
{
  const plan = buildCampaignPlan(buildCampaignStrategy({ context: { objective: "free_trial" } }));
  check("5a. tracking includes trial_started", plan.tracking.events.includes("trial_started"));
  check("5b. trial onboarding sequence is longer (activation-paced)", plan.emailSequence.emails.length >= 4);
}

// --- 6. Message match + unknowns carried from the strategy ---
{
  const strategy = buildCampaignStrategy({ context: { objective: "lead_generation" } });
  const plan = buildCampaignPlan(strategy);
  check("6a. unknowns are carried from the strategy", plan.unknowns.length === strategy.unknowns.length && plan.unknowns.length > 0);
  check("6b. message-match notes a null promise still needs one shared promise", plan.messageMatch.centralPromise === null && /one/i.test(plan.messageMatch.note));
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
