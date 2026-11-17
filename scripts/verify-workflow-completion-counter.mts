/**
 * Regression coverage for the workflow completion-counter fix.
 *
 * History: a real staging form-to-deal automation ran to completion —
 * contact created, deal created, move_deal_stage executed, run status
 * flipped to "completed" — but the workflow's `stats.completed` stayed at
 * 0 (`stats.enrolled` correctly read 1). The first fix added a completion
 * claim, but created it in its OWN transaction, separate from the
 * stats.completed increment — which left a narrower gap: a failed
 * increment could leave a successful claim behind, permanently recording
 * "this run was counted" for a run that never actually incremented
 * anything. This pass folds the claim and the increment into ONE
 * transaction, so they can only ever commit together.
 *
 * Source-level contract checks, matching this repo's existing convention
 * (see verify-move-deal-stage.mts, verify-workflow-failure-is-explained.mts)
 * rather than a live-Firestore integration test — there is no emulator
 * harness in this repo to exercise getAdminDb() against. Each check maps to
 * one of the mission's required scenarios.
 */
import { readFileSync } from "node:fs";

let pass = 0;
const failures: string[] = [];
const check = (n: string, ok: boolean, d = "") => {
  if (ok) {
    pass++;
    console.log(`  ok   ${n}`);
  } else {
    failures.push(`${n}${d ? ` | ${d}` : ""}`);
    console.log(`  FAIL ${n}${d ? ` | ${d}` : ""}`);
  }
};

const engine = readFileSync("src/lib/workflows/engine.ts", "utf8");
const dealsServiceSrc = readFileSync("src/lib/server/deals-service.ts", "utf8");

function sliceFunction(src: string, marker: string): string {
  const start = src.indexOf(marker);
  if (start === -1) return "";
  const end = src.indexOf("\n}\n", start);
  return end === -1 ? src.slice(start) : src.slice(start, end + 2);
}

const completeRunBody = sliceFunction(engine, "async function completeRun(");
const claimFnBody = sliceFunction(
  engine,
  "async function claimAndCountRunCompletion",
);

