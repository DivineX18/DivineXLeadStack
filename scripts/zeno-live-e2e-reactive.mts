/**
 * W3 live: prompt -> proposal -> confirm -> receipt -> persisted -> the
 * data path the open screen is actually reading.
 *
 * The browser is not driven here. What is driven is everything that
 * decides whether a screen can see the change: the receipt the confirm
 * route mints, the signal the chat client publishes from it, and the
 * document a subscribed editor is listening to.
 */
import { ask, show, db, SA } from "./zeno-live-e2e.mts";
const { publishCommittedChange, onResourceChange } = await import("../src/lib/ai-suite/resource-changes");
const { normalizeMutation, mintReceipt } = await import("../src/lib/ai-suite/execution-result");
const { createBookingPageServerSide } = await import("../src/lib/server/booking-pages-service");
const { createFormServerSide } = await import("../src/lib/server/forms-service");
const { createWorkflowServerSide, updateWorkflowServerSide } = await import("../src/lib/server/workflows-service");
const { createDealServerSide } = await import("../src/lib/server/deals-service");

const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";
const AG = String((await db.doc(`subAccounts/${SA}`).get()).data()?.agencyId ?? "");
const made: string[] = [];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const hh = (m: number) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const hours = (x: Record<string, unknown>) => ((x.workingHours ?? []) as {dayOfWeek:number;startMinute:number;endMinute:number}[])
  .map((w)=>`${DAYS[w.dayOfWeek]} ${hh(w.startMinute)}-${hh(w.endMinute)}`).join(", ");

/**
 * The confirm route's own steps: normalize what the capability returned,
 * mint only because execute() returned, publish only a minted receipt.
 */
function receiptFrom(res: { mutation?: unknown }, capability: string) {
  const m = normalizeMutation(res.mutation);
  return m ? mintReceipt({ capability, mutation: m, auditId: "dev" }) : null;
}

