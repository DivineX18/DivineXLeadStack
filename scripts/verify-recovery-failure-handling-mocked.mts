/**
 * Executable regression tests for DIVINEX FLOW — RECOVERY HARDENING
 * (FLOW-E2E-RECOVERY-001 corrections).
 *
 * History: FLOW-E2E-RECOVERY-001's source-inspection phase found three
 * confirmed defects, each proven here by an earlier version of this file
 * against the UNFIXED engine (preserved in git history / the prior report):
 *
 *   1. move_deal_stage's claim committed in its own transaction, separate
 *      from the deal write — a transient failure between them permanently
 *      and silently skipped the move on every future delivery.
 *   2. No action could signal a TERMINAL failure — a permanent condition
 *      (e.g. ambiguous_deal) still let the run reach "completed" and
 *      stats.completed still incremented.
 *   3. create_task / create_deal had no idempotency protection at all — a
 *      genuine throw-then-retry or true concurrent redelivery could create
 *      a duplicate record.
 *
 * This version proves each correction: Finding 1 is closed by
 * claimAndMoveDealStageServerSide() (one transaction for the claim AND the
 * deal mutation — src/lib/server/deals-service.ts). Finding 2 is closed by
 * the new `{kind: "failed"}` StepResult, which runStep() turns into
 * `status: "failed"` with no completion claim and no stats.completed
 * increment. Finding 3 is closed by an optional `idempotencyKey` on
 * createTaskServerSide()/createDealServerSide(), backed by Firestore's
 * atomic `DocumentReference.create()` (ALREADY_EXISTS on a duplicate).
 *
 * Runs the REAL runStep()/engine code (and, for the create_task/create_deal
 * cases, the real creation-service functions) against a mocked Firestore —
 * not source-text pattern matching. Run via:
 *   npx tsx --test --experimental-test-module-mocks --conditions=react-server \
 *     scripts/verify-recovery-failure-handling-mocked.mts
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

type Json = Record<string, unknown>;

function isIncrement(v: unknown): v is { operand: number } {
  return !!v && typeof v === "object" && (v as object).constructor?.name === "NumericIncrementTransform";
}
function isServerTimestamp(v: unknown): boolean {
  return !!v && typeof v === "object" && (v as object).constructor?.name === "ServerTimestampTransform";
}
function isArrayUnion(v: unknown): v is { elements: unknown[] } {
  return !!v && typeof v === "object" && (v as object).constructor?.name === "ArrayUnionTransform";
}

function applyPatch(current: Json, patch: Json): Json {
  const next: Json = { ...current };
  for (const [key, rawValue] of Object.entries(patch)) {
    let value = rawValue;
    const parts = key.split(".");
    const setAt = (mutator: (cursor: Json, lastKey: string) => void) => {
      let cursor: Json = next;
      for (let i = 0; i < parts.length - 1; i++) {
        const existing = cursor[parts[i]];
        cursor[parts[i]] = typeof existing === "object" && existing ? existing : {};
        cursor = cursor[parts[i]] as Json;
      }
      mutator(cursor, parts[parts.length - 1]);
    };
    if (isIncrement(value)) {
      setAt((cursor, last) => {
        cursor[last] = ((cursor[last] as number | undefined) ?? 0) + value.operand;
      });
      continue;
    }
    if (isArrayUnion(value)) {
      setAt((cursor, last) => {
        const arr = Array.isArray(cursor[last]) ? (cursor[last] as unknown[]) : [];
        cursor[last] = [...arr, ...value.elements];
      });
      continue;
    }
    if (isServerTimestamp(value)) value = "MOCK_TIMESTAMP";
    setAt((cursor, last) => {
      cursor[last] = value;
    });
  }
  return next;
}

class AlreadyExistsError extends Error {
  code = 6;
  constructor(path: string) {
    super(`ALREADY_EXISTS: ${path}`);
  }
}

let transactionQueue: Promise<void> = Promise.resolve();

/** In-memory Firestore: doc get/update/set/create, a two-predicate equality
 *  query, nested collections (for activity sub-collections), and a
 *  runTransaction that stages writes and only applies them if the
 *  transaction function does not throw — serialized so a second
 *  transaction's tx.get() correctly observes the first's already-committed
 *  write, approximating Firestore's own conflict detection for the single-
 *  document races this engine actually produces. */
