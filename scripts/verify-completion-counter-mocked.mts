/**
 * Executable regression test for the "workflows/undefined" staging failure,
 * using a mocked Firestore rather than source-text pattern matching. Proves
 * runStep()/completeRun() resolve the workflow id from `run.workflowId`
 * (set once at enroll() time from a snapshot's own `.id`) and never from
 * `wf.id` read off `wfSnap.data()` — which is undefined for any workflow
 * document written without an embedded `id` field, exactly as
 * scripts/seed-onboarding-workflow.mts and
 * scripts/seed-divinex-reconnect-series.mts both do.
 *
 * Requires `node --experimental-test-module-mocks` (Node 22+) to replace
 * `@/lib/firebase/admin`'s getAdminDb() with an in-memory fake before
 * engine.ts is imported. Run via:
 *   npx tsx --test --experimental-test-module-mocks scripts/verify-completion-counter-mocked.mts
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

type Json = Record<string, unknown>;

// engine.ts imports the REAL `FieldValue`/`Timestamp` from
// "firebase-admin/firestore" — that module is pure (no filesystem/network
// access, just sentinel-object factories), so there is no need to mock it;
// using the real thing means this test exercises the exact same sentinel
// shapes production code produces. Detection is by constructor name + the
// (public, documented-by-shape) `operand` property, confirmed against the
// installed SDK version rather than assumed.
function isIncrement(v: unknown): v is { operand: number } {
  return !!v && typeof v === "object" && v.constructor?.name === "NumericIncrementTransform";
}
function isServerTimestamp(v: unknown): boolean {
  return !!v && typeof v === "object" && (v as object).constructor?.name === "ServerTimestampTransform";
}

function applyPatch(current: Json, patch: Json): Json {
  const next: Json = { ...current };
  for (const [key, rawValue] of Object.entries(patch)) {
    let value = rawValue;
    if (isIncrement(value)) {
      const parts = key.split(".");
      let cursor: Json = next;
      for (let i = 0; i < parts.length - 1; i++) {
        const existing = cursor[parts[i]];
        cursor[parts[i]] = typeof existing === "object" && existing ? existing : {};
        cursor = cursor[parts[i]] as Json;
      }
      const last = parts[parts.length - 1];
      const existingVal = (cursor[last] as number | undefined) ?? 0;
      cursor[last] = existingVal + value.operand;
      continue;
    }
    if (isServerTimestamp(value)) {
      value = "MOCK_TIMESTAMP";
    }
    // Support dotted-path creation for plain (non-sentinel) values too.
    if (key.includes(".")) {
      const parts = key.split(".");
      let cursor: Json = next;
      for (let i = 0; i < parts.length - 1; i++) {
        const existing = cursor[parts[i]];
        cursor[parts[i]] = typeof existing === "object" && existing ? existing : {};
        cursor = cursor[parts[i]] as Json;
      }
      cursor[parts[parts.length - 1]] = value;
    } else {
      next[key] = value;
    }
  }
  return next;
}

/** Minimal in-memory Firestore: enough surface for runStep()'s "node not
 *  found" completion path — one doc store keyed by full path, plain
 *  get/update/set, and a runTransaction that stages writes and applies them
 *  only if the transaction function does not throw. */
function createFakeDb(
  seed: Record<string, Json | undefined>,
  opts: { failUpdatePaths?: Set<string> } = {},
) {
  const store = new Map<string, Json | undefined>(Object.entries(seed));
  const failUpdatePaths = opts.failUpdatePaths ?? new Set<string>();

  function refFor(path: string) {
    const segments = path.split("/");
    const id = segments[segments.length - 1];
    return {
      id,
      path,
      async get() {
        const data = store.get(path);
        return {
          exists: data !== undefined,
          id,
          data: () => data,
        };
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
    };
  }

  return {
    collection(name: string) {
      return {
        doc(id?: string) {
          const docId = id ?? `generated_${Math.random().toString(36).slice(2)}`;
          return refFor(`${name}/${docId}`);
        },
      };
    },
    doc(path: string) {
      return refFor(path);
    },
    async runTransaction(fn: (tx: unknown) => Promise<void>) {
      // Snapshot the store so a thrown transaction function leaves no
      // partial writes behind — mirrors Firestore's real atomicity.
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
            if (failUpdatePaths.has(ref.path)) {
              // Simulates a transient Firestore failure on this exact
              // write (e.g. the real NOT_FOUND staging hit, or any other
              // transient error) WITHOUT also defeating runStep's own
              // earlier, separate existence check on the same document —
              // the two reads happen at genuinely different points in the
              // real code, and only the later one (inside this
              // transaction) is what this test is exercising.
              throw new Error(`NOT_FOUND: No document to update: mock://${ref.path}`);
            }
            const existing = store.get(ref.path);
            if (existing === undefined) {
              throw new Error(`NOT_FOUND: No document to update: mock://${ref.path}`);
            }
            store.set(ref.path, applyPatch(existing, patch));
          });
        },
      };
      try {
        await fn(tx);
        for (const apply of staged) apply();
      } catch (err) {
        store.clear();
        for (const [k, v] of before) store.set(k, v);
        throw err;
      }
    },
    _dump() {
      return store;
    },
  };
}

