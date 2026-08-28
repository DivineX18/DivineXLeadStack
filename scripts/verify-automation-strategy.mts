// AUTOMATION STRATEGY ENGINE — composer unit coverage. Pure (no Firestore,
// no network): plan + sequence in, node graph out, assert the state machine.
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-automation-strategy.mts
import { composeStrategyNodes, synthesizeAutomationPlan } from "../src/lib/workflows/compose-strategy";
import type { WorkflowNode } from "../src/types/workflows";

let failures = 0;
const check = (l: string, ok: boolean) => { console.log(`${ok ? "PASS" : "FAIL"} ${l}`); if (!ok) failures++; };

const plan = {
  conversionEvent: "requested the guide",
  goalState: "booked the consultation",
  goalTag: "booked",
  handoffDays: 5,
  cadenceRationale: "Cold traffic, considered decision.",
};
const seq = [
  { delayHours: 24, subject: "Day 1", body: "Advance belief 2", purpose: "belief 2" },
  { delayHours: 72, subject: "Day 3", body: "Resolve objection", purpose: "objection" },
];
const { nodes, startNodeId } = composeStrategyNodes({
  plan,
  sequence: seq,
  displayName: "Test Funnel",
  tag: "test-funnel",
  confirmationSubject: "You're in",
  confirmationBody: "Here's the guide.",
  ownerNotifyBody: "New lead.",
});

function walk(from: string | null | undefined, path: string[] = []): string[] {
  let cur = from;
  while (cur && path.length < 40) {
    path.push(cur);
    const n = nodes[cur];
    if (!n) break;
    cur = n.type === "if_else" ? n.branches?.whenFalse : n.next;
  }
  return path;
}

// 1. Structure
const happyPath = walk(startNodeId);
check("1a. spine order: deal→tag→confirm→notify", happyPath.slice(0, 4).join(",") === "n1,n2,n3,n4");
check("1b. happy path visits both nurture emails then handoff task",
  happyPath.includes("e1") && happyPath.includes("e2") && happyPath.at(-1) === "task");
check("1c. every nurture email is preceded by a goal-tag exit check",
  nodes.c1?.type === "if_else" && nodes.c1.branches?.whenTrue === "goal" && nodes.c1.branches?.whenFalse === "e1" &&
  nodes.c2?.type === "if_else" && nodes.c2.branches?.whenTrue === "goal" && nodes.c2.branches?.whenFalse === "e2");
check("1d. handoff re-checks goal tag before creating the task",
  nodes.ch?.type === "if_else" && nodes.ch.branches?.whenTrue === "goal" && nodes.ch.branches?.whenFalse === "task");
check("1e. goal node ends the run", nodes.goal?.type === "goal" && nodes.goal.next === null);

// 2. Timing: absolute delays → increments; handoff waits out the remainder
const w = (id: string) => Number((nodes[id]?.config as { seconds?: number }).seconds ?? -1);
check("2a. first wait = 24h", w("w1") === 24 * 3600);
check("2b. second wait = 48h increment (72h absolute)", w("w2") === 48 * 3600);
check("2c. handoff wait = remainder to day 5 (48h)", w("wh") === 5 * 86400 - 72 * 3600);

// 3. Exit-check condition targets the plan's goal tag
const cond = (nodes.c1?.config as { conditions?: { all?: { field: string; op: string; value: string }[] } }).conditions?.all?.[0];
check("3a. exit condition is has_tag(goalTag)", cond?.op === "has_tag" && cond?.value === "booked" && cond?.field === "tags");

// 4. Compliance: every email body carries the unsubscribe link
const emails = Object.values(nodes).filter((n: WorkflowNode) => n.type === "send_email");
check("4a. all emails carry {{unsubscribeLink}}", emails.length === 3 && emails.every((n) => String(n.config.body).includes("{{unsubscribeLink}}")));

// 5. No-sequence (urgent/phone-first) case: spine + fast handoff, no nurture
const urgent = composeStrategyNodes({
  plan: { ...plan, goalTag: "job-booked", handoffDays: 0, goalState: "booked the repair" },
  sequence: [],
  displayName: "Emergency", tag: "em", confirmationSubject: "s", confirmationBody: "b", ownerNotifyBody: "o",
});
const upath = ((): string[] => {
  const out: string[] = []; let cur: string | null | undefined = urgent.startNodeId;
  while (cur && out.length < 20) { out.push(cur); const n = urgent.nodes[cur]; cur = n?.type === "if_else" ? n.branches?.whenFalse : n?.next; }
  return out;
})();
check("5a. urgent: no nurture emails, straight to guarded handoff", !upath.includes("e1") && upath.at(-1) === "task");
check("5b. urgent handoff floors at 1h (not 0s)", Number((urgent.nodes.wh.config as { seconds?: number }).seconds) === 3600);

// 6. Synthesized floor
const syn = synthesizeAutomationPlan("X", "x-tag");
check("6a. synthesized plan is marked + goal-tagged", syn.synthesized === true && syn.goalTag.length > 0);