console.log("\n1. Single transaction: the claim and the increment are staged together, not as two separate writes");
check("completeRun's body was located", completeRunBody.length > 200);
check("the dedicated claim+count function was located", claimFnBody.length > 100);
check(
  "the OLD two-transaction design (a standalone claimRunCompletion returning a boolean) is gone",
  !/async function claimRunCompletion\(/.test(engine),
);
check(
  "exactly one runTransaction call backs the whole claim+increment operation",
  (claimFnBody.match(/runTransaction\(/g) ?? []).length === 1,
);
check(
  "the transaction reads the claim doc FIRST and bails with no writes if it already exists",
  /const existing = await tx\.get\(claimRef\);\s*\n\s*if \(existing\.exists\) return;/.test(claimFnBody),
);
check(
  "the claim write (tx.set) is staged inside the SAME transaction as the increment (tx.update), not a separate one",
  (() => {
    const setIdx = claimFnBody.indexOf("tx.set(claimRef");
    const updateIdx = claimFnBody.indexOf("tx.update(workflowRef");
    const txStart = claimFnBody.indexOf("runTransaction(");
    const txEnd = claimFnBody.indexOf("});", Math.max(setIdx, updateIdx));
    return setIdx > txStart && updateIdx > txStart && setIdx < txEnd && updateIdx < txEnd;
  })(),
);
check(
  "the increment targets the right document and field",
  /tx\.update\(workflowRef, \{ "stats\.completed": FieldValue\.increment\(1\) \}\);/.test(claimFnBody),
);
check(
  "the claim doc path is scoped per run, under workflowRuns, not under the workflow itself",
  /workflowRuns\/\$\{runId\}\/completionClaims\/completed/.test(claimFnBody),
);

console.log("\n2. A failed increment cannot leave a successful claim behind (the exact gap this pass closes)");
check(
  "the claim (tx.set) and the increment (tx.update) are both inside the same try/transaction — a failure on either rolls back both",
  (() => {
    const txFnStart = claimFnBody.indexOf("await db.runTransaction(async (tx) => {");
    const setIdx = claimFnBody.indexOf("tx.set(claimRef");
    const updateIdx = claimFnBody.indexOf("tx.update(workflowRef");
    return txFnStart > -1 && setIdx > txFnStart && updateIdx > txFnStart;
  })(),
);
check(
  "the completionClaims path appears exactly once in the whole file — one function owns it, there is no second write site elsewhere",
  (engine.match(/completionClaims\/completed/g) ?? []).length === 1,
);
check(
  "that one function stages exactly one claim write (tx.set) — the claim is not written anywhere outside this transaction",
  (claimFnBody.match(/tx\.set\(claimRef/g) ?? []).length === 1,
);

console.log("\n3. Observability: a transaction failure is logged with the run id, the workflow id, and the real error — never swallowed");
check(
  "completeRun wraps the claim+count call in try/catch, not a bare .catch(() => {})",
  /try \{\s*\n\s*await claimAndCountRunCompletion\(runRef\.id, workflowId\);\s*\n\s*\} catch \(err\) \{/.test(completeRunBody),
);
check(
  "the catch logs both ids and the real error object (not a swallowed/empty handler)",
  /console\.error\(\s*\n\s*`\[workflows\] completeRun: completion-count transaction failed for workflow \$\{workflowId\} \(run \$\{runRef\.id\}\)`,\s*\n\s*err\s*\n\s*\);/.test(completeRunBody),
);
check(
  "no bare `.catch(() => {})` remains as executable code in completeRun (the old pattern is only mentioned in a prose comment now, explaining what was fixed)",
  completeRunBody
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .every((line) => !/\.catch\(\(\)\s*=>\s*\{\}\)/.test(line)),
);

console.log("\n4. Idempotency: concurrent / duplicate / retried completions increment the counter at most once");
// runStep's own guard (`run.history.some((h) => h.nodeId === nodeId)`) is a
// plain read-before-execute check — it does not by itself stop two
// OVERLAPPING invocations of runStep for the same (run, node) from both
// reaching completeRun() before either has appended to history. These
// checks verify the actual safeguard (the atomic transaction), mirroring
// the already-shipped claimDealStageMove pattern, not just the
// pre-existing sequential guard, which alone is not sufficient evidence of
// concurrency safety.
check(
  "Firestore's own commit-time conflict detection is what prevents a double-increment: two concurrent transactions both targeting claimRef cannot both see it absent and both write — the loser is re-run and observes existing.exists",
  /if \(existing\.exists\) return;/.test(claimFnBody),
);
check(
  "a lost race (claim already exists) is NOT treated as an error — the transaction just returns with no writes staged",
  (() => {
    const idx = claimFnBody.indexOf("if (existing.exists) return;");
    const after = claimFnBody.slice(idx, idx + 80);
    return idx > -1 && !/console\.error/.test(after);
  })(),
);
check(
  "runStep still exits early once a run is no longer running/waiting, so a QStash retry after a successful completion never even calls completeRun again",
  /if \(run\.status !== "running" && run\.status !== "waiting"\) return;/.test(engine),
);
check(
  "this is a SEPARATE claim subcollection from move_deal_stage's dealStageClaims (existing idempotency claims untouched)",
  /completionClaims/.test(claimFnBody) && !/dealStageClaims/.test(claimFnBody),
);

console.log("\n5. Retry after transaction failure: a later completion attempt for the SAME run can still succeed once the cause clears");
check(
  "the claim check is a live read on every call (not a cached/in-memory flag), so a retry naturally re-evaluates current Firestore state",
  /const existing = await tx\.get\(claimRef\);/.test(claimFnBody),
);
check(
  "a failed transaction leaves no partial claim doc behind to block a later legitimate retry (covered by check 2's same-transaction guarantee above)",
  (claimFnBody.match(/tx\.set\(claimRef/g) ?? []).length === 1,
);

console.log("\n6. Missing workflow document: a transaction failure here does not propagate out of completeRun or crash the request");
check(
  "the entire claimAndCountRunCompletion call (whose tx.update would throw NOT_FOUND if the workflow doc is gone) is wrapped in a local try/catch inside completeRun",
  /try \{\s*\n\s*await claimAndCountRunCompletion/.test(completeRunBody),
);

console.log("\n7. Consistency: run status is independent of the counting transaction, by deliberate design (documented risk + recovery)");
check(
  "the run is marked completed BEFORE the counting transaction is attempted, unconditionally",
  completeRunBody.indexOf('status: "completed"') <
    completeRunBody.indexOf("claimAndCountRunCompletion(runRef.id, workflowId)"),
);
check(
  "the run-status write is a plain runRef.update, not folded into the counting transaction (deliberate — see the function's own comment for why)",
  !/tx\.update\(runRef/.test(claimFnBody),
);
check(
  "the deliberate risk + recovery path is documented in source, not just in a report (stats.completed is a cache of workflowRuns, not the source of truth)",
  /stats\.completed` is a denormalized cache/.test(completeRunBody) && /source of truth/.test(completeRunBody),
);
check(
  "existing workflow behavior is unchanged: completeRun is still invoked from exactly the same 3 call sites (no new entry/exit path introduced)",
  engine.split("completeRun(runRef, run.workflowId)").length - 1 === 3,
);

console.log("\n8. No unrelated workflow statistics are touched by this fix");
check(
  "stats.enrolled is untouched by this change (still only written from enroll())",
  /\.update\(\{\s*"stats\.enrolled":\s*FieldValue\.increment\(1\)\s*\}\)/.test(engine),
);
check(
  "completeRun's own patch to the run doc is unchanged in shape (status + currentNodeId + updatedAt, nothing added or removed)",
  /status: "completed",\s*\n\s*currentNodeId: null,\s*\n\s*updatedAt: FieldValue\.serverTimestamp\(\),/.test(completeRunBody),
);

console.log("\n9. Authoritative workflow id: completion never trusts wf.id read off wfSnap.data()");
// The real staging failure: "NOT_FOUND: No document to update:
// .../workflows/undefined". `wf.id` is only populated when a workflow
// document happens to store a redundant `id` field alongside its real
// Firestore-assigned id — scripts/seed-onboarding-workflow.mts and
// scripts/seed-divinex-reconnect-series.mts both write workflows/* docs
// WITHOUT that field, so `wf.id` is undefined for any workflow created that
// way even though the document genuinely exists. `run.workflowId` is not
// vulnerable to this: it is set once, at enroll() time, from the workflow
// snapshot's own `.id` (see fireWorkflowTrigger's `{ id: doc.id, ...}` and
// enrollForTest's `{ id: wfSnap.id, ...}` below) — never from `.data().id`.
const runStepBody = sliceFunction(engine, "export async function runStep(");
check("runStep's body was located", runStepBody.length > 500);
check(
  "wf.id is no longer used anywhere inside runStep (the exact field that was undefined in the staging failure)",
  !/\bwf\.id\b/.test(runStepBody),
);
check(
  "all 3 completion call sites inside runStep pass run.workflowId specifically",
  (runStepBody.match(/completeRun\(runRef, run\.workflowId\)/g) ?? []).length === 3,
);
check(
  "run.workflowId is read from the run document (not re-derived from the workflow document's own data) before any completion call site uses it",
  runStepBody.indexOf("const wfSnap = await db.doc(`workflows/${run.workflowId}`)") <
    Math.min(...["node) {", "result.kind === \"end\"", "if (!target)"].map((m) => runStepBody.indexOf(m)).filter((i) => i > -1)),
);
check(
  "enroll()'s own wf.id usage remains safe and untouched — its callers always attach a real snapshot .id (fireWorkflowTrigger's `{ id: doc.id, ...}`, enrollForTest's `{ id: wfSnap.id, ...}`), unlike runStep's bare wfSnap.data() cast",
  /const wf = \{ id: doc\.id, \.\.\.\(doc\.data\(\) as Omit<WorkflowDoc, "id">\) \};/.test(engine) &&
    /const wf = \{ id: wfSnap\.id, \.\.\.\(wfSnap\.data\(\) as Omit<WorkflowDoc, "id">\) \};/.test(engine),
);

console.log("\n10. Explicit guard: a missing/invalid workflow id produces a clear diagnostic instead of targeting workflows/undefined");
check(
  "completeRun refuses to proceed when workflowId is falsy, BEFORE calling claimAndCountRunCompletion (which is what would construct the bad doc reference)",
  (() => {
    const guardIdx = completeRunBody.indexOf("if (!workflowId)");
    const callIdx = completeRunBody.indexOf("await claimAndCountRunCompletion(runRef.id, workflowId)");
    return guardIdx > -1 && guardIdx < callIdx;
  })(),
);
check(
  "the guard logs a clear diagnostic naming the run id, instead of silently doing nothing or substituting a different workflow",
  /console\.error\(\s*\n\s*`\[workflows\] completeRun: refusing to count completion for run \$\{runRef\.id\}/.test(completeRunBody),
);
check(
  "the guard returns immediately without ever reaching the transaction call (no accidental fallthrough)",
  (() => {
    const guardIdx = completeRunBody.indexOf("if (!workflowId)");
    const block = completeRunBody.slice(guardIdx, guardIdx + 400);
    return /if \(!workflowId\) \{\s*\n\s*console\.error\(/.test(block) && /\n\s*return;\s*\n\s*\}/.test(block);
  })(),
);

console.log("\n11. Preservation: deal-stage idempotency, run history, and run-status transitions are untouched by this change");
// move_deal_stage's claim mechanism was legitimately redesigned in a LATER,
// separate pass (the recovery-hardening fix: claimDealStageMove's own
// claim-before-write ordering was itself a confirmed defect, folded into
// claimAndMoveDealStageServerSide in deals-service.ts). This check now
// verifies the one thing that pass was required to preserve — idempotency
// scoped to the dealStageClaims subcollection per (runId, nodeId) — rather
// than pinning to a since-superseded function name.
check(
  "move_deal_stage idempotency is still scoped to the same workflowRuns/{runId}/dealStageClaims/{nodeId} path this fix never touched (now implemented in deals-service.ts, not engine.ts — a later, separate, authorized redesign)",
  /dealStageClaims\/\$\{opts\.nodeId\}/.test(dealsServiceSrc) && /workflowRuns\/\$\{opts\.runId\}/.test(dealsServiceSrc),
);
check(
  "runStep still appends to run.history via arrayUnion before any completion call site (history is never skipped)",
  runStepBody.indexOf("history: FieldValue.arrayUnion(entry)") <
    runStepBody.indexOf('if (result.kind === "end")'),
);
check(
  "the run-status transition to completed is byte-identical in shape to before (status + currentNodeId + updatedAt)",
  /status: "completed",\s*\n\s*currentNodeId: null,\s*\n\s*updatedAt: FieldValue\.serverTimestamp\(\),/.test(completeRunBody),
);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
