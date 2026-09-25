/**
 * apply_workflow_plan, propose -> confirm -> execute.
 *
 * This capability could never succeed. Two independent faults, either of
 * which was enough on its own:
 *
 *  1. validate() read snake_case and returned camelCase. The chat route puts
 *     validate's OUTPUT in the proposal and the confirm route re-validates
 *     that same object on purpose, because the client's payload is never
 *     trusted. So the second pass saw no campaign_name, failed, and the
 *     customer was told "That request is missing something I need" for a
 *     proposal that was perfectly valid.
 *  2. execute() built its plan with businessProfileId: 0, which is falsy, so
 *     validateCampaignPlan rejected it as missing. The workflow-only path
 *     never reads that id at all.
 *
 * The whole chain runs here for real. Only the Firestore write is stubbed
 * (scripts/stub-workflows-service.ts), so the second validate, summarize,
 * the plan construction, the campaign-plan validator and the node compiler
 * are all the production code.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.e2e.json scripts/verify-apply-workflow-plan.mts
 */
import fs from "node:fs";
import { AI_SUITE_CAPABILITIES } from "../src/lib/ai-suite/capabilities";
import { validateCampaignPlan, type CampaignPlan } from "../src/lib/divinex/campaign";
import { followUpName } from "../src/lib/divinex/apply-workflow-plan";
import { isGoalGate, goalGateTag, parseTree, type BuilderStep } from "../src/lib/workflows/builder-tree";
import { RECORDED, resetRecorded } from "./stub-workflows-service";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`);
  if (!ok) fails++;
};

const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "apply_workflow_plan");
if (!cap) {
  console.log("FAIL  apply_workflow_plan is not in the registry");
  process.exit(1);
}

/** Exactly the shape the model emits: snake_case, per the JSON schema. */
const MODEL_ARGS = {
  campaign_name: "Spring intake follow-up",
  form_id: "form_abc123",
  goal_tag: "Booked",
  goal_state: "booked the consultation",
  handoff_days: 5,
  objective: "appointments",
  messages: [
    { delay_hours: 0, subject: "You're in", body: "Thanks for signing up.", purpose: "confirm", comm_type: "transactional", origin: "supplied" },
    { delay_hours: 48, subject: "One thing to try", body: "Here is the first step.", purpose: "nurture", comm_type: "nurture" },
    { delay_hours: 120, subject: "Ready to talk?", body: "Book a time that suits you.", purpose: "ask", comm_type: "sales_followup" },
    { delay_hours: 144, subject: "Call this lead today", body: "{{contact.firstName}} has not booked. Ring them.", purpose: "internal alert", comm_type: "operational", audience: "internal" },
  ],
  segmentation: [
    { field: "budget", operator: "equals", value: "under-5k", tag: "self-serve", label: "Self serve" },
  ],
  form_fields: [
    { name: "budget", label: "Budget", type: "select", required: true },
  ],
};

console.log("-- 1. propose: the chat route validates the model's args --");
const first = cap.validate(MODEL_ARGS);
ck("model args validate", first.ok, first.ok ? "" : String((first as { error: string }).error));
if (!first.ok) process.exit(1);
const proposalArgs = first.args;
ck("proposal carries the campaign name", proposalArgs.campaignName === "Spring intake follow-up");
ck("goal tag is slugified", proposalArgs.goalTag === "booked");
ck("all four messages survive", (proposalArgs.messages as unknown[]).length === 4);
ck("handoff days read", proposalArgs.handoffDays === 5);
ck("form id read", proposalArgs.formId === "form_abc123");
ck("summarize works on the proposal", cap.summarize(proposalArgs).includes("Spring intake follow-up"));

console.log("\n-- 2. confirm: the SAME object is re-validated server-side --");
// This is the bug. The confirm route does exactly this, deliberately.
const second = cap.validate(proposalArgs);
ck("re-validating validate's own output succeeds", second.ok,
  second.ok ? "" : String((second as { error: string }).error));
if (!second.ok) process.exit(1);
ck("nothing is lost on the second pass",
  second.args.campaignName === proposalArgs.campaignName &&
  second.args.goalTag === proposalArgs.goalTag &&
  second.args.formId === proposalArgs.formId &&
  second.args.handoffDays === proposalArgs.handoffDays &&
  (second.args.messages as unknown[]).length === (proposalArgs.messages as unknown[]).length);
const third = cap.validate(second.args);
ck("and a third pass, so it is stable rather than merely tolerant", third.ok);

console.log("\n-- 3. the plan execute builds must pass the campaign validator --");
{
  // The plan exactly as execute assembles it, including the field that was 0.
  const plan = {
    planVersion: 1,
    status: "approved",
    intent: { businessProfileId: null, subAccountId: "sa_test", objective: "appointments" },
    funnelStrategy: {},
    formRequirements: { fields: second.args.formFields },
    segmentationRules: second.args.segmentation,
    followUpStrategy: {
      goalTag: second.args.goalTag,
      goalState: second.args.goalState,
      handoffDays: second.args.handoffDays,
      messages: second.args.messages,
    },
    crmRequirements: {},
    assetSelections: [],
    brandProfileVersion: null,
  } as unknown as CampaignPlan;

  const strict = validateCampaignPlan(plan);
  ck("a workflow-only plan is still rejected when a profile IS required",
    !strict.ok && strict.errors.some((e) => e.includes("businessProfileId")));

  const relaxed = validateCampaignPlan(plan, { requireBusinessProfile: false });
  ck("and accepted on the workflow-only path", relaxed.ok,
    relaxed.ok ? "" : relaxed.errors.join("; "));

  // The opt-out must be narrow: every other rule still has to bite.
  const broken = JSON.parse(JSON.stringify(plan)) as CampaignPlan;
  broken.followUpStrategy.messages[1].subject = "";
  const stillChecked = validateCampaignPlan(broken, { requireBusinessProfile: false });
  ck("opting out does not disable the other checks",
    !stillChecked.ok && stillChecked.errors.some((e) => e.includes("missing subject")));
}

{
  // The opt-out above means a fabricated id no longer BREAKS anything, so
  // nothing behavioural pins it any more. It is still wrong to invent one:
  // 0 is a real profile id shape that happens to be falsy, and the next
  // reader of this plan has no way to tell it apart from a genuine value.
  // Mutation-testing found this gap, which is what mutation testing is for.
  const src = fs.readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");
  const intent = src.slice(src.indexOf("const plan: import(\"@/lib/divinex/campaign\").CampaignPlan"));
  const block = intent.slice(0, intent.indexOf("funnelStrategy"));
  ck("execute states there is no business profile rather than inventing one",
    /businessProfileId:\s*null/.test(block) && !/businessProfileId:\s*0\b/.test(block));
}

console.log("\n-- 4. execute: the real capability, with only the write stubbed --");
{
  resetRecorded();
  const ctx = {
    uid: "uid_test",
    email: "operator@example.com",
    displayName: "Operator",
    agencyId: "ag_test",
    subAccountId: "sa_test",
  };
  let result: { resultText?: string; ref?: { kind: string; id: string } } | null = null;
  let threw = "";
  try {
    result = await cap.execute(ctx as never, second.args);
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }
  ck("execute completes", threw === "", threw);
  ck("a draft workflow was created", RECORDED.some((r) => r.kind === "create"));
  ck("it was named after the campaign",
    RECORDED.some((r) => r.kind === "create" && (r.name ?? "").startsWith("Spring intake follow-up")),
    RECORDED.find((r) => r.kind === "create")?.name ?? "");
  ck("the name does not read as two separate names",
    !/\.\s+Follow-up/.test(RECORDED.find((r) => r.kind === "create")?.name ?? ""),
    RECORDED.find((r) => r.kind === "create")?.name ?? "");
  const update = RECORDED.find((r) => r.kind === "update");
  ck("the compiled nodes were written", Object.keys(update?.nodes ?? {}).length > 0,
    `${Object.keys(update?.nodes ?? {}).length} nodes`);
  if (update?.nodes) {
    // nodes is a Record keyed by node id, not an array.
    const nodes = Object.values(update.nodes) as { type?: string; config?: Record<string, unknown> }[];
    const emails = nodes.filter((n) => n.type === "send_email");
    ck("each LEAD message became a real email step", emails.length === 3, `got ${emails.length}`);
    const subjects = emails.map((e) => String(e.config?.subject ?? ""));
    ck("the customer's exact subjects are installed",
      ["You're in", "One thing to try", "Ready to talk?"].every((s) => subjects.includes(s)),
      subjects.join(" | "));
    ck("the sequence waits between messages", nodes.some((n) => n.type === "wait"));
  }
  ck("the reply says it is a draft, because nothing may send until a human publishes",
    /draft/i.test(result?.resultText ?? ""), (result?.resultText ?? "").split("\n")[0]);
  ck("it hands back a reference to the workflow it built",
    result?.ref?.kind === "workflow" && !!result?.ref?.id, JSON.stringify(result?.ref ?? null));

  console.log("\n-- 5. an internal alert is not an email to the lead --");
  if (update?.nodes) {
    const all = Object.values(update.nodes) as { type?: string; config?: Record<string, unknown> }[];
    const mails = all.filter((n) => n.type === "send_email");
    const internal = all
      .filter((n) => n.type === "notify")
      .find((n) => String(n.config?.subject ?? "") === "Call this lead today");
    ck("the owner-directed message compiled to a notify step", !!internal);
    ck("it is addressed to the owner", internal?.config?.recipient === "owner");
    ck("and NOT to the lead as an email",
      !mails.some((e) => String(e.config?.subject ?? "") === "Call this lead today"));
    // An unsubscribe link on internal copy lets a colleague opt the CONTACT
    // out by clicking it.
    ck("internal copy carries no unsubscribe link",
      !/unsubscribe/i.test(String(internal?.config?.body ?? "")),
      String(internal?.config?.body ?? "").slice(0, 50));
    ck("lead emails still carry theirs",
      mails.every((e) => /unsubscribe/i.test(String(e.config?.body ?? ""))));
  }

  console.log("\n-- 6. the built workflow reads as ONE column, not a staircase --");
  if (update?.nodes) {
    const tree = parseTree(update.nodes, (update.patch?.startNodeId as string) ?? null);
    const gates: BuilderStep[] = [];
    // Count only REAL forks. Every goal-gate used to nest the rest of the
    // sequence one level deeper, and the canvas halved the column width at
    // each level until the cards overlapped.
    const walk = (list: BuilderStep[], forks: number): number => {
      let deepest = forks;
      for (const st of list) {
        if (st.type !== "if_else") continue;
        const gate = isGoalGate(st);
        if (gate) gates.push(st);
        const next = forks + (gate ? 0 : 1);
        deepest = Math.max(deepest, walk(st.whenTrue ?? [], next), walk(st.whenFalse ?? [], next));
      }
      return deepest;
    };
    const forkDepth = walk(tree, 0);
    ck("the goal-gates are recognised as exits", gates.length >= 3, `${gates.length} gates`);
    ck("every gate knows which tag stops the run",
      gates.length > 0 && gates.every((g) => goalGateTag(g) === "booked"),
      gates.map(goalGateTag).join(","));
    const realBranches = (MODEL_ARGS.segmentation ?? []).length;
    ck("fork depth tracks real branches, not the number of gates",
      forkDepth === realBranches,
      `${gates.length} gates + ${realBranches} segmentation rule(s) -> depth ${forkDepth}`);
    ck("the gates outnumber the forks, which is the whole point",
      gates.length > forkDepth, `${gates.length} gates vs ${forkDepth} fork(s)`);
  }
}

console.log("\n-- 7. the canvas stops dividing itself --");
{
  const ui = fs.readFileSync("src/components/workflows/workflow-builder.tsx", "utf8");
  // grid-cols-2 split the AVAILABLE width at every level, so each nested
  // branch got half of an already-halved column. Depth 3 was unreadable and
  // depth 4 overlapped.
  ck("branch columns no longer divide the available width",
    !/grid\s+grid-cols-2/.test(ui));
  ck("a branch column holds a fixed, readable width", /w-72 shrink-0/.test(ui));
  ck("the canvas scrolls instead of compressing", /overflow-x-auto/.test(ui));
  ck("a goal-gate renders as one line, not a split",
    /isGoalGate\(s\) && \(/.test(ui) && /<GoalGateLine/.test(ui));
  ck("the gate's continuation stays in the SAME column",
    /<GoalGateLine[\s\S]{0,400}?<Chain/.test(ui));
  ck("a real fork still splits", /s\.type === "if_else" && !isGoalGate\(s\)/.test(ui));
}

console.log("\n-- 8. the workflow name does not repeat itself --");
ck("a plain name gets the suffix", followUpName("Spring intake") === "Spring intake: Follow-up");
ck("a name already ending in follow-up does not get a second one",
  followUpName("Spring intake follow-up") === "Spring intake follow-up",
  followUpName("Spring intake follow-up"));
ck("case and spacing variants count as the same word",
  followUpName("Spring Follow-Up") === "Spring Follow-Up" &&
  followUpName("Spring follow up") === "Spring follow up");
ck("trailing punctuation does not produce a double separator",
  followUpName("Q1 launch:") === "Q1 launch: Follow-up", followUpName("Q1 launch:"));

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