function createFakeDb(seed: Record<string, Json | undefined>) {
  const store = new Map<string, Json | undefined>(Object.entries(seed));

  function collectionBuilder(name: string) {
    const predicates: Array<[string, string, unknown]> = [];
    const builder = {
      doc(id?: string) {
        const docId = id ?? `generated_${Math.random().toString(36).slice(2)}`;
        return refFor(`${name}/${docId}`);
      },
      where(field: string, op: string, value: unknown) {
        predicates.push([field, op, value]);
        return builder;
      },
      async get() {
        const prefix = `${name}/`;
        const docs = [...store.entries()]
          .filter(([path, data]) => path.startsWith(prefix) && data !== undefined && !path.slice(prefix.length).includes("/"))
          .filter(([, data]) => predicates.every(([field, , value]) => (data as Json)[field] === value))
          .map(([path, data]) => {
            const id = path.slice(prefix.length);
            return { id, data: () => data as Json };
          });
        return { empty: docs.length === 0, size: docs.length, docs };
      },
      async add(data: Json) {
        const ref = this.doc();
        await ref.set(data);
        return ref;
      },
    };
    return builder;
  }

  function refFor(path: string) {
    const segments = path.split("/");
    const id = segments[segments.length - 1];
    return {
      id,
      path,
      async get() {
        const data = store.get(path);
        return { exists: data !== undefined, id, data: () => data };
      },
      async update(patch: Json) {
        const existing = store.get(path);
        if (existing === undefined) {
          throw new Error(`NOT_FOUND: No document to update: mock://${path}`);
        }
        store.set(path, applyPatch(existing, patch));
      },
      async set(data: Json, opts?: { merge?: boolean }) {
        const existing = store.get(path);
        store.set(path, opts?.merge && existing ? applyPatch(existing, data) : { ...data });
      },
      async create(data: Json) {
        if (store.get(path) !== undefined) throw new AlreadyExistsError(path);
        store.set(path, { ...data });
      },
      collection(subName: string) {
        return collectionBuilder(`${path}/${subName}`);
      },
    };
  }

  return {
    collection(name: string) {
      return collectionBuilder(name);
    },
    doc(path: string) {
      return refFor(path);
    },
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const previous = transactionQueue;
      let release!: () => void;
      transactionQueue = new Promise((r) => (release = r));
      await previous;
      try {
        const before = new Map(store);
        const staged: Array<() => void> = [];
        const tx = {
          async get(ref: ReturnType<typeof refFor>) {
            return ref.get();
          },
          set(ref: ReturnType<typeof refFor>, data: Json) {
            staged.push(() => store.set(ref.path, data));
          },
          update(ref: ReturnType<typeof refFor>, patch: Json) {
            staged.push(() => {
              const existing = store.get(ref.path);
              if (existing === undefined) {
                throw new Error(`NOT_FOUND: No document to update: mock://${ref.path}`);
              }
              store.set(ref.path, applyPatch(existing, patch));
            });
          },
        };
        try {
          const result = await fn(tx);
          for (const apply of staged) apply();
          return result;
        } catch (err) {
          store.clear();
          for (const [k, v] of before) store.set(k, v);
          throw err;
        }
      } finally {
        release();
      }
    },
    _dump() {
      return store;
    },
  };
}

let currentDb: ReturnType<typeof createFakeDb> | null = null;
let claimAndMoveCallCount = 0;
let claimAndMoveShouldThrow = false;