// `mock.module` for a given specifier can only be registered once per
// process — re-mocking it per test throws ERR_INVALID_STATE. Instead, the
// mocked `@/lib/firebase/admin` is registered exactly once, and each test
// swaps out WHICH fake Firestore it returns via this mutable cell. engine.ts
// calls `getAdminDb()` fresh inside every function body (never caches it at
// module-load time), so this is sufficient — no re-mocking needed.
let currentDb: ReturnType<typeof createFakeDb> | null = null;
mock.module("server-only", { namedExports: {} });
mock.module("@/lib/firebase/admin", {
  namedExports: { getAdminDb: () => currentDb },
});

const { runStep } = await import("@/lib/workflows/engine");

test("a workflow document with NO embedded `id` field still completes and counts correctly", async () => {
  const runId = "run1";
  const workflowId = "wfRealId"; // the document's OWN Firestore-assigned id
  const db = createFakeDb({
    [`workflowRuns/${runId}`]: {
      id: runId,
      subAccountId: "sa1",
      agencyId: "ag1",
      workflowId, // set once at enroll() time from the workflow snapshot's real .id
      contactId: "c1",
      status: "running",
      currentNodeId: "missingNode",
      history: [],
      context: {},
      qstashMessageId: null,
    },
    [`workflows/${workflowId}`]: {
      // Deliberately NO `id` field — exactly what
      // scripts/seed-onboarding-workflow.mts and
      // scripts/seed-divinex-reconnect-series.mts both write.
      subAccountId: "sa1",
      agencyId: "ag1",
      createdByUid: "u1",
      name: "No embedded id",
      status: "active",
      trigger: { type: "form.submitted", filters: { all: [] } },
      startNodeId: "missingNode",
      nodes: {}, // nodeId below is absent -> runStep's "node not found" branch
      stats: { enrolled: 1, completed: 0 },
    },
  });

  currentDb = db;
  await runStep(runId, "missingNode");

  const runDoc = (await db.doc(`workflowRuns/${runId}`).get()).data() as Json;
  assert.equal(runDoc.status, "completed", "run must still reach a terminal completed status");

  const wfDoc = (await db.doc(`workflows/${workflowId}`).get()).data() as Json;
  assert.deepEqual(
    (wfDoc.stats as Json).completed,
    1,
    "stats.completed must increment using run.workflowId, not the missing wf.id — this is the exact bug: it used to silently attempt workflows/undefined and never get here",
  );

  const claim = await db.doc(`workflowRuns/${runId}/completionClaims/completed`).get();
  assert.equal(claim.exists, true, "the completion claim must be created alongside the increment");
});

test("a second runStep() call for the same already-completed run does not double-increment", async () => {
  const runId = "run2";
  const workflowId = "wfRealId2";
  const db = createFakeDb({
    [`workflowRuns/${runId}`]: {
      id: runId,
      subAccountId: "sa1",
      agencyId: "ag1",
      workflowId,
      contactId: "c1",
      status: "running",
      currentNodeId: "missingNode",
      history: [],
      context: {},
      qstashMessageId: null,
    },
    [`workflows/${workflowId}`]: {
      subAccountId: "sa1",
      agencyId: "ag1",
      createdByUid: "u1",
      name: "No embedded id",
      status: "active",
      trigger: { type: "form.submitted", filters: { all: [] } },
      startNodeId: "missingNode",
      nodes: {},
      stats: { enrolled: 1, completed: 0 },
    },
  });
  currentDb = db;

  await runStep(runId, "missingNode");
  // runStep's own history/status guard returns early before completeRun
  // could ever be reached a second time for a run that is no longer
  // running/waiting.
  await runStep(runId, "missingNode");

  const wfDoc = (await db.doc(`workflows/${workflowId}`).get()).data() as Json;
  assert.equal((wfDoc.stats as Json).completed, 1, "a repeated call for an already-completed run must not double-increment");
});

