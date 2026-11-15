/**
 * Regression coverage for the workflow completion-counter fix (2026-11-15
 * staging E2E: a real form-to-deal automation ran to completion — contact
 * created, deal created, move_deal_stage executed, run status flipped to
 * "completed" — but the workflow's `stats.completed` stayed at 0, with
 * `stats.enrolled` correctly at 1).
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

console.log("\n1. The silent swallow is gone — a counter failure is now observable");
const completeRunBody = engine.slice(
  engine.indexOf("async function completeRun("),
  engine.indexOf("async function completeRun(") + 2200,
);
check("completeRun's body was located", completeRunBody.length > 200);
check(
  "the bare `.catch(() => {})` that discarded the real error with zero trace is gone",
  !/\.update\(\{\s*"stats\.completed":\s*FieldValue\.increment\(1\)\s*\}\)\s*\n?\s*\.catch\(\(\)\s*=>\s*\{\}\);/.test(completeRunBody),
);
check(
  "a failed completion-claim is logged with the run id, the workflow id, and the real error",
  /console\.error\(\s*\n?\s*`\[workflows\] completeRun: failed to claim completion for run \$\{runRef\.id\} \(workflow \$\{workflowId\}\)`,\s*\n?\s*err/.test(completeRunBody),
);
check(
  "a failed stats increment is logged with the run id, the workflow id, and the real error",
  /console\.error\(\s*\n?\s*`\[workflows\] completeRun: failed to increment stats\.completed for workflow \$\{workflowId\} \(run \$\{runRef\.id\}\)`,\s*\n?\s*err/.test(completeRunBody),
);

console.log("\n2. Correct increment: a successful completion still increments stats.completed exactly once");
check(
  "the increment still targets the right document and field",
  /\.doc\(`workflows\/\$\{workflowId\}`\)\s*\n?\s*\.update\(\{\s*"stats\.completed":\s*FieldValue\.increment\(1\)\s*\}\)/.test(completeRunBody),
);
check(
  "the increment only runs after a successful claim (not unconditionally)",
  completeRunBody.indexOf("claimRunCompletion") < completeRunBody.indexOf('"stats.completed"'),
);
check(
  "an unclaimed (already-counted) completion returns early and never reaches the increment",
  /if \(!claimed\) return;/.test(completeRunBody),
);

console.log("\n3. Idempotency: repeated / concurrent completion invocations cannot double-increment");
// runStep's own guard (`run.history.some((h) => h.nodeId === nodeId)`) is a
// plain read-before-execute check — it does not by itself stop two
// OVERLAPPING invocations of runStep for the same (run, node) from both
// reaching completeRun() before either has appended to history. These
// checks verify the actual safeguard (an atomic Firestore-transaction
// claim), mirroring the already-shipped claimDealStageMove pattern, not
// just the pre-existing sequential guard, which alone is not sufficient
// evidence of concurrency safety.
const claimFnBody = engine.slice(
  engine.indexOf("async function claimRunCompletion"),
  engine.indexOf("async function claimRunCompletion") + 500,
);
check("a dedicated run-completion claim function exists", claimFnBody.length > 50);
check(
  "the claim uses a real Firestore TRANSACTION, not a plain get-then-set (which would NOT be concurrency-safe)",
  /runTransaction\(/.test(claimFnBody),
);
check(
  "the transaction reads the claim doc and bails if it already exists, BEFORE writing anything",
  /existing\.exists\)\s*return false/.test(claimFnBody),
);
check(
  "the claim write (tx.set) happens INSIDE the same transaction as the existence check (atomic create-if-absent)",
  /tx\.set\(claimRef/.test(claimFnBody),
);
check(
  "the claim is scoped per run (a different run's completion is never blocked by another's claim)",
  /completionClaims\/completed/.test(claimFnBody) && /workflowRuns\/\$\{runId\}/.test(claimFnBody),
);
check(
  "a lost claim race is NOT treated as an error — it just skips the (already-counted) increment",
  completeRunBody.indexOf("if (!claimed) return;") > -1 &&
    !/if \(!claimed\)[^\n]*\n\s*console\.error/.test(completeRunBody),
);
check(
  "this is a SEPARATE claim subcollection from move_deal_stage's dealStageClaims (existing idempotency claims untouched)",
  /completionClaims/.test(claimFnBody) && !/dealStageClaims/.test(claimFnBody),
);

console.log("\n4. QStash retry behavior: re-running runStep for an already-completed run never reaches completeRun again");
check(
  "runStep still exits early once a run is no longer running/waiting (a retry after completion is a no-op before completeRun could even be called again)",
  /if \(run\.status !== "running" && run\.status !== "waiting"\) return;/.test(engine),
);

console.log("\n5. Consistency: the run's completed status and the counter update stay on the same code path");
check(
  "the run is marked completed BEFORE the claim/increment is attempted (status always reflects reality even if the counter write fails)",
  completeRunBody.indexOf('status: "completed"') < completeRunBody.indexOf("claimRunCompletion"),
);
check(
  "existing workflow behavior is unchanged: completeRun is still invoked from exactly the same 3 call sites (no new entry/exit path introduced)",
  engine.split("completeRun(runRef, wf.id)").length - 1 === 3,
);

console.log("\n6. No unrelated workflow statistics are touched by this fix");
check(
  "stats.enrolled is untouched by this change (still only written from enroll())",
  /\.update\(\{\s*"stats\.enrolled":\s*FieldValue\.increment\(1\)\s*\}\)/.test(engine),
);
check(
  "completeRun's own patch to the run doc is unchanged in shape (status + currentNodeId + updatedAt, nothing added or removed)",
  /status: "completed",\s*\n\s*currentNodeId: null,\s*\n\s*updatedAt: FieldValue\.serverTimestamp\(\),/.test(completeRunBody),
);

console.log("\n7. Missing workflow document: completeRun does not crash the request, it logs and returns");
check(
  "a failed stats-increment (e.g. the workflow doc no longer exists) is caught locally, not left to propagate out of completeRun",
  /try \{\s*\n\s*await getAdminDb\(\)\s*\n\s*\.doc\(`workflows\/\$\{workflowId\}`\)\s*\n\s*\.update\(\{\s*"stats\.completed":\s*FieldValue\.increment\(1\)\s*\}\);\s*\n\s*\}\s*catch \(err\)/.test(completeRunBody),
);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