mock.module("server-only", { namedExports: {} });
mock.module("@/lib/firebase/admin", { namedExports: { getAdminDb: () => currentDb } });
// No-op: createTaskServerSide / createDealServerSide fire this (fire-and-
// forget in the deal case, awaited-but-harmless in the task case) — not
// what Phase 4's idempotency guarantee is about, and a real
// emitWebhookEvent would need a much larger fake (subscription lookups,
// signing, outbound fetch).
mock.module("@/lib/api/webhooks/dispatch", {
  namedExports: { emitWebhookEvent: async () => {} },
});
// A fixed, always-succeeding QStash stub: scheduleNode()'s real behavior on
// a null publishCallback() result is to fail the run closed ("a run that
// fails must say why") — correct production behavior, but it would make
// EVERY multi-node test below fail at the first inter-node hop for a
// reason that has nothing to do with what each test is actually checking.
// Mocked once, globally, exactly like the other infra below.
mock.module("@/lib/automations/qstash", {
  namedExports: {
    publishCallback: async () => ({ messageId: "mock_message_id" }),
    qstashIsConfigured: () => true,
  },
});

// Captured BEFORE deals-service.ts is mocked, so the mock below can spread
// every REAL export through unchanged and override only the one function
// this file's move_deal_stage tests need to control. Without this, the
// create_task/create_deal tests (which need the REAL
// createDealServerSide/createTaskServerSide) would see those exports as
// undefined — mock.module's namedExports replaces the WHOLE module's
// surface, not just the keys you list.
const realDealsService = await import("@/lib/server/deals-service");

// Isolates the move_deal_stage tests from deals-service.ts's own heavy
// dependency graph (activity log, webhook emission, downstream trigger
// firing — already covered by verify-move-deal-stage.mts's source-contract
// checks, and exercised for real in the create_task/create_deal tests
// below via the real services, which this mock passes through unchanged).
// This mock overrides only what THIS mission cares about: engine.ts's own
// claim/retry/terminal-failure behavior around move_deal_stage.
mock.module("@/lib/server/deals-service", {
  namedExports: {
    ...realDealsService,
    claimAndMoveDealStageServerSide: async (opts: {
      runId: string;
      nodeId: string;
      dealId: string;
      stageId: string;
      expectedSubAccountId: string;
    }) => {
      claimAndMoveCallCount++;
      const db = currentDb!;
      const claimRef = db.doc(`workflowRuns/${opts.runId}/dealStageClaims/${opts.nodeId}`);
      const dealRef = db.doc(`deals/${opts.dealId}`);
      type TxResult =
        | { claimed: false; dealMissing?: true }
        | { claimed: true };
      const txResult = await db.runTransaction<TxResult>(async (tx) => {
        const claimSnap = await tx.get(claimRef);
        if (claimSnap.exists) return { claimed: false };
        const dealSnap = await tx.get(dealRef);
        if (!dealSnap.exists || dealSnap.data()?.subAccountId !== opts.expectedSubAccountId) {
          return { claimed: false, dealMissing: true };
        }
        if (claimAndMoveShouldThrow) {
          throw new Error("simulated transient Firestore write failure");
        }
        tx.set(claimRef, { claimedAt: "MOCK_TIMESTAMP" });
        tx.update(dealRef, { stageId: opts.stageId });
        return { claimed: true };
      });
      if (!txResult.claimed) {
        return txResult.dealMissing ? { ok: false, reason: "deal_not_found" } : { ok: true, claimed: false };
      }
      return { ok: true, claimed: true, deal: { id: opts.dealId, stage_id: opts.stageId } };
    },
  },
});

const { runStep } = await import("@/lib/workflows/engine");

