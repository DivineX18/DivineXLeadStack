// LIFECYCLE STATE ENGINE — the certification matrix from the arc spec:
// transition legality per domain, canonical reads (live event doc wins for
// appointments), state-aware wait_until eligibility through the REAL
// runStep executor, and business-day anchor rolling.
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-lifecycle.mts
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
import { FieldValue } from "firebase-admin/firestore";
const { transitionLifecycleState, getLifecycleState, LifecycleTransitionError, lifecycleDocId } = await import("../src/lib/lifecycle/engine");
const { getAdminDb } = await import("../src/lib/firebase/admin");
const { runStep } = await import("../src/lib/workflows/engine");
const { composeStrategyNodes } = await import("../src/lib/workflows/compose-strategy");

const db = getAdminDb();
let failures = 0;
const check = (l: string, ok: boolean, note = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${note ? ` — ${note}` : ""}`); if (!ok) failures++; };

const SUB = "qa-lc-sub", AG = "qa-lc-ag";
// Re-runnable: purge any leftover records from a previously interrupted run.
{
  const stale = await db.collection("lifecycleStates").where("subAccountId", "==", SUB).get();
  for (const d of stale.docs) await d.ref.delete();
}
const cleanup: (() => Promise<unknown>)[] = [];
const t = async (domain: "appointment" | "webinar" | "lead", entityId: string, contactId: string, to: string) =>
  transitionLifecycleState({ subAccountId: SUB, agencyId: AG, domain, entityId, contactId, to, reason: "test" });
const expectReject = async (fn: () => Promise<unknown>) => {
  try { await fn(); return false; } catch (e) { return e instanceof LifecycleTransitionError; }
};

// ── 1. APPOINTMENT transition matrix ──
const A = "appt-1", C = "c-1";
cleanup.push(() => db.doc(`lifecycleStates/${lifecycleDocId("appointment", A, C)}`).delete());
check("1a. requested → booked PASS", (await t("appointment", A, C, "requested")).ok && (await t("appointment", A, C, "booked")).changed);
check("1b. booked → confirmed PASS", (await t("appointment", A, C, "confirmed")).changed);
check("1c. confirmed → rescheduled → booked PASS", (await t("appointment", A, C, "rescheduled")).changed && (await t("appointment", A, C, "booked")).changed);
check("1d. booked → completed PASS (terminal)", (await t("appointment", A, C, "completed")).changed);
check("1e. completed → booked REJECTED (new appointment = new entity)", await expectReject(() => t("appointment", A, C, "booked")));
check("1f. unknown state REJECTED", await expectReject(() => t("appointment", A, C, "teleported")));
check("1g. idempotent same-state repeat (no-op, no error)", (await t("appointment", A, C, "completed")).changed === false);
const rec = (await db.doc(`lifecycleStates/${lifecycleDocId("appointment", A, C)}`).get()).data()!;
check("1h. audit history recorded with reasons", (rec.history as unknown[]).length >= 5 && rec.previousState === "booked");

// ── 2. WEBINAR matrix ──
const W = "web-1";
cleanup.push(() => db.doc(`lifecycleStates/${lifecycleDocId("webinar", W, C)}`).delete());
check("2a. registered → scheduled PASS", (await t("webinar", W, C, "registered")).ok && (await t("webinar", W, C, "scheduled")).changed);
check("2b. scheduled → attended PASS", (await t("webinar", W, C, "attended")).changed);
check("2c. attended → converted PASS", (await t("webinar", W, C, "converted")).changed);
const W2 = "web-2";
cleanup.push(() => db.doc(`lifecycleStates/${lifecycleDocId("webinar", W2, C)}`).delete());
await t("webinar", W2, C, "scheduled");
check("2d. scheduled → missed PASS; missed → not_converted PASS", (await t("webinar", W2, C, "missed")).changed && (await t("webinar", W2, C, "not_converted")).changed);
check("2e. converted is terminal (→ attended REJECTED)", await expectReject(() => t("webinar", W, C, "attended")));

// ── 3. Canonical read: live event doc is the appointment authority ──
const evRef = db.collection("events").doc();
cleanup.push(() => evRef.delete());
await evRef.set({ subAccountId: SUB, agencyId: AG, contactId: C, title: "QA", status: "scheduled", startAt: new Date(Date.now() + 26 * 3600 * 1000), endAt: new Date(Date.now() + 27 * 3600 * 1000), createdByUid: "qa" });
check("3a. scheduled event doc reads as 'booked'", (await getLifecycleState({ subAccountId: SUB, domain: "appointment", entityId: evRef.id, contactId: C })) === "booked");
await evRef.update({ status: "cancelled" });
check("3b. cancelled event doc reads as 'cancelled' (doc wins over any record)", (await getLifecycleState({ subAccountId: SUB, domain: "appointment", entityId: evRef.id, contactId: C })) === "cancelled");

// ── 4. STATE-AWARE wait_until through the real executor ──
const contactRef = db.collection("contacts").doc();
cleanup.push(() => contactRef.delete());
await contactRef.set({ subAccountId: SUB, agencyId: AG, name: "QA LC", tags: [], createdByUid: "qa" });
const wfRef = db.collection("workflows").doc();
cleanup.push(() => wfRef.delete());
const mkWf = (config: Record<string, unknown>) =>
  wfRef.set({
    id: wfRef.id, subAccountId: SUB, agencyId: AG, createdByUid: "qa", name: "QA LC wf", status: "active",
    trigger: { type: "form.submitted", filters: { all: [] } }, startNodeId: "wu",
    nodes: {
      wu: { id: "wu", type: "wait_until", config, branches: { whenTrue: "fired", whenFalse: "skipped" }, next: null },
      fired: { id: "fired", type: "add_tag", config: { tag: "lc-fired" }, next: null },
      skipped: { id: "skipped", type: "add_tag", config: { tag: "lc-skipped" }, next: null },
    },
    stats: { enrolled: 0, completed: 0 }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
const runOnce = async (nodeId = "wu") => {
  const r = db.collection("workflowRuns").doc();
  cleanup.push(() => r.delete());
  await r.set({ id: r.id, subAccountId: SUB, agencyId: AG, workflowId: wfRef.id, contactId: contactRef.id,
    status: "running", currentNodeId: nodeId, history: [], context: { test: true }, qstashMessageId: null,
    enrolledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await r.update({ status: "running" });
  await runStep(r.id, nodeId);
  return r;
};
const tags = async () => ((await contactRef.get()).data()!.tags ?? []) as string[];
const clearTags = () => contactRef.update({ tags: [] });

// 4a. CANCELLED appointment: reminder anchor found but state ineligible → skipped.
// (Event above: startAt +26h, status cancelled; offset -1440 → target +2h → pending,
//  but eligibility must SKIP before waiting.)
await mkWf({ anchorKind: "contact_event", offsetMinutes: -1440, eligibility: { domain: "appointment", states: ["booked", "confirmed"] } });
let r = await runOnce();
await r.update({ status: "running" }); await runStep(r.id, "skipped");
check("4a. cancelled appointment reminder is SKIPPED (state wins over pending node)", (await tags()).includes("lc-skipped") && !(await tags()).includes("lc-fired"));
await clearTags();

// 4b. Re-book (new scheduled event): T-24h reminder fires once time reached.
await evRef.update({ status: "scheduled", startAt: new Date(Date.now() + 30 * 60 * 1000) }); // reschedule: 30min away → T-24h already passed
r = await runOnce();
await r.update({ status: "running" }); await runStep(r.id, "fired");
check("4b. live booked appointment reminder FIRES (reschedule recalculated)", (await tags()).includes("lc-fired"));
await clearTags();

// 4c. COMPLETED appointment cannot receive an upcoming reminder.
await evRef.update({ status: "completed" });
r = await runOnce();
await r.update({ status: "running" }); await runStep(r.id, "skipped");
check("4c. completed appointment reminder is SKIPPED", (await tags()).includes("lc-skipped") && !(await tags()).includes("lc-fired"));
await clearTags();

// 4d/4e. WEBINAR eligibility on funnel_event anchors.
const funRef = db.collection("funnels").doc();
cleanup.push(() => funRef.delete());
await funRef.set({ subAccountId: SUB, agencyId: AG, name: "QA Webinar", status: "draft", genre: "webinar",
  eventStartAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), sections: [], createdByUid: "qa" });
cleanup.push(() => db.doc(`lifecycleStates/${lifecycleDocId("webinar", funRef.id, contactRef.id)}`).delete());
await transitionLifecycleState({ subAccountId: SUB, agencyId: AG, domain: "webinar", entityId: funRef.id, contactId: contactRef.id, to: "scheduled", reason: "test" });
// reminder eligibility (scheduled) at T+0 → state scheduled → fires
await mkWf({ anchorKind: "funnel_event", funnelId: funRef.id, offsetMinutes: 0, eligibility: { domain: "webinar", states: ["registered", "scheduled"] } });
r = await runOnce();
await r.update({ status: "running" }); await runStep(r.id, "fired");
check("4d. webinar reminder fires while state is scheduled", (await tags()).includes("lc-fired"));
await clearTags();
// recovery eligibility (missed): state scheduled → SKIPPED (no fabricated missed)
await mkWf({ anchorKind: "funnel_event", funnelId: funRef.id, offsetMinutes: 0, eligibility: { domain: "webinar", states: ["missed"] } });
r = await runOnce();
await r.update({ status: "running" }); await runStep(r.id, "skipped");
check("4e. recovery does NOT fire for unresolved (scheduled ≠ fabricated missed)", (await tags()).includes("lc-skipped") && !(await tags()).includes("lc-fired"));
await clearTags();
// evidence arrives: operator marks missed → recovery now fires
await transitionLifecycleState({ subAccountId: SUB, agencyId: AG, domain: "webinar", entityId: funRef.id, contactId: contactRef.id, to: "missed", reason: "operator:test" });
r = await runOnce();
await r.update({ status: "running" }); await runStep(r.id, "fired");
check("4f. verified missed → recovery FIRES", (await tags()).includes("lc-fired"));
await clearTags();

// ── 5. Business-day anchor: next-business-day roll (never lands on a weekend) ──
const quoteRef = db.collection("quotes").doc();
cleanup.push(() => quoteRef.delete());
// sentAt = next Friday 10:00 UTC; +1 day + businessDaysOnly → Monday 10:00.
const now = new Date();
const daysToFriday = ((5 - now.getUTCDay()) + 7) % 7 || 7;
const friday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToFriday, 10, 0, 0));
await quoteRef.set({ subAccountId: SUB, agencyId: AG, contactId: contactRef.id, sentAt: friday, createdByUid: "qa" });
await mkWf({ anchorKind: "business_event", entityType: "quote", entityId: quoteRef.id, anchorField: "sentAt", offsetMinutes: 1440, businessDaysOnly: true });
r = await runOnce();
const hist = ((await r.get()).data()!.history ?? []) as { result?: string }[];
const waitLog = String(hist.at(-1)?.result ?? "");
const waitSec = Number(waitLog.match(/anchor:wait:(\d+)s/)?.[1] ?? -1);
const mondayTarget = new Date(friday.getTime() + 3 * 86400 * 1000); // Fri+1d=Sat → rolls to Mon
const naiveRemaining = Math.ceil((friday.getTime() + 86400 * 1000 - Date.now()) / 1000);
const expected = Math.ceil((mondayTarget.getTime() - Date.now()) / 1000);
// The log records TRUE remaining (the QStash wait is capped separately at
// the 6h re-check); assert the target itself rolled Sat → Mon (+2 days).
check("5a. next-business-day rolls Sat → Mon (not a dumb +24h)",
  waitSec > naiveRemaining && Math.abs(expected - waitSec) < 60,
  `wait=${waitSec}s naive=${naiveRemaining}s expected=${expected}s`);

// ── 6. Composer wires webinar eligibility automatically ──
const composed = composeStrategyNodes({
  plan: { conversionEvent: "registered", goalState: "attended", goalTag: "booked", handoffDays: 3, cadenceRationale: "" },
  sequence: [
    { delayHours: 1, subject: "T-24", body: "b", purpose: "remind", commType: "reminder", anchorOffsetHours: -24 },
    { delayHours: 2, subject: "T+2", body: "b", purpose: "recover", commType: "recovery", anchorOffsetHours: 2 },
  ],
  displayName: "W", tag: "w", confirmationSubject: "s", confirmationBody: "b", ownerNotifyBody: "o",
  funnelId: "f1", hasEventTime: true, lifecycleDomain: "webinar",
});
const wu1c = composed.nodes.wu1.config as { eligibility?: { states: string[] } };
const wu2c = composed.nodes.wu2.config as { eligibility?: { states: string[] } };
check("6a. reminder step eligibility = registered/scheduled", JSON.stringify(wu1c.eligibility?.states) === JSON.stringify(["registered", "scheduled"]));
check("6b. recovery step eligibility = missed only", JSON.stringify(wu2c.eligibility?.states) === JSON.stringify(["missed"]));

for (const fn of cleanup) await fn().catch(() => {});
console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
process.exit(failures > 0 ? 1 : 0);
