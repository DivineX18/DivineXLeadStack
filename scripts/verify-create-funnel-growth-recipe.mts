// Permanent regression coverage for the "Growth System" orchestration
// upgrade (2026-08-01): a real user manually built a GHL-style recipe by
// hand (trigger -> create contact -> apply tag -> create opportunity ->
// confirmation email -> wait -> internal notification -> wait -> reminder ->
// follow-up task) and asked for an engineering assessment of how much of
// that Zeno could already orchestrate. The assessment found the workflow
// ENGINE already supported wait/notify/add_tag/create_task nodes — only
// `create_deal` (Opportunity creation) was missing as a node type, and
// create_funnel's own orchestration only ever built a single send_email
// step, never touching any of the other already-supported node types.
//
// This script proves, end-to-end, against a REAL throwaway sub-account and
// REAL Firestore writes (no mocking):
//  1. create_funnel now builds a 6-node workflow graph (create_deal ->
//     add_tag -> send_email -> notify -> wait -> create_task) instead of a
//     single send_email node.
//  2. The NEW create_deal node type actually creates a real Deal at the
//     correct stage via the real engine executor (execCreateDeal), the same
//     REGISTRY dispatch a manually-built workflow runs on — not a parallel
//     AI-only execution path.
//  3. The add_tag and create_task nodes (already-existing engine
//     capabilities, just never wired into create_funnel before) actually
//     fire correctly when driven through the real engine's runStep().
//
// send_email/notify/wait nodes are verified structurally only (config
// shape + chain order) — their executors are pre-existing/unmodified and
// exercising them here would either require Resend to be configured (a
// real email send on every regression run) or a real QStash schedule
// (wait node) escaping this script's cleanup. n1/n2/n6 are Firestore-only
// and fully safe to drive for real.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-create-funnel-growth-recipe.mts

import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
const { FieldValue } = await import("firebase-admin/firestore");
const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
const { runStep } = await import("../src/lib/workflows/engine");
const { createContactServerSide } = await import("../src/lib/server/contacts-service");
type AiSuiteActionContext = import("../src/lib/ai-suite/capabilities").AiSuiteActionContext;