function seedCommon(opts: {
  runId: string;
  workflowId: string;
  nodeId: string;
  dealContext?: string;
  deals: Record<string, Json>;
}): ReturnType<typeof createFakeDb> {
  const seed: Record<string, Json | undefined> = {
    [`workflowRuns/${opts.runId}`]: {
      id: opts.runId,
      subAccountId: "sa1",
      agencyId: "ag1",
      workflowId: opts.workflowId,
      contactId: "c1",
      status: "running",
      currentNodeId: opts.nodeId,
      history: [],
      context: opts.dealContext ? { dealId: opts.dealContext } : {},
      qstashMessageId: null,
    },
    [`workflows/${opts.workflowId}`]: {
      id: opts.workflowId,
      subAccountId: "sa1",
      agencyId: "ag1",
      createdByUid: "u1",
      name: "Recovery test",
      status: "active",
      trigger: { type: "form.submitted", filters: { all: [] } },
      startNodeId: opts.nodeId,
      nodes: {
        [opts.nodeId]: {
          id: opts.nodeId,
          type: "move_deal_stage",
          config: { stageId: "qualified" },
          next: null,
        },
      },
      stats: { enrolled: 1, completed: 0 },
    },
    [`contacts/c1`]: { id: "c1", subAccountId: "sa1", name: "Test Contact" },
    [`subAccounts/sa1`]: { id: "sa1", agencyId: "ag1" },
    [`agencies/ag1`]: { id: "ag1", ownerUid: null },
  };
  for (const [dealId, dealData] of Object.entries(opts.deals)) {
    seed[`deals/${dealId}`] = dealData;
  }
  return createFakeDb(seed);
}

test("Scenario A (duplicate/concurrent callback): two truly concurrent runStep() calls for the same move_deal_stage step move the deal exactly once", async () => {
  claimAndMoveCallCount = 0;
  claimAndMoveShouldThrow = false;
  const db = seedCommon({
    runId: "runA",
    workflowId: "wfA",
    nodeId: "mv",
    dealContext: "dealA",
    deals: { dealA: { id: "dealA", subAccountId: "sa1", contactId: "c1", stageId: "new" } },
  });
  currentDb = db;

  await Promise.all([runStep("runA", "mv"), runStep("runA", "mv")]);

  assert.equal(claimAndMoveCallCount, 2, "both deliveries reach the claim+move function");
  const run = (await db.doc("workflowRuns/runA").get()).data() as Json;
  // Both deliveries run the executor (runStep's own history-write happens
  // AFTER exec() returns, for every outcome) — the race is over which one
  // ACTUALLY moves the deal, not over whether both get a history entry.
  const history = run.history as { result: string }[];
  assert.equal(history.length, 2, "both deliveries produce a history entry each");
  const results = history.map((h) => h.result).sort();
  assert.deepEqual(results, ["deal_stage:qualified", "skipped:duplicate_invocation"], "exactly one winner and one loser, never two winners");
  assert.equal(run.status, "completed", "FIXED: the run completes normally on a genuine success");
  const wf = (await db.doc("workflows/wfA").get()).data() as Json;
  assert.equal((wf.stats as Json).completed, 1, "stats.completed increments exactly once");
  const claim = await db.doc("workflowRuns/runA/dealStageClaims/mv").get();
  assert.equal(claim.exists, true, "exactly one claim doc exists");
});

test("FIXED — Scenario B (transient failure + retry): the claim and the deal write commit together, so a failed first attempt leaves NOTHING behind, and the retry succeeds", async () => {
  claimAndMoveCallCount = 0;
  claimAndMoveShouldThrow = true;
  const db = seedCommon({
    runId: "runB",
    workflowId: "wfB",
    nodeId: "mv",
    dealContext: "dealB",
    deals: { dealB: { id: "dealB", subAccountId: "sa1", contactId: "c1", stageId: "new" } },
  });
  currentDb = db;

  await assert.rejects(
    runStep("runB", "mv"),
    /simulated transient Firestore write failure/,
    "the first attempt still throws (so QStash's route handler still returns 500 and retries)",
  );

  // FIX: because the claim and the deal write are staged in ONE
  // transaction, the failed attempt leaves NEITHER behind — unlike the
  // pre-fix design, where the claim alone survived a failed write.
  const claimAfterFailure = await db.doc("workflowRuns/runB/dealStageClaims/mv").get();
  assert.equal(claimAfterFailure.exists, false, "FIXED: no dangling claim survives the failed attempt");
  let deal = (await db.doc("deals/dealB").get()).data() as Json;
  assert.equal(deal.stageId, "new", "the deal is unchanged after the failed attempt");

  claimAndMoveShouldThrow = false;
  await runStep("runB", "mv");

  assert.equal(claimAndMoveCallCount, 2, "the retry reaches the claim+move function again (nothing claimed it away)");
  deal = (await db.doc("deals/dealB").get()).data() as Json;
  assert.equal(deal.stageId, "qualified", "FIXED: the retry actually moves the deal — no more permanent silent stall");
  const run = (await db.doc("workflowRuns/runB").get()).data() as Json;
  const lastEntry = (run.history as { result: string }[])[(run.history as unknown[]).length - 1];
  assert.equal(lastEntry.result, "deal_stage:qualified", "the history correctly reflects the real, successful outcome");
});

