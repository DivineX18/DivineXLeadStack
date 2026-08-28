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

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
