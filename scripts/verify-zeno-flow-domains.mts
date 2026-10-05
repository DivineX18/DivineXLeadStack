/**
 * The universal Zeno to Flow layer, checked without spending a model call.
 *
 * These are the invariants that cannot be seen by reading one file: the
 * registry promising a tool that does not exist, a traversal following a
 * field the engine does not use, a positional insert that silently appends,
 * and the tenancy boundary that every one of them sits behind.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-zeno-flow-domains.mts
 */
import { readFileSync } from "node:fs";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d && !ok ? ` - ${d}` : ""}`);
  if (!ok) fails++;
};

const caps = readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");
const dom = readFileSync("src/lib/ai-suite/flow-domains.ts", "utf8");
const ctx = readFileSync("src/lib/ai-suite/page-context.ts", "utf8");
const forms = readFileSync("src/lib/server/forms-service.ts", "utf8");
const wfs = readFileSync("src/lib/server/workflows-service.ts", "utf8");
const launcher = readFileSync("src/components/ai-suite/zeno-launcher.tsx", "utf8");

console.log("-- the registry cannot promise a tool that does not exist --");
{
  const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
  const known = new Set(AI_SUITE_CAPABILITIES.map((c) => c.name));
  // Every value in an `operations` block is a tool name Zeno is told it can
  // call. A stale one makes Zeno promise a change it cannot make.
  // Scan EVERY operations block, inline or multi-line. An earlier version of
  // this check only matched the multi-line form and so missed a registry
  // entry naming a tool that had never existed.
  const named = [...dom.matchAll(/operations: \{([\s\S]*?)\}/g)]
    .flatMap((m) => [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]));
  ck("the registry names at least one tool per domain", named.length >= 7, String(named.length));
  for (const n of [...new Set(named)]) ck(`  ${n} is a real capability`, known.has(n));
}

console.log("\n-- every domain is reachable, and only within its workspace --");
{
  const { FLOW_ASSET_KINDS } = await import("../src/lib/ai-suite/flow-domains");
  ck("the registry covers the shipped domains",
    ["funnel", "form", "workflow", "booking_page", "campaign", "website", "email_template"]
      .every((k) => (FLOW_ASSET_KINDS as readonly string[]).includes(k)));
  ck("every load proves ownership before returning",
    // getFunnel/getForm/getWorkflow/getCampaign all take subAccountId; the two
    // raw-document domains must check it themselves.
    /data\.subAccountId !== sa/.test(dom) || /subAccountId !== sa/.test(dom),
    "a raw-document domain reads a doc without comparing its subAccountId");
  ck("a foreign asset and a missing one are the same answer (null)",
    /if \(!doc\) return null;/.test(dom) && /catch \{[\s\S]{0,120}return null;/.test(dom));
  ck("the id is shape-checked before any read", /\^\[A-Za-z0-9_-\]\{1,64\}\$\/\.test\(id\)/.test(dom));
}

console.log("\n-- the journey walk is bounded and honest --");
{
  ck("it is hard-capped on breadth", /maxNodes = opts\.maxNodes \?\? \d+/.test(dom));
  ck("and on depth", /maxDepth = opts\.maxDepth \?\? \d+/.test(dom));
  ck("a visited asset is never walked twice", /seen\.has\(key\)/.test(dom));
  ck("a link to something deleted is REPORTED, not swallowed",
    /unreachable\.push/.test(dom) && /BROKEN LINK/.test(dom));
  ck("the trace follows the link field the engine actually runs on",
    /id = node\.next \?\? null;/.test(dom), "traversal must use `next`, not an invented field");
  ck("it does not follow `nextNodeId`, which no workflow carries", !/nextNodeId/.test(dom));
}

console.log("\n-- context resolution reaches every asset the UI can open --");
{
  // Each row of the launcher's PATTERNS table, checked by what it contains
  // rather than by re-deriving its escaping.
  const rows = launcher.split("\n").filter((l) => l.trimStart().startsWith("[/"));
  for (const [needle, kind] of [
    ["create", "funnel"], ["campaigns", "funnel"], ["forms", "form"],
    ["workflows", "workflow"], ["booking", "booking_page"], ["templates", "email_template"],
  ] as [string, string][]) {
    ck(`  a ${needle} route resolves as ${kind}`,
      rows.some((l) => l.includes(needle) && l.includes(`"${kind}"`)),
      "no PATTERNS row maps this route");
  }
  ck("the create screen is not mistaken for an asset", /m\[1\] !== "new"/.test(launcher));
  ck("an unknown kind still resolves to nothing", /if \(!isFlowAssetKind\(kind\)\) return null;/.test(ctx));
  ck("non-funnel assets are read through the ownership-proving registry",
    /readFlowAsset\(subAccountId, ref\.kind as FlowAssetKind, ref\.id\)/.test(ctx));
  ck("the card tells the model not to ask what it has already read",
    /Do not ask the customer what it says or what it is set to/.test(ctx));
}

console.log("\n-- a positional insert actually lands in position --");
{
  ck("the form patch accepts an anchor", /afterFieldId\?: string;/.test(forms));
  ck("an unknown anchor is refused, never silently appended",
    /if \(opts\.addField\.afterFieldId && at === -1\) return \{ ok: false, reason: "no_field" \};/.test(forms));
  ck("the new question is spliced after it", /fields\.splice\(at \+ 1, 0, field\)/.test(forms));
  ck("a reorder that omits a question keeps it rather than dropping it",
    /const rest = fields\.filter\(\(f\) => !named\.some/.test(forms));
  ck("the capability passes the anchor through", /afterFieldId: add\.afterQuestionId/.test(caps));
}

console.log("\n-- a workflow step edit changes one step, not the sequence --");
{
  ck("the targeted patch exists", /export async function patchWorkflowStepsServerSide/.test(wfs));
  ck("a workflow from another workspace reads as missing",
    /snap\.data\(\)!\.subAccountId !== opts\.subAccountId[\s\S]{0,120}reason: "missing"/.test(wfs));
  ck("removing a step closes the gap instead of stranding the rest",
    /if \(n\.next === id\) nodes\[k\] = \{ \.\.\.n, next: follower \};/.test(wfs));
  ck("removing the first step promotes its follower",
    /if \(startNodeId === id\) startNodeId = follower;/.test(wfs));
  ck("inserting into a branch is refused rather than guessed",
    /reason: "branch"/.test(wfs) && /branchy\(after\)/.test(wfs));
  ck("the status is never written by a step edit",
    !/update\(\{[^}]*status:/.test(wfs.slice(wfs.indexOf("patchWorkflowStepsServerSide"))));
  ck("a new email cannot ship without an unsubscribe link",
    /body\.includes\("\{\{unsubscribeLink\}\}"\)/.test(caps));
}

console.log("\n-- the structural funnel edit respects the page's own rules --");
{
  const blk = caps.slice(caps.indexOf('name: "edit_funnel_structure"'), caps.indexOf('name: "revise_workflow_email"'));
  ck("the empty-section law is enforced on every write", /enforceCompleteness: true/.test(blk));
  ck("a refusal from that law reaches the customer in their own words",
    /err instanceof FunnelValidationError\) throw new CapabilityUserError\(err\.message\)/.test(blk));
  ck("it never writes a status, so a draft stays a draft and a live page stays live",
    !/status:/.test(blk.slice(blk.indexOf("patch: {"), blk.indexOf("enforceCompleteness"))));
  ck("a CTA banner cannot be added pointing at nothing", /Ask the customer where the button should send people/.test(blk));
  ck("quotes and numbers must come from the customer",
    /Ask the customer for them rather than writing them yourself/.test(blk));
  ck("a media placeholder is a brief, never a generated image",
    /add_media_placeholder does not produce an image/.test(blk));
  ck("the placeholder is recorded where the editor already shows outstanding media",
    /visualRequirements/.test(blk));
  ck("asking twice re-briefs the slot instead of stacking duplicates",
    /r\.id !== slotId \|\| !!r\.resolvedWith/.test(blk));
  ck("validate output keys carry the snake alias validate reads back",
    // confirm re-validates its own normalized args; an output key whose snake
    // alias differs from the key it reads is silently dropped on that pass.
    !/\bafterId\b/.test(blk) && /afterSectionId/.test(blk));
}

console.log("\n-- the connections a form has are found exactly, not sampled --");
{
  ck("the automation lookup is an exact query, not a window over the workspace",
    /where\("trigger\.formId", "==", formId\)/.test(dom),
    "reading the first N workflows and filtering in memory misses the right one in a busy workspace");
  ck("it does not read an arbitrary slice of the workflow collection",
    !/collection\("workflows"\)[\s\S]{0,160}\.limit\(/.test(dom));
  ck("a trigger that fires for every form still counts as connected",
    /where\("trigger\.type", "==", "form\.submitted"\)/.test(dom));
  ck("both queries are scoped to the workspace",
    (dom.match(/where\("subAccountId", "==", subAccountId\)/g) ?? []).length >= 2);
  ck("a form carries its automations on every read, not only inside a trace",
    /relatedAsync: \(doc, sa\) => workflowsForForm\(sa, doc\.id\)/.test(dom));
  ck("emails are numbered as EMAILS, so \u201cemail 2\u201d means the same thing to the edit tool",
    /Email \$\{emailOrdinal\}/.test(dom));
}

console.log("\n-- validate must survive being fed its own output --");
{
  // THE BUG THIS EXISTS FOR. The confirm route re-validates the args the
  // proposal already produced. So a validate that READS `operation` but
  // WRITES `op` passes the first time and refuses the second, and the
  // customer sees "that request is missing something I need" on every
  // confirm. Found live, in edit_workflow_steps. Cheap to assert, invisible
  // to read for.
  const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
  const cases: [string, Record<string, unknown>][] = [
    ["edit_workflow_steps", { workflow_id: "w1", operation: "set_wait", step_id: "s1", days: 1 }],
    ["edit_workflow_steps", { workflow_id: "w1", operation: "insert_email", after_step_id: "s1", subject: "Hi", body: "Body" }],
    ["edit_workflow_steps", { workflow_id: "w1", operation: "remove_step", step_id: "s1" }],
    ["edit_funnel_structure", { funnel_id: "f1", operation: "add_media_placeholder", section_id: "hero", brief: "A real photo of the clinic team at work, natural light." }],
    ["edit_funnel_structure", { funnel_id: "f1", operation: "add_section", section_type: "faq", items: ["How long? | About an hour."], after_section_id: "hero" }],
    ["edit_funnel_structure", { funnel_id: "f1", operation: "move_section", section_id: "s2", after_section_id: "hero" }],
    ["revise_workflow_email", { workflow_id: "w1", email_number: 2, body: "New body {{unsubscribeLink}}" }],
    ["update_form", { form_id: "fm1", add_question: { label: "Company", type: "company", after_question_id: "f_email" } }],
    ["update_form", { form_id: "fm1", reorder_question_ids: ["a", "b"] }],
    ["inspect_asset", { kind: "workflow", id: "w1" }],
    ["trace_connected_system", { kind: "funnel", id: "f1" }],
  ];
  for (const [name, args] of cases) {
    const c = AI_SUITE_CAPABILITIES.find((x) => x.name === name);
    if (!c) { ck(`${name} exists`, false); continue; }
    const first = c.validate(args);
    if (!first.ok) { ck(`${name} accepts ${String(args.operation ?? "its args")}`, false, first.error); continue; }
    const second = c.validate(first.args);
    ck(`${name} (${String(args.operation ?? Object.keys(args)[1])}) re-validates its own output`,
      second.ok, second.ok ? "" : second.error);
    if (second.ok) {
      ck(`  and reaches the same args`, JSON.stringify(first.args) === JSON.stringify(second.args),
        `${JSON.stringify(first.args)} vs ${JSON.stringify(second.args)}`);
    }
  }
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILED`}`);
process.exit(fails ? 1 : 0);