test("FIXED — Scenario C (permanent failure): an unresolvable action error (ambiguous_deal) is now a TERMINAL failure — the run does not complete and the counter does not increment", async () => {
  claimAndMoveCallCount = 0;
  claimAndMoveShouldThrow = false;
  const db = seedCommon({
    runId: "runC",
    workflowId: "wfC",
    nodeId: "mv",
    deals: {
      dealC1: { id: "dealC1", subAccountId: "sa1", contactId: "c1", stageId: "new" },
      dealC2: { id: "dealC2", subAccountId: "sa1", contactId: "c1", stageId: "new" },
    },
  });
  currentDb = db;

  await runStep("runC", "mv");

  assert.equal(claimAndMoveCallCount, 0, "the claim+move function is never reached for an ambiguous match — no claim wasted on an unresolvable target");
  const run = (await db.doc("workflowRuns/runC").get()).data() as Json;
  const entry = (run.history as { result: string; nodeId: string }[]).find((h) => h.nodeId === "mv");
  assert.equal(entry?.result, "error:ambiguous_deal", "the permanent failure is still recorded in history");

  assert.equal(run.status, "failed", "FIXED: the run reaches a terminal 'failed' status instead of falsely completing");
  assert.equal(typeof run.error, "string", "FIXED: a human-readable failure reason is persisted on the run");
  assert.equal(run.failedNodeId, "mv", "FIXED: the failed node is identifiable");

  const wf = (await db.doc("workflows/wfC").get()).data() as Json;
  assert.equal((wf.stats as Json).completed, 0, "FIXED: stats.completed does NOT increment for a run that never actually succeeded");
  const claim = await db.doc("workflowRuns/runC/dealStageClaims/mv").get();
  assert.equal(claim.exists, false, "FIXED: no completion claim is created for a failed run (completeRun is never called)");

  for (const dealId of ["dealC1", "dealC2"]) {
    const deal = (await db.doc(`deals/${dealId}`).get()).data() as Json;
    assert.equal(deal.stageId, "new", `${dealId} must remain unmoved`);
  }
});

test("Failed run does not execute any downstream action", async () => {
  claimAndMoveCallCount = 0;
  claimAndMoveShouldThrow = false;
  const db = createFakeDb({
    "workflowRuns/runD": {
      id: "runD", subAccountId: "sa1", agencyId: "ag1", workflowId: "wfD",
      contactId: "c1", status: "running", currentNodeId: "mv",
      history: [], context: {}, qstashMessageId: null,
    },
    "workflows/wfD": {
      id: "wfD", subAccountId: "sa1", agencyId: "ag1", createdByUid: "u1",
      name: "two-step", status: "active",
      trigger: { type: "form.submitted", filters: { all: [] } },
      startNodeId: "mv",
      nodes: {
        mv: { id: "mv", type: "move_deal_stage", config: { stageId: "qualified" }, next: "tag" },
        tag: { id: "tag", type: "add_tag", config: { tag: "should-never-run" }, next: null },
      },
      stats: { enrolled: 1, completed: 0 },
    },
    "contacts/c1": { id: "c1", subAccountId: "sa1", name: "Test Contact", tags: [] },
    "subAccounts/sa1": { id: "sa1", agencyId: "ag1" },
    "agencies/ag1": { id: "ag1", ownerUid: null },
    // No deals at all for c1 -> "no_deal", a terminal failure.
  });
  currentDb = db;

  await runStep("runD", "mv");

  const run = (await db.doc("workflowRuns/runD").get()).data() as Json;
  assert.equal(run.status, "failed", "the run fails at the first node");
  assert.equal((run.history as unknown[]).length, 1, "only the failed node's entry exists — the downstream add_tag node never ran");
  const contact = (await db.doc("contacts/c1").get()).data() as Json;
  assert.deepEqual(contact.tags, [], "the downstream add_tag node's effect never happened");
});