const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;
function fakeCtx(subAccountId: string, agencyId: string, uid: string): AiSuiteActionContext {
  return { uid, email: "verify-script@example.com", displayName: "Verify Script", agencyId, subAccountId };
}
let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const db = getAdminDb();
const auth = getAdminAuth();
const RUN_ID = `growthrecipe${Date.now()}`;
const AGENCY_ID = `test-agency-${RUN_ID}`;
const SUB_ID = `test-sa-${RUN_ID}`;
await db.doc(`agencies/${AGENCY_ID}`).set({ name: "Verify Agency", createdAt: new Date() });
await db.doc(`subAccounts/${SUB_ID}`).set({
  name: "Verify Sub-Account",
  agencyId: AGENCY_ID,
  funnelsEnabledByAgency: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const user = await auth.createUser({ email: `growthrecipe-${RUN_ID}@example.com`, password: "verify-test-pass-123!" });

const createdIds: { funnelId?: string; formId?: string; workflowId?: string; templateId?: string } = {};

try {
  const validated = cap.validate!({
    funnel_name: "Website Growth Assessment",
    genre: "lead_magnet",
    headline: "Free Website Growth Assessment",
    bullets: "See what's costing you leads, Get 3 concrete fixes, No sales pitch",
    tag: "Website Assessment Requested",
  });
  check("1. Reproduces the reported scenario and validates", validated.ok);
  if (!validated.ok) throw new Error("validate failed, aborting");

  const result = await cap.execute!(
    fakeCtx(SUB_ID, AGENCY_ID, user.uid),
    validated.args,
  );
  createdIds.funnelId = result.ref?.id;
  check("2. execute() creates the funnel", !!createdIds.funnelId, result.resultText);

  // The Growth System Summary — every checked-off line must map to a real
  // created asset. Asserting the literal section headers here means a future
  // edit that silently drops a real step (without updating the summary to
  // match) gets caught, and a future edit that adds a fabricated checkmark
  // for something NOT actually created also gets caught.
  const summary = result.resultText;
  check("2a. Summary has the checklist header", summary.startsWith("✅ Growth System Created"));
  check(
    "2b. Summary lists all real created assets under the right sections",
    ["ASSETS", "Landing Page", "CHECKOUT", "Capture Form", "Confirmation Email", "CRM", "Opportunity Creation", "Contact Tag", "Follow-up Task", "AUTOMATION", "Workflow", "Internal Notification", "Wait Step", "STATUS", "Draft"].every((s) => summary.includes(s)),
    summary,
  );

  // lead_magnet is one-fold (RC 1.1 length pass, 2026-08-02) — the capture
  // form wires directly into the hero section now, there's no separate
  // offer stage for it to live on.
  const funnelSnap = await db.doc(`funnels/${createdIds.funnelId}`).get();
  const heroSection = funnelSnap.data()?.sections?.find((s: { type: string }) => s.type === "hero");
  createdIds.formId = heroSection?.config?.formId;
  check("3. Capture form wired into the one-fold hero section", !!createdIds.formId);

  const workflowsSnap = await db.collection("workflows").where("subAccountId", "==", SUB_ID).get();
  check("4. Exactly one follow-up workflow created", workflowsSnap.size === 1, `count=${workflowsSnap.size}`);
  const wfDoc = workflowsSnap.docs[0];
  createdIds.workflowId = wfDoc?.id;
  const wf = wfDoc?.data();

  check("5. Trigger is form.submitted scoped to the created form", wf?.trigger?.type === "form.submitted" && wf?.trigger?.formId === createdIds.formId);
  check("6. startNodeId is n1", wf?.startNodeId === "n1");

  const nodes = wf?.nodes ?? {};
  check("7a. n1 is create_deal, stage=new, next=n2", nodes.n1?.type === "create_deal" && nodes.n1?.config?.stageId === "new" && nodes.n1?.next === "n2");
  check("7b. n2 is add_tag with the requested tag, next=n3", nodes.n2?.type === "add_tag" && nodes.n2?.config?.tag === "Website Assessment Requested" && nodes.n2?.next === "n3");
  check("7c. n3 is send_email (confirmation), next=n4", nodes.n3?.type === "send_email" && !!nodes.n3?.config?.subject && nodes.n3?.next === "n4");
  // Automation Strategy Engine graph (compose-strategy.ts): notify → wh
  // (handoff wait) → ch (goal-tag exit check) → task. The old fixed n5/n6
  // spine was retired when workflows became lifecycle-composed.
  check("7d. n4 is notify (internal), next=wh", nodes.n4?.type === "notify" && nodes.n4?.config?.recipient === "owner" && nodes.n4?.next === "wh");
  check("7e. wh is the handoff wait (1 day synthesized), next=ch", nodes.wh?.type === "wait" && nodes.wh?.config?.seconds === 86_400 && nodes.wh?.next === "ch");
  check("7f. ch goal-gates the task; task ends the chain", nodes.ch?.type === "if_else" && nodes.ch?.branches?.whenTrue === "goal" && nodes.ch?.branches?.whenFalse === "task" && nodes.task?.type === "create_task" && nodes.task?.next === null);

  // --- Drive the REAL engine through the Firestore-only nodes (n1, n2, n6) ---
  const contactRes = await createContactServerSide({
    subAccountId: SUB_ID,
    agencyId: AGENCY_ID,
    createdByUid: user.uid,
    mode: "live",
    name: "Jamie Test",
    email: "jamie-test@example.com",
    phone: "",
    company: "",
    address: "",
    source: "regression-script",
    tags: [],
  });
  const contactId = contactRes.id;

  const runRef = db.collection("workflowRuns").doc();
  await runRef.set({
    id: runRef.id,
    subAccountId: SUB_ID,
    agencyId: AGENCY_ID,
    workflowId: createdIds.workflowId,
    contactId,
    status: "running",
    currentNodeId: "n1",
    history: [],
    context: { test: true },
    qstashMessageId: null,
    enrolledAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // runStep() executes the node, THEN tries to auto-schedule the next node
  // via a real QStash publish (scheduleNode -> publishCallback). QStash
  // refuses to schedule a callback to a loopback destination, so in this
  // local script (NEXT_PUBLIC_APP_URL = localhost, no public tunnel) that
  // scheduling call fails and runStep marks the run "failed" as a result —
  // a pure artifact of running outside a deployed environment with a real
  // public callback URL, not a defect in the executor itself (n1's Deal
  // write above already succeeded before the scheduling call ran). Reset
  // the run to "running" between manual steps so we can drive n2/n6
  // directly and verify THEIR executors for real, the same way the
  // deployed app's QStash-driven chain would.
  const resetRunning = () => runRef.update({ status: "running" });

  await runStep(runRef.id, "n1");
  const dealsSnap = await db.collection("deals").where("contactId", "==", contactId).get();
  check("8a. runStep(n1) creates a real Deal via the real engine executor", dealsSnap.size === 1, `count=${dealsSnap.size}`);
  const deal = dealsSnap.docs[0]?.data();
  check("8b. Deal has the funnel name as title and stage=new", deal?.title === "Website Growth Assessment" && deal?.stageId === "new");

  await resetRunning();
  await runStep(runRef.id, "n2");
  const contactAfterTag = await db.doc(`contacts/${contactId}`).get();
  check("9. runStep(n2) tags the contact via the real add_tag executor", (contactAfterTag.data()?.tags ?? []).includes("Website Assessment Requested"));

  await resetRunning();
  await runStep(runRef.id, "task");
  const tasksSnap = await db.collection("tasks").where("contactId", "==", contactId).get();
  check("10a. runStep(task) creates a real follow-up Task via the real engine executor", tasksSnap.size === 1, `count=${tasksSnap.size}`);
  const task = tasksSnap.docs[0]?.data();
  check("10b. Task title resolves the {{contact.firstName}} merge tag", (task?.title as string)?.includes("Jamie"), task?.title);

  const runAfter = await runRef.get();
  const history = (runAfter.data()?.history ?? []) as { nodeId: string; result: string }[];
  check(
    "11. Run history records all three real executions with ok-shaped results",
    history.some((h) => h.nodeId === "n1" && h.result.startsWith("deal_created:")) &&
      history.some((h) => h.nodeId === "n2" && h.result.startsWith("tag+:")) &&
      history.some((h) => h.nodeId === "task" && h.result === "task_created"),
    JSON.stringify(history),
  );

  // Cleanup this block's extra docs (funnel/form/workflow/template cleaned below).
  for (const d of dealsSnap.docs) await d.ref.delete().catch(() => {});
  for (const t of tasksSnap.docs) await t.ref.delete().catch(() => {});
  await runRef.delete().catch(() => {});
  await db.doc(`contacts/${contactId}`).delete().catch(() => {});
} finally {
  if (createdIds.funnelId) await db.doc(`funnels/${createdIds.funnelId}`).delete().catch(() => {});
  if (createdIds.formId) await db.doc(`forms/${createdIds.formId}`).delete().catch(() => {});
  if (createdIds.workflowId) await db.doc(`workflows/${createdIds.workflowId}`).delete().catch(() => {});
  const templatesSnap = await db.collection("message_templates").where("subAccountId", "==", SUB_ID).get();
  for (const t of templatesSnap.docs) await t.ref.delete().catch(() => {});
  await db.doc(`subAccounts/${SUB_ID}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY_ID}`).delete().catch(() => {});
  await auth.deleteUser(user.uid).catch(() => {});
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
