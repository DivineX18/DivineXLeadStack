/**
 * W2 live: the customer speaks about what is in front of them.
 * Dev records only, clearly marked, removed at the end.
 */
import { ask, show, db, SA } from "./zeno-live-e2e.mts";
const { createFormServerSide } = await import("../src/lib/server/forms-service");
const { createWorkflowServerSide, updateWorkflowServerSide } = await import("../src/lib/server/workflows-service");
const { createBookingPageServerSide } = await import("../src/lib/server/booking-pages-service");
const { createDealServerSide } = await import("../src/lib/server/deals-service");

const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";
const AG = String((await db.doc(`subAccounts/${SA}`).get()).data()?.agencyId ?? "");
const made: string[] = [];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const hhmm = (m: number) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const hours = (x: Record<string, unknown>) => ((x.workingHours ?? []) as {dayOfWeek:number;startMinute:number;endMinute:number}[])
  .map((w) => `${DAYS[w.dayOfWeek]} ${hhmm(w.startMinute)}-${hhmm(w.endMinute)}`).join(", ");
const get = async (p: string) => (await db.doc(p).get()).data()!;

try {
  // ---- dev fixtures ----
  const A = "zeno-dev-w2-page-a", B = "zeno-dev-w2-page-b";
  for (const [slug, name, dur] of [[A, "ZENO DEV - Page A", 30], [B, "ZENO DEV - Page B", 45]] as const) {
    await db.doc(`subAccounts/${SA}/bookingPages/${slug}`).delete().catch(()=>{});
    await createBookingPageServerSide({ subAccountId: SA, createdByUid: UID, data: {
      slug, name, description: "", status: "draft", durationMinutes: dur, bufferMinutes: 0,
      timezone: "America/Chicago", visibleDays: 14, minNoticeHours: 1, maxPerDay: 5,
      workingHours: [1,2,3,4,5].map((d)=>({dayOfWeek:d,startMinute:13*60,endMinute:17*60})),
      intakeFields: [], remindersEnabled: false, reminderOffsetsMinutes: [], redirectAppendParams: false,
      confirmationMessage: "", redirectUrl: "", meetingUrl: "", logoUrl: "", accentColor: "", hosts: [] } });
    made.push(`subAccounts/${SA}/bookingPages/${slug}`);
  }
  const formId = await createFormServerSide({ subAccountId: SA, createdByUid: UID, name: "ZENO DEV - Context form" });
  made.push(`forms/${formId}`);
  const wfId = await createWorkflowServerSide({ subAccountId: SA, createdByUid: UID, name: "ZENO DEV - Context flow", template: "blank" });
  made.push(`workflows/${wfId}`);
  const BODY = "Hi {{contact.firstName}},\n\nGood to meet you.\n\n{{unsubscribeLink}}";
  await updateWorkflowServerSide({ subAccountId: SA, workflowId: wfId, patch: {
    trigger: { type: "form.submitted", filters: { all: [] } }, startNodeId: "e1",
    nodes: {
      e1: { id: "e1", type: "send_email", config: { subject: "One", body: BODY }, next: "e2" },
      e2: { id: "e2", type: "send_email", config: { subject: "Two", body: `${BODY}` }, next: null },
    } } });
  const cRef = db.collection("contacts").doc();
  await cRef.set({ name: "ZENO DEV - Context contact", email: `zeno-dev-${Date.now()}@example.com`, phone: "",
    company: "", source: "manual", tags: [], subAccountId: SA, agencyId: AG, createdByUid: UID, mode: "live",
    createdAt: new Date(), updatedAt: new Date() });
  made.push(`contacts/${cRef.id}`);
  const deal = await createDealServerSide({ subAccountId: SA, agencyId: AG, createdByUid: UID, mode: "live",
    title: "ZENO DEV - Context deal", value: 1000, currency: "USD", contactId: cRef.id, stageId: "new", priority: "medium" });
  made.push(`deals/${deal.id}`);

  // ---- 1. booking page, not named ----
  const a0 = await get(`subAccounts/${SA}/bookingPages/${A}`);
  console.log(`\n=== BOOKING (context only)\nBEFORE ${hours(a0)}`);
  show("open Saturdays, without naming the page",
    await ask("Open Saturdays from 9 AM to 1 PM.", { autoConfirm: true, pageContext: { route: `/sa/${SA}/booking/${A}` } }));
  const a1 = await get(`subAccounts/${SA}/bookingPages/${A}`);
  const b1 = await get(`subAccounts/${SA}/bookingPages/${B}`);
  console.log(`AFTER  ${hours(a1)}`);
  console.log(`    the page on screen got Saturday: ${hours(a1).includes("Sat 09:00-13:00")}`);
  console.log(`    Mon-Fri intact: ${["Mon","Tue","Wed","Thu","Fri"].every((d)=>hours(a1).includes(`${d} 13:00-17:00`))}`);
  console.log(`    the OTHER page was not touched: ${hours(b1) === hours(a0)}`);
  console.log(`    duration unchanged: ${a1.durationMinutes === a0.durationMinutes}`);

  // ---- 2. explicit target beats the screen ----
  console.log(`\n=== EXPLICIT OVERRIDE (on A, naming B)`);
  show("on page A, but naming page B",
    await ask(['Open Saturdays 10 AM to 2 PM on my "ZENO DEV - Page B" booking page.', "Yes, go ahead."],
      { autoConfirm: true, pageContext: { route: `/sa/${SA}/booking/${A}` } }));
  const a2 = await get(`subAccounts/${SA}/bookingPages/${A}`);
  const b2 = await get(`subAccounts/${SA}/bookingPages/${B}`);
  console.log(`    B (the one named) changed: ${hours(b2).includes("Sat 10:00-14:00")}`);
  console.log(`    A (the one on screen) unchanged: ${hours(a2) === hours(a1)}`);

  // ---- 3. navigation: A -> B, same conversation ----
  console.log(`\n=== NAVIGATION (context switches to B)`);
  show("now on B, says 'this'",
    await ask(["Change this page's meeting length to 60 minutes.", "Yes, go ahead."],
      { autoConfirm: true, pageContext: { route: `/sa/${SA}/booking/${B}` } }));
  const a3 = await get(`subAccounts/${SA}/bookingPages/${A}`);
  const b3 = await get(`subAccounts/${SA}/bookingPages/${B}`);
  console.log(`    B is 60 minutes: ${b3.durationMinutes === 60}`);
  console.log(`    A is still ${a3.durationMinutes}: ${a3.durationMinutes === 30}`);

  // ---- 4. form ----
  const f0 = await get(`forms/${formId}`);
  console.log(`\n=== FORM (context only)\nBEFORE ${(f0.fields as {label:string}[]).map((x)=>x.label).join(", ")}`);
  show("add a question, without naming the form",
    await ask(["Add a Company question.", "Yes, go ahead."], { autoConfirm: true, pageContext: { route: `/sa/${SA}/forms/${formId}` } }));
  const f1 = await get(`forms/${formId}`);
  console.log(`AFTER  ${(f1.fields as {label:string}[]).map((x)=>x.label).join(", ")}`);
  console.log(`    Company added: ${(f1.fields as {label:string}[]).some((x)=>/company/i.test(x.label))}`);
  console.log(`    original questions preserved in order: ${JSON.stringify((f1.fields as {id:string}[]).slice(0,4).map((x)=>x.id)) === JSON.stringify((f0.fields as {id:string}[]).map((x)=>x.id))}`);

  // ---- 5. workflow child context ----
  const w0 = await get(`workflows/${wfId}`);
  console.log(`\n=== WORKFLOW EMAIL 2 SELECTED (child context)`);
  show("change this CTA, naming neither the automation nor the email",
    await ask(["Add a Book a Call button linking to https://example.com/zeno-dev-book to this email.", "Yes, go ahead."],
      { autoConfirm: true, pageContext: { route: `/sa/${SA}/workflows/${wfId}`, resourceRef: { kind: "workflow", id: wfId, childId: "e2" } } }));
  const w1 = await get(`workflows/${wfId}`);
  const n = (d: Record<string, unknown>, id: string) => ((d.nodes as Record<string, {config?:{body?:string}}>)[id]?.config?.body ?? "");
  console.log(`    email 2 got the button: ${n(w1,"e2").includes("[button: Book a Call]")}`);
  console.log(`    email 1 untouched:      ${n(w1,"e1") === n(w0,"e1")}`);
  console.log(`    still a draft:          ${w1.status === "draft"}`);

  // ---- 6. deal via explicit ref (no per-deal route exists) ----
  const d0 = await get(`deals/${deal.id}`);
  console.log(`\n=== DEAL (explicit ref, no route carries a deal id)\nBEFORE stage=${d0.stageId}`);
  show("move this to qualified",
    await ask(["Move this to qualified.", "Yes, go ahead."],
      { autoConfirm: true, pageContext: { route: `/sa/${SA}/pipeline`, resourceRef: { kind: "deal", id: deal.id } } }));
  const d1 = await get(`deals/${deal.id}`);
  console.log(`AFTER  stage=${d1.stageId}`);
  console.log(`    the deal moved: ${d1.stageId === "qualified"}`);
  console.log(`    value + contact preserved: ${d1.value === d0.value && d1.contactId === d0.contactId}`);
} finally {
  for (const p of made) await db.doc(p).delete().catch(()=>{});
  console.log(`\ncleaned up ${made.length} dev records`);
}