test("Concurrent/duplicate runStep for an already-failed run is a safe no-op", async () => {
  claimAndMoveCallCount = 0;
  claimAndMoveShouldThrow = false;
  const db = seedCommon({
    runId: "runE",
    workflowId: "wfE",
    nodeId: "mv",
    deals: {
      dealE1: { id: "dealE1", subAccountId: "sa1", contactId: "c1", stageId: "new" },
      dealE2: { id: "dealE2", subAccountId: "sa1", contactId: "c1", stageId: "new" },
    },
  });
  currentDb = db;

  await runStep("runE", "mv");
  await runStep("runE", "mv"); // simulated QStash retry after the run is already terminal

  const run = (await db.doc("workflowRuns/runE").get()).data() as Json;
  assert.equal((run.history as unknown[]).length, 1, "no duplicate history entry from the retry");
  assert.equal(claimAndMoveCallCount, 0, "the retry never even reaches the claim+move function — runStep's own status guard stops it first");
});

// ---------------------------------------------------------------------------
// Task / Deal creation idempotency (Finding 3) — exercises the REAL
// createTaskServerSide / createDealServerSide functions (not mocked) against
// the fake Firestore, since this is specifically about THEIR OWN new
// .create()-based idempotency, not engine.ts's dispatch logic.
// ---------------------------------------------------------------------------

test("Concurrent create_task: two genuinely concurrent calls with the same idempotency key create exactly one task", async () => {
  const db = createFakeDb({ "contacts/c1": { id: "c1", subAccountId: "sa1", territoryId: "global" } });
  currentDb = db;
  const { createTaskServerSide } = await import("@/lib/server/tasks-service");

  const input = {
    subAccountId: "sa1", agencyId: "ag1", createdByUid: "u1", mode: "live" as const,
    title: "Follow up", notes: "", dueAt: null, contactId: "c1", dealId: null, eventId: null,
  };
  const [r1, r2] = await Promise.all([
    createTaskServerSide(input, { idempotencyKey: "wf_runF_tsk" }),
    createTaskServerSide(input, { idempotencyKey: "wf_runF_tsk" }),
  ]);

  assert.equal(r1.id, r2.id, "both calls resolve to the SAME task id");
  const allTaskDocs = [...db._dump().keys()].filter((k) => k.startsWith("tasks/"));
  assert.equal(allTaskDocs.length, 1, "exactly one task document was created, not two");
});

test("Concurrent create_deal: two genuinely concurrent calls with the same idempotency key create exactly one deal", async () => {
  const db = createFakeDb({ "contacts/c1": { id: "c1", subAccountId: "sa1" } });
  currentDb = db;
  const { createDealServerSide } = await import("@/lib/server/deals-service");

  const input = {
    subAccountId: "sa1", agencyId: "ag1", createdByUid: "u1", mode: "live" as const,
    title: "New opportunity", value: 500, currency: "usd", contactId: "c1",
    stageId: "new" as const, priority: "medium" as const,
  };
  const [r1, r2] = await Promise.all([
    createDealServerSide(input, { idempotencyKey: "wf_runG_dl" }),
    createDealServerSide(input, { idempotencyKey: "wf_runG_dl" }),
  ]);

  assert.equal(r1.id, r2.id, "both calls resolve to the SAME deal id");
  const allDealDocs = [...db._dump().keys()].filter((k) => k.startsWith("deals/"));
  assert.equal(allDealDocs.length, 1, "exactly one deal document was created, not two");
});