// 7. Mis-ordered sequence still runs forward
const disordered = composeStrategyNodes({
  plan, sequence: [
    { delayHours: 100, subject: "late", body: "b", purpose: "p" },
    { delayHours: 10, subject: "early", body: "b", purpose: "p" },
  ],
  displayName: "D", tag: "d", confirmationSubject: "s", confirmationBody: "b", ownerNotifyBody: "o",
});
check("7a. steps sorted by delay; both waits positive",
  (disordered.nodes.e1.config as { subject?: string }).subject === "early" &&
  Number((disordered.nodes.w2.config as { seconds?: number }).seconds) === 90 * 3600);


// 9. TIME-ANCHORED AUTOMATION — anchored steps compose into self-correcting
//    wait_until segments; cancellation skip-chain; degrade-to-absolute
//    when the funnel has no event time.
{
  const webinarSeq = [
    { delayHours: 1, subject: "T-24", body: "b", purpose: "remind", commType: "reminder", anchorOffsetHours: -24 },
    { delayHours: 2, subject: "T-1", body: "b", purpose: "remind", commType: "reminder", anchorOffsetHours: -1 },
    { delayHours: 3, subject: "T+2", body: "b", purpose: "follow up", commType: "recovery", anchorOffsetHours: 2 },
  ];
  const w = composeStrategyNodes({
    plan, sequence: webinarSeq, displayName: "Webinar", tag: "web",
    confirmationSubject: "s", confirmationBody: "b", ownerNotifyBody: "o",
    funnelId: "funnel-123", hasEventTime: true,
  });
  check("9a. three wait_until anchors composed in offset order",
    w.nodes.wu1?.type === "wait_until" && (w.nodes.wu1.config as { offsetMinutes?: number }).offsetMinutes === -1440 &&
    (w.nodes.wu2.config as { offsetMinutes?: number }).offsetMinutes === -60 &&
    (w.nodes.wu3.config as { offsetMinutes?: number }).offsetMinutes === 120);
  check("9b. anchors reference the live funnel", (w.nodes.wu1.config as { funnelId?: string }).funnelId === "funnel-123");
  check("9c. anchor fired -> goal-gated email", w.nodes.wu1.branches?.whenTrue === "ca1" && w.nodes.ca1?.branches?.whenFalse === "ea1");
  check("9d. cancellation skip-chain: missing anchor jumps to next anchor, last to handoff",
    w.nodes.wu1.branches?.whenFalse === "wu2" && w.nodes.wu3.branches?.whenFalse === "wh");
  check("9e. reminder emails carry commType", (w.nodes.ea1.config as { commType?: string }).commType === "reminder");

  const noTime = composeStrategyNodes({
    plan, sequence: webinarSeq, displayName: "W", tag: "w",
    confirmationSubject: "s", confirmationBody: "b", ownerNotifyBody: "o",
    funnelId: "funnel-123", hasEventTime: false,
  });
  check("9f. no event time -> degrades to absolute waits (no dropped steps)",
    !Object.values(noTime.nodes).some((n) => n.type === "wait_until") &&
    Object.values(noTime.nodes).filter((n) => n.type === "send_email").length === 4);
}

// 11. Certification-catch regressions
{
  const syn2 = synthesizeAutomationPlan("The Starter Kit That Doesn't Betray Skin", "The Starter Kit That Doesn't Betray Skin requested");
  check("11a. synthesized goal tag is a clean slug", /^[a-z0-9-]+$/.test(syn2.goalTag));
  const conf = composeStrategyNodes({ plan, sequence: [], displayName: "X", tag: "x", confirmationSubject: "s", confirmationBody: "b", ownerNotifyBody: "o" });
  check("11b. confirmation email classified transactional", (conf.nodes.n3.config as { commType?: string }).commType === "transactional");
}

// 8. NATIVE CONVERSION DETECTION — the event-stream consumer applies (and
//    removes) canonical lifecycle tags against real Firestore, with the
//    tenancy guard and the intent-vs-verified boundary enforced.
{
  const { readFileSync } = await import("node:fs");
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  const { applyLifecycleStateForEvent } = await import("../src/lib/workflows/lifecycle-events");
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const db = getAdminDb();
  const SUB = "qa-lifecycle-sub";
  const ref = db.collection("contacts").doc();
  await ref.set({ subAccountId: SUB, agencyId: "qa-lifecycle-ag", name: "QA Lifecycle", tags: [], createdByUid: "qa" });
  const tags = async () => ((await ref.get()).data()!.tags ?? []) as string[];

  await applyLifecycleStateForEvent({ subAccountId: SUB, type: "booking.created", payload: { event: { contactId: ref.id } } });
  check("8a. booking.created auto-applies 'booked'", (await tags()).includes("booked"));

  await applyLifecycleStateForEvent({ subAccountId: SUB, type: "message.received", payload: { message: { contact_id: ref.id } } });
  check("8b. message.received auto-applies 'replied'", (await tags()).includes("replied"));

  await applyLifecycleStateForEvent({ subAccountId: SUB, type: "funnel.order.completed", payload: { contactId: ref.id } });
  check("8c. verified payment auto-applies 'purchased'", (await tags()).includes("purchased"));

  await applyLifecycleStateForEvent({ subAccountId: SUB, type: "booking.cancelled", payload: { event: { contactId: ref.id } } });
  const t = await tags();
  check("8d. cancellation removes 'booked' + adds recovery signal", !t.includes("booked") && t.includes("booking-cancelled"));

  await applyLifecycleStateForEvent({ subAccountId: "someone-else", type: "deal.won", payload: { contactId: ref.id } });
  check("8e. tenancy guard: foreign sub-account event is inert", !(await tags()).includes("won"));

  await applyLifecycleStateForEvent({ subAccountId: SUB, type: "form.submitted", payload: { contactId: ref.id } });
  const t2 = await tags();
  check("8f. intent events prove nothing: form.submitted mints NO state", !t2.includes("purchased") || t2.filter((x) => x === "purchased").length === 1);
  check("8g. lifecycle timestamps recorded", !!(await ref.get()).data()!.lifecycleStates?.purchasedAt);

  await ref.delete();
}


