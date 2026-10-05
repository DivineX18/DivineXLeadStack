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
    /await ref\.update\(\{ nodes, startNodeId, updatedAt: FieldValue\.serverTimestamp\(\) \}\);/.test(wfs));
  ck("an email asked for \u201cone day after\u201d lays down the wait too, in one call",
    /opts\.op === "insert_email" && delay >= 60/.test(wfs),
    "one node per call silently dropped the customer's delay");
  ck("the wait goes BEFORE the email it delays",
    /chain\.push\(\{ id: newId\(\), type: "wait"/.test(wfs) && wfs.indexOf('type: "wait", config: { seconds: delay }') < wfs.indexOf('type: "send_email", config: { subject: opts.subject'));
  ck("an email with no delay is still allowed",
    /if \(Number\.isFinite\(seconds\) && seconds >= 60\) out\.seconds = seconds;/.test(caps));
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
    /add_media_placeholder is the other half/.test(blk) && /Never generate one and never send them to an external host/.test(blk));
  // The model is given a MENU of what it can do alongside the tool schemas,
  // and when the two disagreed it believed the menu: it told a customer
  // "the attach-media capability isn't available in this workspace" while
  // holding the tool that does it.
  ck("the menu label admits every operation the tool actually supports",
    /menuLabel: "Add, remove or move a section, put an uploaded image on one, or brief a photo"/.test(blk),
    "the capability menu must not contradict the operation enum");
  ck("attaching media uses a real uploaded asset, never a URL",
    /never a URL, never an invented id/.test(blk));
  ck("the asset is re-proved against the workspace before its url reaches a page",
    /getWorkspaceAsset\(subAccountId, args\.assetId as string\)/.test(blk));
  ck("a non-image is refused rather than written into a picture slot",
    /not an image, so it can't go in a picture slot/.test(blk));
  ck("a section with no picture slot is refused rather than silently saved",
    /has no picture slot/.test(blk));
  ck("a real upload counts as authentic evidence, a generated one never would",
    /provenance: "first_party_upload" as const/.test(blk) && /countsAsAuthenticEvidence: true/.test(blk));
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

console.log("\n-- what the schema offers, validate must accept --");
{
  // The schema is what the model is allowed to send; validate is what the
  // server will take. attach_media shipped in the enum and not in validate's
  // own list, so the model could see the operation, send it, and be told it
  // did not exist, in a message that read like a product limitation.
  const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
  const BASE: Record<string, Record<string, unknown>> = {
    edit_funnel_structure: { operation: "add_section", funnel_id: "f1", section_id: "hero", after_section_id: "hero", asset_id: "a1", brief: "A real photo of the team on site, natural light.", headline: "H", body: "B", items: ["A | B"], section_type: "faq", cta_label: "Go", cta_href: "/x", solution_headline: "S", solution_body: "SB" },
    edit_workflow_steps: { operation: "insert_email", workflow_id: "w1", step_id: "s1", after_step_id: "s1", days: 1, subject: "S", body: "B" },
    edit_workflow_logic: { operation: "set_trigger", workflow_id: "w1", step_id: "b1", trigger_type: "form.submitted", conditions: [{ field: "tags", op: "has_tag", value: "x" }] },
    inspect_asset: { kind: "funnel", id: "x1" },
    trace_connected_system: { kind: "funnel", id: "x1" },
  };
  for (const [name, base] of Object.entries(BASE)) {
    const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === name);
    if (!cap) { ck(`${name} exists`, false); continue; }
    const props = (cap.parameters as { properties?: Record<string, { enum?: string[] }> }).properties ?? {};
    for (const [field, spec] of Object.entries(props)) {
      if (!Array.isArray(spec.enum)) continue;
      for (const value of spec.enum) {
        const r = cap.validate({ ...base, [field]: value });
        // A refusal for a DIFFERENT reason is fine; a refusal that names the
        // enum field itself means validate does not know about this value.
        // Only a refusal that names THIS field means validate does not know
        // the value; a refusal about some other field is unrelated.
        const rejectedTheValue = !r.ok && new RegExp(field.replace(/_/g, "[_ ]?"), "i").test(r.error ?? "");
        ck(`${name}.${field}="${value}" is accepted by validate`, !rejectedTheValue, r.ok ? "" : r.error);
      }
    }
  }
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

console.log("\n-- booking questions, triggers and branches are reachable --");
{
  const booking = readFileSync("src/lib/server/booking-pages-service.ts", "utf8");
  ck("booking questions are edited one at a time, not replaced wholesale",
    /addIntakeField\?:/.test(booking) && /updateIntakeField\?:/.test(booking) && /removeIntakeFieldId\?:/.test(booking));
  ck("a question added after a named one lands there",
    /fields\.splice\(at \+ 1, 0, field\)/.test(booking));
  ck("an unknown anchor is refused", /That question isn't on this booking page/.test(booking));
  ck("a reorder that omits a question keeps it",
    /fields\.filter\(\(f\) => !named\.some\(\(n\) => n\.id === f\.id\)\)/.test(booking));
  ck("the merged page is validated by the SAME validator the editor uses",
    /validateBookingPageFormData\(next\)/.test(booking));

  ck("a branch is listed with its conditions and both arms",
    /case "if_else"/.test(dom) && /yes -> /.test(dom));
  ck("a branch with no conditions is called out as deciding nothing",
    /NOTHING IS SET, so it does not actually decide anything/.test(dom));
  ck("who an automation applies to is shown, not just what starts it",
    /Applies to: /.test(dom));
  ck("steps hanging off a branch arm are reported, not lost to the linear walk",
    /Also on a branch arm/.test(dom));
  ck("the trigger and branch tool exists", /name: "edit_workflow_logic"/.test(caps));
  ck("conditions are sent whole, because they are read as one rule",
    /Conditions are sent WHOLE/.test(caps));
  ck("a form restriction is cleared when the trigger is no longer a form",
    /trigger\.formId = null;/.test(wfs));
  ck("a branch cannot be left with no conditions",
    /a branch with no conditions does not decide anything/.test(wfs));
  {
    // The write object is the only thing that reaches Firestore. Reading
    // wf.status to REPORT it is fine and expected; putting a status into
    // the write is what would activate an automation nobody asked to run.
    const logic = wfs.slice(wfs.indexOf("export async function patchWorkflowLogicServerSide"));
    ck("no logic change writes a status", !/write\.status|write\[.status.\]/.test(logic));
    ck("and it only ever writes the trigger or the nodes",
      [...logic.matchAll(/write\.([a-zA-Z]+) =/g)].map((m) => m[1]).every((k) => ["trigger", "nodes"].includes(k)));
  }
}

console.log("\n-- a customer never sees a bare status code --");
{
  const { describeZenoFailure } = await import("../src/lib/ai-suite/failure-message");
  const chat = readFileSync("src/components/ai-suite/ai-suite-chat.tsx", "utf8");
  ck("the chat no longer renders “Request failed (NNN)”", !/Request failed \(\$\{res\.status\}\)/.test(chat));
  ck("nor “Action failed (NNN)”", !/Action failed \(\$\{res\.status\}\)/.test(chat));
  ck("both failure paths go through the one describer",
    (chat.match(/describeZenoFailure\(/g) ?? []).length === 2);

  const up = describeZenoFailure({ status: 502, stage: "chat" });
  ck("an upstream failure is explained in plain words", /intelligence service didn't respond/.test(up), up);
  ck("it names no provider, model or status code", !/openrouter|anthropic|claude|502/i.test(up), up);
  ck("a failed CHAT turn truthfully says nothing changed", /Nothing was changed\./.test(up), up);

  // The claim that matters most: a write that faulted part-way must NOT be
  // reported as having changed nothing.
  const midWrite = describeZenoFailure({ status: 500, stage: "confirm" });
  ck("a write that faulted does NOT claim nothing changed", !/Nothing was changed/.test(midWrite), midWrite);
  ck("and it tells them to check before retrying", /check it before trying again/.test(midWrite), midWrite);

  const refused = describeZenoFailure({ status: 403, stage: "confirm" });
  ck("a write REFUSED before it ran does say nothing changed", /Nothing was changed\./.test(refused), refused);

  const withServer = describeZenoFailure({ status: 400, stage: "confirm", serverMessage: "That section isn't on the page any more." });
  ck("the server's own wording is preferred when it has some", /That section isn't on the page any more\./.test(withServer), withServer);
  const echoed = describeZenoFailure({ status: 502, stage: "chat", serverMessage: "Request failed (502)" });
  ck("a server message that is itself a bare code is not passed through", !/Request failed/.test(echoed), echoed);
}

console.log("\n-- a copy edit that would change nothing is refused, not reported --");
{
  // Found on production: the model sent {heading} for a hero, whose field is
  // `headline`. The key was written, the renderer ignored it, and the
  // customer was told their headline had changed. The read vocabulary (the
  // page-context card says "heading") and the write vocabulary have to meet
  // somewhere, and it cannot be a prompt.
  const blk = caps.slice(caps.indexOf('name: "revise_funnel_copy"'), caps.indexOf('name: "update_task"'));
  ck("a field the section already has is written as-is", /if \(key in config\) \{ resolved\[key\] = value; continue; \}/.test(blk));
  ck("“heading” lands on whatever that section calls its heading",
    /const HEADING_KEYS = \["headline", "problemHeadline", "solutionHeadline", "byline", "text"\]/.test(blk));
  ck("a section with no matching field is REFUSED, never reported as changed",
    /has no \$\{unmapped\.join\(" or "\)\} to change/.test(blk));
  ck("and the refusal names what the section actually has",
    /What it actually has is/.test(blk));
  ck("the resolved fields are what gets written, not the raw ones",
    /\.\.\.resolved \} \} : s,/.test(blk) && !/\.\.\.fields \} \} : s,/.test(blk));
  ck("the page-context card's own word is one of the mapped aliases",
    /heading: HEADING_KEYS/.test(blk) && /heading: string;/.test(ctx));
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILED`}`);
process.exit(fails ? 1 : 0);