test("Retry after the record was already created: a second create_deal call with the same key returns the existing deal, no second document, no re-run of side effects", async () => {
  const db = createFakeDb({ "contacts/c1": { id: "c1", subAccountId: "sa1" } });
  currentDb = db;
  const { createDealServerSide } = await import("@/lib/server/deals-service");

  const input = {
    subAccountId: "sa1", agencyId: "ag1", createdByUid: "u1", mode: "live" as const,
    title: "New opportunity", value: 500, currency: "usd", contactId: "c1",
    stageId: "new" as const, priority: "medium" as const,
  };
  const first = await createDealServerSide(input, { idempotencyKey: "wf_runH_dl" });

  // Simulates exactly what a QStash retry replays: the SAME call, after the
  // underlying document already exists from (what the caller must treat
  // as) a prior attempt whose own outcome it never saw.
  const retry = await createDealServerSide(input, { idempotencyKey: "wf_runH_dl" });

  assert.equal(retry.id, first.id, "the retry resolves to the SAME deal, not a new one");
  const allDealDocs = [...db._dump().keys()].filter((k) => k.startsWith("deals/"));
  assert.equal(allDealDocs.length, 1, "still exactly one deal document after the retry");
});

test("Ordinary callers without an idempotency key keep creating a new document every call (no behavior change for existing callers)", async () => {
  const db = createFakeDb({ "contacts/c1": { id: "c1", subAccountId: "sa1" } });
  currentDb = db;
  const { createDealServerSide } = await import("@/lib/server/deals-service");

  const input = {
    subAccountId: "sa1", agencyId: "ag1", createdByUid: "u1", mode: "live" as const,
    title: "New opportunity", value: 500, currency: "usd", contactId: "c1",
    stageId: "new" as const, priority: "medium" as const,
  };
  const a = await createDealServerSide(input);
  const b = await createDealServerSide(input);
  assert.notEqual(a.id, b.id, "two ordinary (non-workflow) calls still create two distinct deals, exactly as before");
});

// ---------------------------------------------------------------------------
// Normal / happy-path behavior, unaffected by any of the corrections above.
// ---------------------------------------------------------------------------

test("Successful normal multi-step workflow completion is unaffected: add_tag -> move_deal_stage -> end", async () => {
  claimAndMoveCallCount = 0;
  claimAndMoveShouldThrow = false;
  const db = createFakeDb({
    "workflowRuns/runI": {
      id: "runI", subAccountId: "sa1", agencyId: "ag1", workflowId: "wfI",
      contactId: "c1", status: "running", currentNodeId: "tag",
      history: [], context: { dealId: "dealI" }, qstashMessageId: null,
    },
    "workflows/wfI": {
      id: "wfI", subAccountId: "sa1", agencyId: "ag1", createdByUid: "u1",
      name: "happy path", status: "active",
      trigger: { type: "form.submitted", filters: { all: [] } },
      startNodeId: "tag",
      nodes: {
        tag: { id: "tag", type: "add_tag", config: { tag: "contacted" }, next: "mv" },
        mv: { id: "mv", type: "move_deal_stage", config: { stageId: "qualified" }, next: null },
      },
      stats: { enrolled: 1, completed: 0 },
    },
    "contacts/c1": { id: "c1", subAccountId: "sa1", name: "Test Contact", tags: [] },
    "subAccounts/sa1": { id: "sa1", agencyId: "ag1" },
    "agencies/ag1": { id: "ag1", ownerUid: null },
    "deals/dealI": { id: "dealI", subAccountId: "sa1", contactId: "c1", stageId: "new" },
  });
  currentDb = db;

  await runStep("runI", "tag");
  // runStep schedules the next node via QStash normally; since this test
  // targets ENGINE correctness (not QStash delivery), it drives the next
  // step directly, exactly as the real QStash callback would.
  await runStep("runI", "mv");

  const run = (await db.doc("workflowRuns/runI").get()).data() as Json;
  assert.equal(run.status, "completed", "both steps ran and the workflow completed normally");
  assert.equal((run.history as unknown[]).length, 2, "both steps are recorded, in order");
  assert.equal((run.history as { nodeId: string }[])[0].nodeId, "tag");
  assert.equal((run.history as { nodeId: string }[])[1].nodeId, "mv");
  const contact = (await db.doc("contacts/c1").get()).data() as Json;
  assert.deepEqual(contact.tags, ["contacted"]);
  const deal = (await db.doc("deals/dealI").get()).data() as Json;
  assert.equal(deal.stageId, "qualified");
  const wf = (await db.doc("workflows/wfI").get()).data() as Json;
  assert.equal((wf.stats as Json).completed, 1, "completion counter idempotency: incremented exactly once for one genuine completion");

  // A duplicate delivery of the LAST step after completion must not
  // double-increment stats.completed or re-run anything.
  await runStep("runI", "mv");
  const wfAfterRetry = (await db.doc("workflows/wfI").get()).data() as Json;
  assert.equal((wfAfterRetry.stats as Json).completed, 1, "stats.completed is still 1 after a post-completion retry delivery");
});

