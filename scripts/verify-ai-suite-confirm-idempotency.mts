/**
 * Flow AI Suite idempotency repair -- regression coverage.
 *
 * /api/ai-suite/confirm had no server-side dedup at all. The chat UI's
 * `confirmingId` React state only blocks a second click from the SAME open
 * tab and resets on any thrown error, so a timed-out fetch that actually
 * reached the server, a second browser tab, or a direct POST replay could
 * all reach `cap.execute()` twice for the same proposed action. This proves
 * the fix in lib/ai-suite/confirm-idempotency.ts against a REAL Firestore
 * transaction (a hand-rolled in-memory fake would just re-implement the
 * locking logic under test and prove nothing), covering exactly the cases
 * called out in the fix request: concurrent double-submit, sequential
 * retry, cross-tenant non-collision, and an ambiguous/failed outcome
 * staying retryable rather than becoming a permanent block.
 *
 * This does NOT touch the capability registry or the route's auth gates --
 * those are unchanged and already covered by
 * verify-ai-suite-security-battery.mts. This script is scoped to the one
 * new piece: does the claim/settle/release/wait state machine in
 * confirm-idempotency.ts actually prevent a duplicate execution and still
 * let a legitimate independent one through.
 *
 * PREREQUISITE: a Java runtime for the Firestore emulator (same requirement
 * as verify-task-assignment-rules.mts / verify-sms-rules.mts).
 *
 *   JAVA_HOME=<jre> npx firebase emulators:exec --only firestore \
 *     "npx tsx scripts/verify-ai-suite-confirm-idempotency.mts"
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
// Overridable: port 8080 is this machine's default, but a long-running
// unrelated emulator (a different project) can already be holding it.
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";

const { getAdminDb } = await import("../src/lib/firebase/admin");
const {
  claimConfirmation,
  settleConfirmationSucceeded,
  releaseConfirmationFailed,
  waitForConcurrentResult,
  fingerprintArgs,
} = await import("../src/lib/ai-suite/confirm-idempotency");

let failures = 0;
const check = (label: string, cond: boolean, detail?: string) => {
  if (cond) {
    console.log(`PASS ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail ? ` -- ${detail}` : ""}`);
  }
};

function identity(over: Partial<{ uid: string; agencyId: string; subAccountId: string | null; capability: string }> = {}) {
  return {
    uid: over.uid ?? "uidAlice",
    agencyId: over.agencyId ?? "ag1",
    subAccountId: over.subAccountId ?? "saA",
    level: "sub-account" as const,
    capability: over.capability ?? "send_email",
  };
}

// Each check below picks its OWN confirmationId so runs never interfere with
// each other even though they share one emulator instance.
let seq = 0;
const freshId = (label: string) => `tool_${label}_${seq++}`;

// ── 1. Basic claim: a brand-new confirmation proceeds ──────────────────────
{
  const id = freshId("basic");
  const fp = fingerprintArgs({ to: "a@example.com" });
  const r = await claimConfirmation(identity(), id, fp);
  check("a brand-new confirmation returns 'proceed'", r.kind === "proceed");
}

// ── 2. Sequential retry after success returns the cached result verbatim,
//    and does not require re-running anything ───────────────────────────
{
  const id = freshId("retry");
  const fp = fingerprintArgs({ to: "b@example.com" });
  const first = await claimConfirmation(identity(), id, fp);
  check("first claim proceeds", first.kind === "proceed");
  const response = { ok: true, resultText: "Email sent.", resultRef: { kind: "email", id: "e1" } };
  await settleConfirmationSucceeded(identity(), id, fp, response);

  const retry = await claimConfirmation(identity(), id, fp);
  check(
    "a sequential retry of the SAME confirmation returns the cached result, not 'proceed'",
    retry.kind === "cached",
    `got kind=${retry.kind}`,
  );
  if (retry.kind === "cached") {
    check(
      "the cached result is byte-identical to what was originally settled",
      JSON.stringify(retry.response) === JSON.stringify(response),
    );
  }
}

// ── 3. Concurrent double-submit: two simultaneous claims for the SAME
//    confirmation -- exactly one must proceed, never both ─────────────────
{
  const id = freshId("concurrent");
  const fp = fingerprintArgs({ to: "c@example.com" });
  const [a, b] = await Promise.all([
    claimConfirmation(identity(), id, fp),
    claimConfirmation(identity(), id, fp),
  ]);
  const proceedCount = [a, b].filter((r) => r.kind === "proceed").length;
  const duplicateCount = [a, b].filter((r) => r.kind === "duplicate_in_progress").length;
  check(
    "exactly one of two concurrent claims proceeds",
    proceedCount === 1,
    `proceedCount=${proceedCount} outcomes=${[a.kind, b.kind].join(",")}`,
  );
  check("the other sees duplicate_in_progress, not a silent second execution", duplicateCount === 1);
}

// ── 4. The loser of a concurrent race gets the WINNER's actual result, not
//    just an error -- waitForConcurrentResult picks up the settle ─────────
{
  const id = freshId("wait-success");
  const fp = fingerprintArgs({ to: "d@example.com" });
  const winner = await claimConfirmation(identity(), id, fp);
  check("winner proceeds", winner.kind === "proceed");
  const loser = await claimConfirmation(identity(), id, fp);
  check("loser sees duplicate_in_progress", loser.kind === "duplicate_in_progress");

  const response = { ok: true, resultText: "Built." };
  const settleAfterMs = 500;
  const waitPromise = waitForConcurrentResult(identity(), id, fp);
  setTimeout(() => {
    void settleConfirmationSucceeded(identity(), id, fp, response);
  }, settleAfterMs);
  const resolved = await waitPromise;
  check(
    "the loser's wait resolves to the winner's cached result once it settles",
    resolved.kind === "cached" && JSON.stringify(resolved.response) === JSON.stringify(response),
    `got kind=${resolved.kind}`,
  );
}

// ── 5. Ambiguous/failed outcome: release frees the confirmation for a real
//    retry -- a failure is NOT a permanent block ──────────────────────────
{
  const id = freshId("failed-retry");
  const fp = fingerprintArgs({ to: "e@example.com" });
  const first = await claimConfirmation(identity(), id, fp);
  check("first claim proceeds", first.kind === "proceed");
  await releaseConfirmationFailed(identity(), id);
  const retry = await claimConfirmation(identity(), id, fp);
  check(
    "after a release-on-failure, the SAME confirmation can proceed again (failure is retryable, not a dead end)",
    retry.kind === "proceed",
    `got kind=${retry.kind}`,
  );
}

// ── 6. The loser of a race whose winner FAILS (released, not settled) also
//    gets a real turn, instead of being stuck behind a dead lock ──────────
{
  const id = freshId("wait-release");
  const fp = fingerprintArgs({ to: "f@example.com" });
  const winner = await claimConfirmation(identity(), id, fp);
  check("winner proceeds", winner.kind === "proceed");
  const loser = await claimConfirmation(identity(), id, fp);
  check("loser sees duplicate_in_progress", loser.kind === "duplicate_in_progress");

  setTimeout(() => {
    void releaseConfirmationFailed(identity(), id);
  }, 400);
  const resolved = await waitForConcurrentResult(identity(), id, fp);
  check(
    "when the in-flight winner fails and releases, the waiting loser is told to proceed",
    resolved.kind === "proceed",
    `got kind=${resolved.kind}`,
  );
}

// ── 7. Fingerprint mismatch: same confirmationId reused with DIFFERENT args
//    after a success must never silently replay the old result ───────────
{
  const id = freshId("mismatch");
  const fpOriginal = fingerprintArgs({ to: "g@example.com", body: "v1" });
  const fpChanged = fingerprintArgs({ to: "g@example.com", body: "v2 -- different payload" });
  const first = await claimConfirmation(identity(), id, fpOriginal);
  check("first claim proceeds", first.kind === "proceed");
  await settleConfirmationSucceeded(identity(), id, fpOriginal, { ok: true, resultText: "v1 sent" });

  const replay = await claimConfirmation(identity(), id, fpChanged);
  check(
    "the same confirmationId with DIFFERENT args is refused as a mismatch, not replayed",
    replay.kind === "fingerprint_mismatch",
    `got kind=${replay.kind}`,
  );
}

// ── 8. Cross-tenant non-collision: the SAME confirmationId + capability,
//    issued to a DIFFERENT user/workspace, must be its own independent
//    operation -- never blocked by, and never returning, the other
//    tenant's result ────────────────────────────────────────────────────
{
  const id = freshId("cross-tenant"); // deliberately the SAME id on both sides
  const fp = fingerprintArgs({ to: "shared-shape@example.com" });

  const tenantA = identity({ uid: "uidAlice", agencyId: "ag1", subAccountId: "saA" });
  const tenantB = identity({ uid: "uidCarla", agencyId: "ag2", subAccountId: "saB" });

  const aClaim = await claimConfirmation(tenantA, id, fp);
  check("tenant A's claim proceeds", aClaim.kind === "proceed");
  await settleConfirmationSucceeded(tenantA, id, fp, { ok: true, resultText: "Tenant A's result" });

  const bClaim = await claimConfirmation(tenantB, id, fp);
  check(
    "tenant B's claim, with the identical confirmationId + args, is NOT blocked by tenant A's lock",
    bClaim.kind === "proceed",
    `got kind=${bClaim.kind} -- a cross-tenant key collision would wrongly block this`,
  );

  // Also prove the inverse: once B settles, A's already-cached result must
  // stay A's, not get overwritten or conflated with B's.
  await settleConfirmationSucceeded(tenantB, id, fp, { ok: true, resultText: "Tenant B's result" });
  const aRetry = await claimConfirmation(tenantA, id, fp);
  check(
    "tenant A's cached result is still A's own, unaffected by tenant B using the same confirmationId",
    aRetry.kind === "cached" && (aRetry as { response: { resultText: string } }).response.resultText === "Tenant A's result",
    `got ${JSON.stringify(aRetry)}`,
  );
}

// ── 9. A DIFFERENT confirmationId (a genuinely new, independent proposal)
//    for the identical user+workspace+capability+args must run freely --
//    the fix must never suppress a legitimate independent operation ──────
{
  const fp = fingerprintArgs({ to: "same-args-both-times@example.com" });
  const firstId = freshId("independent-1");
  const secondId = freshId("independent-2");

  const first = await claimConfirmation(identity(), firstId, fp);
  check("first independent proposal proceeds", first.kind === "proceed");
  await settleConfirmationSucceeded(identity(), firstId, fp, { ok: true, resultText: "First send" });

  const second = await claimConfirmation(identity(), secondId, fp);
  check(
    "a second proposal with a DIFFERENT confirmationId but IDENTICAL args is its own independent operation, not deduped away",
    second.kind === "proceed",
    `got kind=${second.kind}`,
  );
}

// ── 10. A stale "running" lock (the holder crashed mid-execute) is
//     reclaimed rather than wedging that confirmationId forever ──────────
{
  const id = freshId("stale");
  const fp = fingerprintArgs({ to: "h@example.com" });
  const db = getAdminDb();
  const { createHash } = await import("node:crypto");
  const keyRaw = ["uidAlice", "ag1", "saA", "send_email", id].join("\u0000");
  const docId = createHash("sha256").update(keyRaw, "utf8").digest("hex");
  await db.collection("aiSuiteConfirmations").doc(docId).set({
    status: "running",
    startedAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago -- well past the stale threshold
    argsFingerprint: fp,
    uid: "uidAlice",
    agencyId: "ag1",
    subAccountId: "saA",
    level: "sub-account",
    capability: "send_email",
  });
  const reclaimed = await claimConfirmation(identity(), id, fp);
  check(
    "a stale running lock (crashed holder) is reclaimed, not treated as a live duplicate forever",
    reclaimed.kind === "proceed",
    `got kind=${reclaimed.kind}`,
  );
}

// ── 11. AMBIGUOUS OUTCOME: the external action succeeds, but the process
//     crashes before either settle or release ever runs -- no code path
//     distinguishes this from a genuinely slow, still-running attempt.
//     Proves the two things that ARE guaranteed around this named gap:
//     (a) a second request is kept from re-firing the same external
//     action for the whole stale window, and (b) the window is finite --
//     a crash does not wedge this confirmationId forever. See the
//     "NAMED RESIDUAL RISK" comment on releaseConfirmationFailed() in
//     confirm-idempotency.ts for why a real double-fire is still possible
//     right at the stale-window boundary, and why closing that fully is
//     out of scope for a route-level lock. ───────────────────────────────
{
  const id = freshId("crash-after-external-success");
  const fp = fingerprintArgs({ to: "i@example.com" });

  // The "winner" claims, and its execute() -- unmodeled here, this IS the
  // external action -- succeeds. Then the process is killed: neither
  // settleConfirmationSucceeded nor releaseConfirmationFailed ever runs.
  // That is simulated by simply never calling either.
  const winner = await claimConfirmation(identity(), id, fp);
  check("the attempt that will 'crash' proceeds and claims the lock", winner.kind === "proceed");

  // (a) Immediately after the simulated crash, a second request for the
  // SAME confirmation must NOT be told to proceed -- if it were, it would
  // re-run execute() and could re-fire the already-succeeded external
  // action a second time.
  const immediateRetry = await claimConfirmation(identity(), id, fp);
  check(
    "right after the simulated crash, a retry is NOT allowed to re-run the external action",
    immediateRetry.kind === "duplicate_in_progress",
    `got kind=${immediateRetry.kind} -- this would double-fire the external action`,
  );

  // Back-date the lock's startedAt to simulate real time passing well
  // beyond RUNNING_STALE_MS, without an unrealistic real-time sleep.
  const db = getAdminDb();
  const { createHash } = await import("node:crypto");
  const keyRaw = ["uidAlice", "ag1", "saA", "send_email", id].join("\u0000");
  const docId = createHash("sha256").update(keyRaw, "utf8").digest("hex");
  await db.collection("aiSuiteConfirmations").doc(docId).update({
    startedAt: Date.now() - 10 * 60 * 1000,
  });

  // (b) Past the stale window, the lock IS reclaimed -- a crash does not
  // wedge this confirmationId permanently. This is the documented,
  // accepted edge where a real double-fire of the external action becomes
  // possible again; the test exists to make that moment explicit and
  // observable, not to claim it's eliminated.
  const afterWindow = await claimConfirmation(identity(), id, fp);
  check(
    "past the stale window, the lock from the 'crashed' attempt is reclaimed rather than permanently wedged",
    afterWindow.kind === "proceed",
    `got kind=${afterWindow.kind}`,
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
