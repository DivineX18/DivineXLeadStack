/**
 * Regression coverage for the "Move deal stage" workflow action
 * (2026-11-11 Growth System E2E fix: a workflow's stage-move step updated
 * only `contact.pipelineStage`, never the associated $1,000 deal, so Reports
 * showed $0 won revenue after a fully automated lead-to-conversion run).
 *
 * Source-level contract checks, matching this repo's existing convention
 * (see verify-workflow-failure-is-explained.mts) rather than a live-Firestore
 * integration test — there is no emulator harness in this repo to exercise
 * getAdminDb() against. Each check below maps to one of the mission's
 * required scenarios; where a scenario is genuinely about runtime Firestore
 * state (one deal / many deals / no deal), the check instead verifies the
 * CODE PATH that must produce the right outcome exists and is ordered
 * correctly, and says so explicitly rather than claiming a live run.
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
const types = readFileSync("src/types/workflows.ts", "utf8");
const catalog = readFileSync("src/lib/workflows/catalog.ts", "utf8");
const dialog = readFileSync("src/components/workflows/node-config-dialog.tsx", "utf8");
const builder = readFileSync("src/components/workflows/workflow-builder.tsx", "utf8");
const formSubmit = readFileSync("src/app/api/forms/[id]/submit/route.ts", "utf8");
const dealsService = readFileSync("src/lib/server/deals-service.ts", "utf8");

console.log("\n1. New action exists and is wired everywhere a WorkflowNodeType must be");
check("move_deal_stage is a registered node type", /"move_deal_stage"/.test(types));
check("MoveDealStageConfig type exists", /interface MoveDealStageConfig/.test(types));
check("engine registers an executor for it", /move_deal_stage:\s*execMoveDealStage/.test(engine));
check("catalog has a human label", /move_deal_stage:\s*"Move deal stage"/.test(catalog));
check("catalog has a default config", /case "move_deal_stage":\s*\n\s*return \{ stageId: "new" \}/.test(catalog));
check("builder step picker offers it", /"move_deal_stage"/.test(catalog) && /ADDABLE_TYPES/.test(catalog));
check("the config dialog renders a stage picker for it", /step\.type === "move_deal_stage"/.test(dialog));
check("the builder assigns it an icon (TypeScript's exhaustive Record would fail the build otherwise)", /move_deal_stage:\s*TrendingUp/.test(builder));

console.log("\n2. Backward compatibility: the ORIGINAL move_stage action is untouched");
const execMoveStageBody = engine.slice(
  engine.indexOf("const execMoveStage: NodeExecutor"),
  engine.indexOf("const execMoveStage: NodeExecutor") + 400,
);
check("execMoveStage still only writes contacts/{id}.pipelineStage", /contacts\/\$\{ctx\.contact\.id\}/.test(execMoveStageBody));
check("execMoveStage never touches the deals collection", !/collection\("deals"\)|doc\(`deals/.test(execMoveStageBody));
check("move_stage keeps its original registry entry (not replaced)", /move_stage:\s*execMoveStage,/.test(engine));
check("existing move_stage node type was not removed", /"move_stage"/.test(types));

console.log("\n3. Deal resolution is deterministic, never an arbitrary pick among several");
const resolveBody = engine.slice(
  engine.indexOf("async function resolveTargetDeal"),
  engine.indexOf("async function resolveTargetDeal") + 1600,
);
check("resolveTargetDeal exists", resolveBody.length > 100);
check("an explicit trigger-context dealId is checked FIRST", /ctx\.triggerContext\?\.dealId/.test(resolveBody) && resolveBody.indexOf("triggerContext") < resolveBody.indexOf("candidates"));
check("the explicit dealId path re-verifies subAccountId (cross-tenant guard, not trust-by-id)", /snap\.data\(\)\?\.subAccountId !== ctx\.subAccountId/.test(resolveBody));
check("the fallback query scopes by BOTH subAccountId and contactId (no cross-contact, no cross-tenant match)", /where\("subAccountId", "==", ctx\.subAccountId\)/.test(resolveBody) && /where\("contactId", "==", ctx\.contact\.id\)/.test(resolveBody));
check("zero candidate deals is a named failure, not a silent skip-as-success", /candidates\.empty.*"no_deal"|"no_deal".*candidates\.empty|reason: "no_deal"/.test(resolveBody));
check("more than one candidate deal is REFUSED, not arbitrarily picked (no .docs[0] taken when size > 1)", /candidates\.size > 1/.test(resolveBody) && /reason: "ambiguous_deal"/.test(resolveBody));
// The one place a specific doc IS taken must be gated behind the exact-one-match branch, not before it.
const sizeCheckIdx = resolveBody.indexOf("candidates.size > 1");
const firstDocsZeroIdx = resolveBody.indexOf("docs[0]");
check("docs[0] is only read AFTER the ambiguous-count guard has already run", firstDocsZeroIdx > sizeCheckIdx && sizeCheckIdx > -1);

console.log("\n4. Tenancy: the target deal can only ever be one that belongs to this sub-account");
const execMoveDealStageBody = engine.slice(
  engine.indexOf("const execMoveDealStage: NodeExecutor"),
  engine.indexOf("const execMoveDealStage: NodeExecutor") + 2200,
);
check("execMoveDealStage passes expectedSubAccountId to claimAndMoveDealStageServerSide (the tenancy guard that function itself enforces)", /expectedSubAccountId:\s*target\.subAccountId/.test(execMoveDealStageBody));
check(
  "execMoveDealStage reuses claimAndMoveDealStageServerSide rather than writing to deals/ directly (no unrelated-deal / bypassed-activity-log risk)",
  /claimAndMoveDealStageServerSide/.test(execMoveDealStageBody) && !/doc\(`deals\/\$\{target\.id\}`\)\.update/.test(execMoveDealStageBody),
);

console.log("\n5. Invalid / missing stage config is rejected before any Firestore write");
check("an empty stage config is skipped, not silently written", /if \(!stageId\) return \{ result: \{ kind: "next" \}, log: "skipped:no_stage" \};/.test(execMoveDealStageBody));
check("a stage id outside the real pipeline stages is rejected", /VALID_STAGE_IDS\.includes\(stageId\)/.test(execMoveDealStageBody) && /error:invalid_stage/.test(execMoveDealStageBody));
check("the invalid-stage check runs BEFORE any deal lookup (no wasted/incorrect write attempt)", execMoveDealStageBody.indexOf("invalid_stage") < execMoveDealStageBody.indexOf("resolveTargetDeal"));

console.log("\n6. A permanent failure is a TERMINAL outcome, never reported as a successful step");
check(
  "an invalid stage config is a terminal failure (kind: \"failed\"), not a soft error:-and-continue",
  /if \(!VALID_STAGE_IDS\.includes\(stageId\)\) \{\s*\n\s*return \{\s*\n\s*result: \{\s*\n\s*kind: "failed",/.test(execMoveDealStageBody),
);
check(
  "an unresolvable target deal (resolveTargetDeal failure) is a terminal failure, not a soft error:-and-continue",
  /if \(!target\.ok\) \{\s*\n\s*return \{\s*\n\s*result: \{\s*\n\s*kind: "failed",/.test(execMoveDealStageBody),
);
check(
  "a target deal that vanished before the claim transaction is ALSO a terminal failure, not a soft error:-and-continue",
  /if \(!outcome\.ok\) \{\s*\n\s*return \{\s*\n\s*result: \{\s*\n\s*kind: "failed",/.test(execMoveDealStageBody),
);
check("every terminal failure still carries the original error:-prefixed log string for history continuity", /log: `error:\$\{target\.reason\}`/.test(execMoveDealStageBody) && /log: `error:\$\{outcome\.reason\}`/.test(execMoveDealStageBody));

console.log("\n7. Concurrency + atomicity — a genuinely concurrent duplicate invocation cannot produce duplicate side effects, AND a failed write cannot leave a dangling claim");
// runStep's own guard (`run.history.some((h) => h.nodeId === nodeId)`) is a
// plain read-before-execute check: it does NOT by itself prevent two
// OVERLAPPING invocations of the same (run, node) from both passing it
// before either has appended to history. These checks verify the actual
// safeguard — the claim and the deal mutation staged in ONE transaction in
// deals-service.ts — not just the pre-existing sequential guard, which
// alone is NOT sufficient evidence of concurrency safety.
const claimFnBody = dealsService.slice(
  dealsService.indexOf("export async function claimAndMoveDealStageServerSide"),
  dealsService.indexOf("export async function claimAndMoveDealStageServerSide") + 2600,
);
check("the combined claim+move function exists", claimFnBody.length > 100);
check("it uses a real Firestore TRANSACTION, not a plain get-then-set (which would NOT be concurrency-safe)", /runTransaction</.test(claimFnBody));
check("the transaction reads the claim doc FIRST and bails with no writes if it already exists", /if \(claimSnap\.exists\) return \{ claimed: false \};/.test(claimFnBody));
check(
  "the claim write (tx.set) AND the deal mutation (tx.update) are staged in the SAME transaction — a failure on either rolls back both",
  (() => {
    const setIdx = claimFnBody.indexOf("tx.set(claimRef");
    const updateIdx = claimFnBody.indexOf("tx.update(dealRef");
    const txStart = claimFnBody.indexOf("runTransaction<");
    return setIdx > txStart && updateIdx > txStart && setIdx < updateIdx;
  })(),
);
check("execMoveDealStage calls the combined claim+move function AFTER resolving the target deal (no wasted claim on an unresolvable target)", execMoveDealStageBody.indexOf("resolveTargetDeal") < execMoveDealStageBody.indexOf("claimAndMoveDealStageServerSide"));
check("a lost claim race backs off cleanly (skips, does not error, does not retry into a second write)", /if \(!outcome\.claimed\) \{\s*\n\s*return \{ result: \{ kind: "next" \}, log: "skipped:duplicate_invocation" \};/.test(execMoveDealStageBody));
check("the claim is scoped per (runId, nodeId) — a legitimate different run or a different step is never blocked by another's claim", /dealStageClaims\/\$\{opts\.nodeId\}/.test(claimFnBody) && /workflowRuns\/\$\{opts\.runId\}/.test(claimFnBody));
check("execMoveDealStage creates no new deal (no duplicate-deal risk distinct from the claim question)", !/createDealServerSide/.test(execMoveDealStageBody));
check(
  "the deal mutation inside the transaction re-verifies tenancy against a transactionally-fresh read, not a stale pre-transaction snapshot",
  /dealSnap\.data\(\)\?\.subAccountId !== opts\.expectedSubAccountId/.test(claimFnBody),
);
check(
  "side effects (activity/webhook/trigger) are deliberately NOT inside the transaction — applyDealUpdateSideEffects is called only after the transaction resolves",
  (() => {
    const txEnd = claimFnBody.indexOf("});", claimFnBody.indexOf("runTransaction<")) ;
    const sideEffectsIdx = claimFnBody.indexOf("applyDealUpdateSideEffects(");
    return txEnd > -1 && sideEffectsIdx > txEnd;
  })(),
);

console.log("\n8. Reporting reflects the actual persisted deal state (no separate reporting-side fix needed)");
check("updateDealServerSide persists stageId with a real Firestore write (merge), which is what Reports reads directly", /write\.stageId = patch\.stageId;/.test(dealsService) && /await ref\.set\(write, \{ merge: true \}\);/.test(dealsService));

console.log("\n9. form.submitted now threads the deal it just created, closing the exact gap the E2E test hit");
check("fireWorkflowTrigger's context for form.submitted carries dealId", /context: \{ formId: id, formName: form\.name, formData, dealId \}/.test(formSubmit));

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