test("Wait node: reaching a wait result sets status to 'waiting' without completing or erroring (QStash scheduling mocked)", async () => {
  claimAndMoveCallCount = 0;
  const db = createFakeDb({
    "workflowRuns/runJ": {
      id: "runJ", subAccountId: "sa1", agencyId: "ag1", workflowId: "wfJ",
      contactId: "c1", status: "running", currentNodeId: "w",
      history: [], context: {}, qstashMessageId: null,
    },
    "workflows/wfJ": {
      id: "wfJ", subAccountId: "sa1", agencyId: "ag1", createdByUid: "u1",
      name: "wait test", status: "active",
      trigger: { type: "form.submitted", filters: { all: [] } },
      startNodeId: "w",
      nodes: {
        w: { id: "w", type: "wait", config: { seconds: 120 }, next: "done" },
        done: { id: "done", type: "goal", config: {}, next: null },
      },
      stats: { enrolled: 1, completed: 0 },
    },
    "contacts/c1": { id: "c1", subAccountId: "sa1", name: "Test Contact" },
    "subAccounts/sa1": { id: "sa1", agencyId: "ag1" },
    "agencies/ag1": { id: "ag1", ownerUid: null },
  });
  currentDb = db;

  await runStep("runJ", "w");

  const run = (await db.doc("workflowRuns/runJ").get()).data() as Json;
  assert.equal(run.status, "waiting", "the run is parked in 'waiting', not completed and not failed");
  assert.equal(run.currentNodeId, "done", "the scheduled continuation correctly targets the wait node's `next`");
  assert.equal(run.qstashMessageId, "mock_message_id", "the scheduled message id is persisted");
  const wf = (await db.doc("workflows/wfJ").get()).data() as Json;
  assert.equal((wf.stats as Json).completed, 0, "reaching a wait is not a completion");
});

test("History integrity: a permanently-failed action still produces exactly one history entry, in order, never duplicated", async () => {
  claimAndMoveCallCount = 0;
  claimAndMoveShouldThrow = false;
  const db = seedCommon({
    runId: "runK",
    workflowId: "wfK",
    nodeId: "mv",
    deals: {
      dealK1: { id: "dealK1", subAccountId: "sa1", contactId: "c1", stageId: "new" },
      dealK2: { id: "dealK2", subAccountId: "sa1", contactId: "c1", stageId: "new" },
    },
  });
  currentDb = db;

  await runStep("runK", "mv");
  await runStep("runK", "mv");

  const run = (await db.doc("workflowRuns/runK").get()).data() as Json;
  const history = run.history as unknown[];
  assert.equal(history.length, 1, "no duplicate history entry from the second (post-failure) delivery");
  assert.equal(claimAndMoveCallCount, 0, "the second delivery must not re-invoke the action at all");
});