test("a transaction failure at completion time (e.g. the workflow doc vanishing mid-flight) does not crash runStep", async () => {
  const runId = "run3";
  const workflowId = "wfGoneByThen";
  // The workflow document legitimately EXISTS when runStep makes its own,
  // separate existence check (so that check passes, same as any normal
  // run) — the failure is isolated to the later write inside
  // claimAndCountRunCompletion's transaction, simulating a document that
  // disappears (or any other transient Firestore error) in the real gap
  // between those two points in time.
  const db = createFakeDb(
    {
      [`workflowRuns/${runId}`]: {
        id: runId,
        subAccountId: "sa1",
        agencyId: "ag1",
        workflowId,
        contactId: "c1",
        status: "running",
        currentNodeId: "missingNode",
        history: [],
        context: {},
        qstashMessageId: null,
      },
      [`workflows/${workflowId}`]: {
        subAccountId: "sa1",
        agencyId: "ag1",
        createdByUid: "u1",
        name: "About to vanish",
        status: "active",
        trigger: { type: "form.submitted", filters: { all: [] } },
        startNodeId: "missingNode",
        nodes: {},
        stats: { enrolled: 1, completed: 0 },
      },
    },
    { failUpdatePaths: new Set([`workflows/${workflowId}`]) },
  );
  currentDb = db;

  await assert.doesNotReject(
    runStep(runId, "missingNode"),
    "runStep must not throw even when the completion-count transaction itself fails (NOT_FOUND)",
  );

  const runDoc = (await db.doc(`workflowRuns/${runId}`).get()).data() as Json;
  assert.equal(runDoc.status, "completed", "the run's own terminal status must still be set even if the counter write fails");

  const wfDoc = (await db.doc(`workflows/${workflowId}`).get()).data() as Json;
  assert.equal((wfDoc.stats as Json).completed, 0, "a failed transaction must not partially apply the increment");

  const claim = await db.doc(`workflowRuns/${runId}/completionClaims/completed`).get();
  assert.equal(
    claim.exists,
    false,
    "a failed transaction must not leave the completion claim behind either — this is the exact gap the single-transaction redesign closed: a failed increment can no longer leave a successful claim",
  );
});

test("every completion call site reaches the SAME authoritative workflow id, even via the 'end' node result path (not just 'node not found')", async () => {
  const runId = "run4";
  const workflowId = "wfRealId4";
  const db = createFakeDb({
    [`workflowRuns/${runId}`]: {
      id: runId,
      subAccountId: "sa1",
      agencyId: "ag1",
      workflowId,
      contactId: "c1",
      status: "running",
      currentNodeId: "goalNode",
      history: [],
      context: {},
      qstashMessageId: null,
    },
    [`contacts/c1`]: { id: "c1", subAccountId: "sa1", name: "Test Contact" },
    [`subAccounts/sa1`]: { id: "sa1", agencyId: "ag1" },
    [`agencies/ag1`]: { id: "ag1", ownerUid: null },
    // No embedded `id` field here either — proves the "end" result path
    // (a goal/terminal node, not just an absent-node lookup) also resolves
    // the workflow id from run.workflowId, not from this document's data.
    [`workflows/${workflowId}`]: {
      subAccountId: "sa1",
      agencyId: "ag1",
      createdByUid: "u1",
      name: "Goal node, no embedded id",
      status: "active",
      trigger: { type: "form.submitted", filters: { all: [] } },
      startNodeId: "goalNode",
      nodes: { goalNode: { id: "goalNode", type: "goal", config: {}, next: null } },
      stats: { enrolled: 1, completed: 0 },
    },
  });
  currentDb = db;

  await runStep(runId, "goalNode");

  const wfDoc = (await db.doc(`workflows/${workflowId}`).get()).data() as Json;
  assert.equal(
    (wfDoc.stats as Json).completed,
    1,
    "the goal-node ('end' result) completion path must also use run.workflowId, not wf.id",
  );
});