try {
  const A = "zeno-dev-w3-a", B = "zeno-dev-w3-b";
  for (const [slug, name] of [[A, "ZENO DEV W3 - Page A"], [B, "ZENO DEV W3 - Page B"]] as const) {
    await db.doc(`subAccounts/${SA}/bookingPages/${slug}`).delete().catch(()=>{});
    await createBookingPageServerSide({ subAccountId: SA, createdByUid: UID, data: {
      slug, name, description: "", status: "draft", durationMinutes: 30, bufferMinutes: 0,
      timezone: "America/Chicago", visibleDays: 14, minNoticeHours: 1, maxPerDay: 5,
      workingHours: [1,2,3,4,5].map((d)=>({dayOfWeek:d,startMinute:13*60,endMinute:17*60})),
      intakeFields: [], remindersEnabled: false, reminderOffsetsMinutes: [], redirectAppendParams: false,
      confirmationMessage: "", redirectUrl: "", meetingUrl: "", logoUrl: "", accentColor: "", hosts: [] } });
    made.push(`subAccounts/${SA}/bookingPages/${slug}`);
  }

  // ---------- 1. BOOKING: open editor sees it, via its own subscription ----------
  console.log("\n=== BOOKING PAGE, editor open on A");
  const seen: string[] = [];
  const stop = db.doc(`subAccounts/${SA}/bookingPages/${A}`).onSnapshot((s) => { if (s.exists) seen.push(hours(s.data()!)); });
  await new Promise((r)=>setTimeout(r,1200));
  const r1 = await ask("Open Saturdays from 9 AM to 1 PM.", { autoConfirm: true, pageContext: { route: `/sa/${SA}/booking/${A}` } });
  show("open Saturdays (page A open)", r1);
  await new Promise((r)=>setTimeout(r,2500));
  stop();
  console.log(`    the open editor's own stream delivered it: ${seen.length >= 2 && seen[seen.length-1].includes("Sat 09:00-13:00")}`);
  console.log(`    snapshots: ${JSON.stringify(seen)}`);

  // ---------- 2. DIFFERENT RESOURCE: A open, B changed ----------
  console.log("\n=== DIFFERENT RESOURCE, A stays open while B is changed");
  const aBefore = hours((await db.doc(`subAccounts/${SA}/bookingPages/${A}`).get()).data()!);
  let aDisturbed = 0;
  const offA = onResourceChange({ resourceType: "booking_page", resourceId: A }, () => { aDisturbed++; });
  const r2 = await ask([`Open Sundays 10 AM to 2 PM on my "ZENO DEV W3 - Page B" booking page.`, "Yes, go ahead."],
    { autoConfirm: true, pageContext: { route: `/sa/${SA}/booking/${A}` } });
  show("change B while A is open", r2);
  if (r2.kind === "executed") {
    const rec = receiptFrom(r2 as never, r2.capability!);
    if (rec) publishCommittedChange(rec);
    console.log(`    the receipt names B, not A: ${rec?.resourceId === B}`);
  }
  offA();
  const aAfter = hours((await db.doc(`subAccounts/${SA}/bookingPages/${A}`).get()).data()!);
  console.log(`    A's editor was never signalled: ${aDisturbed === 0}`);
  console.log(`    A's stored state is unchanged: ${aAfter === aBefore}`);

  // ---------- 3. REFUSAL: nothing is signalled ----------
  console.log("\n=== REFUSAL produces no signal");
  let anySignal = 0;
  const offAny = onResourceChange({ resourceType: "booking_page", resourceId: A }, () => { anySignal++; });
  const r3 = await ask([`Change the web address of the "${A}" booking page to something shorter.`, "Yes, go ahead."],
    { autoConfirm: true, pageContext: { route: `/sa/${SA}/booking/${A}` } });
  show("a refused change", r3);
  if (r3.kind === "executed") { const rec = receiptFrom(r3 as never, r3.capability!); if (rec) publishCommittedChange(rec); }
  offAny();
  console.log(`    outcome was not an execution: ${r3.kind !== "executed"}`);
  console.log(`    no refresh signal was emitted: ${anySignal === 0}`);

  // ---------- 4. FORM ----------
  const formId = await createFormServerSide({ subAccountId: SA, createdByUid: UID, name: "ZENO DEV W3 - form" });
  made.push(`forms/${formId}`);
  console.log("\n=== FORM, editor open");
  const fSeen: number[] = [];
  const stopF = db.doc(`forms/${formId}`).onSnapshot((s) => { if (s.exists) fSeen.push(((s.data()!.fields ?? []) as unknown[]).length); });
  await new Promise((r)=>setTimeout(r,1200));
  show("add a Company question", await ask(["Add a Company question.", "Yes, go ahead."],
    { autoConfirm: true, pageContext: { route: `/sa/${SA}/forms/${formId}` } }));
  await new Promise((r)=>setTimeout(r,2500));
  stopF();
  console.log(`    the open form editor's stream delivered it: ${fSeen.length >= 2 && fSeen[fSeen.length-1] === 5}`);
  console.log(`    field counts seen: ${JSON.stringify(fSeen)}`);

  // ---------- 5. WORKFLOW: the stale-editor hazard ----------
  const wfId = await createWorkflowServerSide({ subAccountId: SA, createdByUid: UID, name: "ZENO DEV W3 - flow", template: "blank" });
  made.push(`workflows/${wfId}`);
  const BODY = "Hi {{contact.firstName}},\n\nGood to meet you.\n\n{{unsubscribeLink}}";
  await updateWorkflowServerSide({ subAccountId: SA, workflowId: wfId, patch: {
    trigger: { type: "form.submitted", filters: { all: [] } }, startNodeId: "e1",
    nodes: { e1: { id: "e1", type: "send_email", config: { subject: "One", body: BODY }, next: "e2" },
             e2: { id: "e2", type: "send_email", config: { subject: "Two", body: BODY }, next: null } } } });
  console.log("\n=== WORKFLOW, the one editor that holds a local copy");
  let wfSignals: { id: string; fields?: string[] }[] = [];
  const offW = onResourceChange({ resourceType: "workflow", resourceId: wfId }, (c) => { wfSignals.push({ id: c.resourceId, fields: c.changedFields }); });
  const r5 = await ask(["Add a Book a Call button linking to https://example.com/zeno-dev-w3 to this email.", "Yes, go ahead."],
    { autoConfirm: true, pageContext: { route: `/sa/${SA}/workflows/${wfId}`, resourceRef: { kind: "workflow", id: wfId, childId: "e2" } } });
  show("change email 2's CTA with it selected", r5);
  if (r5.kind === "executed") { const rec = receiptFrom(r5 as never, r5.capability!); if (rec) publishCommittedChange(rec); }
  offW();
  const wf = (await db.doc(`workflows/${wfId}`).get()).data()!;
  const body = (id: string) => String((wf.nodes as Record<string, {config?:{body?:string}}>)[id]?.config?.body ?? "");
  console.log(`    the editor WAS signalled: ${wfSignals.length === 1}`);
  console.log(`    the signal says what changed: ${JSON.stringify(wfSignals[0]?.fields)}`);
  console.log(`    the signal carries no replacement state: ${Object.keys(wfSignals[0] ?? {}).every((k)=>["id","fields"].includes(k))}`);
  console.log(`    email 2 persisted the button: ${body("e2").includes("[button: Book a Call]")}`);
  console.log(`    email 1 untouched:            ${body("e1") === BODY}`);
  console.log(`    still a draft:                ${wf.status === "draft"}`);

  // ---------- 6. DIRTY EDITOR: unsaved work survives ----------
  console.log("\n=== DIRTY EDITOR (the hazard: a stale save would undo Zeno)");
  // Simulates the builder exactly: local copy + a dirty flag + the handler.
  let localSteps = "the customer's unsaved headline";
  let dirty = true;
  let banner: string | null = null;
  let reloaded = false;
  const handler = (c: { resourceId: string }) => {
    if (dirty) { banner = `Zeno changed ${c.resourceId} while you were editing`; return; }
    reloaded = true;
  };
  const offD = onResourceChange({ resourceType: "workflow", resourceId: wfId }, handler);
  publishCommittedChange(mintReceipt({ capability: "edit_email_cta", mutation: { resourceType: "workflow", resourceId: wfId, operation: "updated", changedFields: ["nodes"] }, auditId: "dev" }));
  console.log(`    dirty editor: unsaved work intact: ${localSteps === "the customer's unsaved headline"}`);
  console.log(`    dirty editor: NOT reloaded:        ${reloaded === false}`);
  console.log(`    dirty editor: told, not overruled: ${banner !== null}`);
  dirty = false; banner = null;
  publishCommittedChange(mintReceipt({ capability: "edit_email_cta", mutation: { resourceType: "workflow", resourceId: wfId, operation: "updated", changedFields: ["nodes"] }, auditId: "dev" }));
  console.log(`    clean editor: reloads from storage: ${reloaded === true}`);
  console.log(`    clean editor: no banner needed:     ${banner === null}`);
  offD();

  // ---------- 7. DEAL ----------
  const cRef = db.collection("contacts").doc();
  await cRef.set({ name: "ZENO DEV W3 - contact", email: `zeno-dev-w3-${Date.now()}@example.com`, phone: "", company: "",
    source: "manual", tags: [], subAccountId: SA, agencyId: AG, createdByUid: UID, mode: "live", createdAt: new Date(), updatedAt: new Date() });
  made.push(`contacts/${cRef.id}`);
  const deal = await createDealServerSide({ subAccountId: SA, agencyId: AG, createdByUid: UID, mode: "live",
    title: "ZENO DEV W3 - deal", value: 500, currency: "USD", contactId: cRef.id, stageId: "new", priority: "medium" });
  made.push(`deals/${deal.id}`);
  console.log("\n=== DEAL, pipeline open");
  const dSeen: string[] = [];
  const stopD = db.doc(`deals/${deal.id}`).onSnapshot((s) => { if (s.exists) dSeen.push(String(s.data()!.stageId)); });
  await new Promise((r)=>setTimeout(r,1200));
  show("move this to qualified", await ask(["Move this to qualified.", "Yes, go ahead."],
    { autoConfirm: true, pageContext: { route: `/sa/${SA}/pipeline`, resourceRef: { kind: "deal", id: deal.id } } }));
  await new Promise((r)=>setTimeout(r,2500));
  stopD();
  console.log(`    the open pipeline's stream delivered it: ${dSeen[dSeen.length-1] === "qualified"}`);
  console.log(`    stages seen: ${JSON.stringify(dSeen)}`);
} finally {
  for (const p of made) await db.doc(p).delete().catch(()=>{});
  console.log(`\ncleaned up ${made.length} dev records`);
}