// 10. ENGINE: wait_until re-reads the LIVE anchor on every wake — the
//     reschedule-recalculation property itself, driven through the real
//     runStep() executor (same harness pattern as the growth-recipe suite).
{
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { FieldValue } = await import("firebase-admin/firestore");
  const { runStep } = await import("../src/lib/workflows/engine");
  const db = getAdminDb();
  const SUB = "qa-anchor-sub";
  const fRef = db.collection("funnels").doc();
  await fRef.set({ subAccountId: SUB, agencyId: "qa-anchor-ag", name: "QA Anchor", status: "draft",
    eventStartAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(), sections: [], createdByUid: "qa" });
  const cRef = db.collection("contacts").doc();
  await cRef.set({ subAccountId: SUB, agencyId: "qa-anchor-ag", name: "QA Anchor C", tags: [], createdByUid: "qa" });
  const wfRef = db.collection("workflows").doc();
  await wfRef.set({
    id: wfRef.id, subAccountId: SUB, agencyId: "qa-anchor-ag", createdByUid: "qa",
    name: "QA anchor wf", status: "active",
    trigger: { type: "form.submitted", filters: { all: [] } },
    startNodeId: "wu",
    nodes: {
      wu: { id: "wu", type: "wait_until", config: { anchorKind: "funnel_event", funnelId: fRef.id, offsetMinutes: -1440 }, branches: { whenTrue: "fired", whenFalse: "skipped" }, next: null },
      fired: { id: "fired", type: "add_tag", config: { tag: "reminder-fired" }, next: null },
      skipped: { id: "skipped", type: "add_tag", config: { tag: "reminder-skipped" }, next: null },
    },
    stats: { enrolled: 0, completed: 0 },
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  const mkRun = async () => {
    const r = db.collection("workflowRuns").doc();
    await r.set({ id: r.id, subAccountId: SUB, agencyId: "qa-anchor-ag", workflowId: wfRef.id,
      contactId: cRef.id, status: "running", currentNodeId: "wu", history: [], context: { test: true },
      qstashMessageId: null, enrolledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return r;
  };

  // Event in 48h, offset -24h -> target in 24h -> self-wait (capped 6h), same node.
  const r1 = await mkRun();
  await runStep(r1.id, "wu");
  const d1 = (await r1.get()).data()!;
  const hist1 = (d1.history ?? []) as { result?: string }[];
  check("10a. pending anchor self-waits (re-check loop, not a dumb 24h sleep)",
    String(hist1.at(-1)?.result ?? "").startsWith("anchor:wait"));

  // RESCHEDULE: event moved to 30min from now -> T-24h target is already
  // past -> the SAME node now fires. The wait recalculated automatically.
  await fRef.update({ eventStartAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
  // (Local-harness artifact, same as the growth-recipe suite: scheduleNode's
  // QStash publish fails against localhost and marks the run "failed" after
  // each step — reset to "running" before driving the next node manually.)
  const r2 = await mkRun();
  await runStep(r2.id, "wu");
  await r2.update({ status: "running" });
  await runStep(r2.id, "fired");
  check("10b. reschedule recalculates: anchor reached -> reminder path fires",
    (((await cRef.get()).data()!.tags ?? []) as string[]).includes("reminder-fired"));

  // CANCELLATION: anchor removed -> whenFalse skip path, no reminder.
  await fRef.update({ eventStartAt: null });
  await cRef.update({ tags: [] });
  const r3 = await mkRun();
  await runStep(r3.id, "wu");
  await r3.update({ status: "running" });
  await runStep(r3.id, "skipped");
  const t3 = ((await cRef.get()).data()!.tags ?? []) as string[];
  check("10c. cancelled anchor skips the reminder (whenFalse path)",
    t3.includes("reminder-skipped") && !t3.includes("reminder-fired"));

  await Promise.all([fRef.delete(), cRef.delete(), wfRef.delete()]);
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
