import {appendFeedback,type ExecutionDelivery} from "@/lib/ai-suite/outcome-feedback";
import type { AiSuiteAuditEntry } from "@/lib/ai-suite/audit";
import "server-only";

import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AiSuiteLevel } from "@/types/ai-suite";

/**
 * Transactional idempotency guard for POST /api/ai-suite/confirm.
 *
 * The chat UI's `confirmingId` state (ai-suite-chat.tsx) only blocks a
 * second click from the SAME open tab, and it resets in a `finally` the
 * moment any error is thrown -- a fetch that timed out after the request
 * already reached the server, a second tab signed into the same account, or
 * a direct POST replay all bypass it completely, and the route itself had
 * no server-side dedup at all: two requests for the same proposed action
 * could both pass validation and both call `cap.execute()`. For a capability
 * that creates something, that creates two of it.
 *
 * Identity is deliberately NOT `capability + args`. Two different proposals
 * can carry identical args on purpose (the user asks the assistant to send
 * the same kind of thing twice), and that must run twice, not collapse into
 * one. `confirmationId` -- the model's own tool-call id, already minted
 * fresh per proposed action and already plumbed to the UI for keying -- is
 * the thing that actually discriminates "this one confirm click, retried"
 * from "a new, independent ask that happens to look the same." It is the
 * mandatory fourth dimension of the key, alongside the authorized user, the
 * workspace, and the capability, so a key collision can only ever mean "the
 * same confirm, again," never two unrelated actions.
 *
 * Storage mirrors `lib/api/idempotency.ts` (TTL style, hashed doc id so the
 * raw confirmationId never appears in a Firestore export) but adds the one
 * thing that module doesn't have: a transaction-guarded claim, because that
 * one is read-then-write and only solves the sequential-retry case, not the
 * concurrent one this route needs closed too.
 */

const RUNNING_STALE_MS = 2 * 60 * 1000; // generous vs. real execute() latency
const SUCCEEDED_TTL_MS = 24 * 60 * 60 * 1000; // mirrors lib/api/idempotency.ts
const WAIT_POLL_MS = 300;
const WAIT_MAX_MS = 8_000;

export interface ConfirmIdentity {
  uid: string;
  agencyId: string;
  subAccountId: string | null;
  level: AiSuiteLevel;
  capability: string;
}

export type CachedConfirmResponse = Record<string, unknown>;

export type ClaimOutcome =
  | { kind: "proceed" }
  | { kind: "cached"; response: CachedConfirmResponse }
  | { kind: "duplicate_in_progress" }
  /** Same confirmationId, but the args don't match what ran under it --
   *  almost certainly a bug, never silently reuse the wrong result. */
  | { kind: "fingerprint_mismatch" };

export function fingerprintArgs(args: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(args), "utf8")
    .digest("hex");
}

function keyFor(identity: ConfirmIdentity, confirmationId: string): string {
  const raw = [
    identity.uid,
    identity.agencyId,
    identity.subAccountId ?? "-",
    identity.capability,
    confirmationId,
  ].join("\u0000");
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function docRef(identity: ConfirmIdentity, confirmationId: string) {
  return getAdminDb()
    .collection("aiSuiteConfirmations")
    .doc(keyFor(identity, confirmationId));
}

function baseFields(
  identity: ConfirmIdentity,
  argsFingerprint: string,
  startedAt: number
) {
  return {
    status: "running" as const,
    startedAt,
    argsFingerprint,
    uid: identity.uid,
    agencyId: identity.agencyId,
    subAccountId: identity.subAccountId,
    level: identity.level,
    capability: identity.capability,
  };
}

function resolveSucceeded(
  data: Record<string, unknown>,
  argsFingerprint: string
): ClaimOutcome | null {
  const expiresAt = data.expiresAt;
  const expiresAtMs =
    expiresAt instanceof Timestamp
      ? expiresAt.toMillis()
      : typeof expiresAt === "number"
        ? expiresAt
        : 0;
  if (expiresAtMs <= Date.now()) return null; // expired -- treat as a miss
  if (data.argsFingerprint !== argsFingerprint)
    return { kind: "fingerprint_mismatch" };
  return { kind: "cached", response: data.response as CachedConfirmResponse };
}

/**
 * Attempts to claim the execution slot for this exact confirmation.
 * Transactional, so two requests racing for the same key can never both
 * receive "proceed" -- only one does; the other gets a definite answer
 * ("cached", "duplicate_in_progress", or "fingerprint_mismatch"), never a
 * silent second execution.
 */
export async function claimConfirmation(
  identity: ConfirmIdentity,
  confirmationId: string,
  argsFingerprint: string
): Promise<ClaimOutcome> {
  const ref = docRef(identity, confirmationId);
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    if (!snap.exists) {
      tx.set(ref, baseFields(identity, argsFingerprint, now));
      return { kind: "proceed" };
    }

    const data = snap.data()!;
    if (data.status === "succeeded") {
      const resolved = resolveSucceeded(data, argsFingerprint);
      if (resolved) return resolved;
      tx.set(ref, baseFields(identity, argsFingerprint, now)); // expired -> reclaim
      return { kind: "proceed" };
    }

    if (data.status === "running") {
      const startedAt = typeof data.startedAt === "number" ? data.startedAt : 0;
      if (now - startedAt < RUNNING_STALE_MS) {
        return { kind: "duplicate_in_progress" };
      }
      // Stale: the holder almost certainly crashed mid-execute rather than
      // ever reaching settle/release. Reclaim instead of wedging this
      // confirmationId forever.
      tx.set(ref, baseFields(identity, argsFingerprint, now));
      return { kind: "proceed" };
    }

    // Anything else (a failed attempt's doc, if one is ever left behind) --
    // the route treats a failed execute() as intentionally retryable, so
    // this guard must not turn it into a permanent block. Reclaim.
    tx.set(ref, baseFields(identity, argsFingerprint, now));
    return { kind: "proceed" };
  });
}

/** Call after a successful execute() -- caches the result for safe retries. */
export async function settleConfirmationSucceeded(
  identity: ConfirmIdentity,
  confirmationId: string,
  argsFingerprint: string,
  response: CachedConfirmResponse,
  audit?: AiSuiteAuditEntry,
  delivery?: ExecutionDelivery
): Promise<boolean> {
  for(let attempt=0;attempt<(delivery?3:1);attempt++){
  try {
    const db = getAdminDb();
    const ref = docRef(identity, confirmationId);
    const batch = db.batch();
    batch.set(ref, {
      status: "succeeded",
      settledAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + SUCCEEDED_TTL_MS),
      argsFingerprint,
      response,
      uid: identity.uid,
      agencyId: identity.agencyId,
      subAccountId: identity.subAccountId,
      level: identity.level,
      capability: identity.capability,
    });
    if (audit)
      batch.set(db.doc(`aiSuiteActions/confirm_${ref.id}`), {
        ...audit,
        error: audit.error ?? null,
        resultRef: audit.resultRef ?? null,
        createdAt: FieldValue.serverTimestamp(),
      });
    if(delivery)appendFeedback(batch,delivery,"succeeded",{artifactRef:audit?.resultRef?`${audit.resultRef.kind}:${audit.resultRef.id}`:"execution:"+delivery.executionId});
    // A replayable success and its audit receipt are one atomic commit.
    // Does not close the pre-settle crash/ambiguous-execution residual.
    await batch.commit();
    return true;
  } catch (err) {
    console.warn(
      "[ai-suite/confirm-idempotency] failed to cache succeeded result and audit:",
      err
    );
  }
  }
  return false;
}

/**
 * Call after execute() throws. Deletes the lock rather than caching a
 * terminal failure: this guard's only job is to stop a successful attempt
 * from running twice, never to turn one failure into a permanent block --
 * the route's existing "failed is retryable on purpose" behavior (a build
 * that fell over on a transient error must not become a dead end) depends
 * on the next confirm being free to actually try again.
 *
 * NOTE on partial failure: if `execute()` throws after partially mutating
 * state (created one thing, then failed on a second write), the retry this
 * unblocks still re-enters that same `execute()` from scratch. Making every
 * capability internally resumable against partial failure is a
 * per-capability concern -- this guard only prevents the SAME attempt from
 * running twice, it does not make a half-finished one safely resumable.
 *
 * NAMED RESIDUAL RISK -- the crash case this function cannot see at all:
 * if the external side effect `execute()` performs actually SUCCEEDS (an
 * email provider accepts the send, a build API returns 202) but the Node
 * process is killed before `execute()` returns control to the route --
 * before either this function OR `settleConfirmationSucceeded` ever runs
 * -- the lock is left in "running" with nothing to release it. No code
 * path exists to distinguish that from an attempt that is still
 * genuinely, slowly in flight, so by design it is treated as the latter:
 * `claimConfirmation` answers "duplicate_in_progress" for the full
 * `RUNNING_STALE_MS` window (keeping a second, quicker request from
 * double-firing the same external action during that window), and only
 * past that window does a fresh attempt reclaim the lock and genuinely
 * re-run `execute()` -- which, for an external action that already
 * succeeded once, can mean invoking that action a second time. This is
 * the one case this module cannot close without either (a) a durable,
 * per-capability outcome record written by the external call itself
 * before it returns -- a new per-capability mechanism, explicitly out of
 * scope here -- or (b) every external call this route's capabilities make
 * being provider-side idempotent (an idempotency key Resend/the build
 * API/etc. itself honors), which is not something this route can
 * guarantee for capabilities it doesn't control. Accepted trade-off:
 * `RUNNING_STALE_MS` is sized generously above real execute() latency
 * specifically to make this window rare, not to make it impossible. See
 * verify-ai-suite-confirm-idempotency.mts, check 11, for a deterministic
 * reproduction of exactly this sequence.
 */
export async function releaseConfirmationFailed(
  identity: ConfirmIdentity,
  confirmationId: string
): Promise<void> {
  try {
    await docRef(identity, confirmationId).delete();
  } catch (err) {
    console.warn(
      "[ai-suite/confirm-idempotency] failed to release lock after failure:",
      err
    );
  }
}

/**
 * Polls briefly for a concurrent duplicate's outcome. Only called when
 * `claimConfirmation` returned "duplicate_in_progress" -- gives the request
 * that lost the race a real chance to return the SAME result the winning
 * request is producing, instead of immediately bouncing the caller with a
 * "try again" error for something that is, in fact, already succeeding.
 *
 * Resolves to "proceed" (meaning: the holder released after a failure,
 * caller may now claim and actually execute) rather than looping itself --
 * the caller re-invokes `claimConfirmation` once, which is simpler than
 * nesting another transaction inside a poll loop and behaves identically.
 */
export async function waitForConcurrentResult(
  identity: ConfirmIdentity,
  confirmationId: string,
  argsFingerprint: string
): Promise<ClaimOutcome> {
  const ref = docRef(identity, confirmationId);
  const deadline = Date.now() + WAIT_MAX_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
    const snap = await ref.get();
    if (!snap.exists) return { kind: "proceed" }; // released after a failure
    const data = snap.data()!;
    if (data.status === "succeeded") {
      const resolved = resolveSucceeded(data, argsFingerprint);
      if (resolved) return resolved;
      return { kind: "proceed" }; // expired while we waited -- free to reclaim
    }
    if (data.status !== "running") return { kind: "proceed" };
    // still running -- keep polling until the deadline
  }
  return { kind: "duplicate_in_progress" }; // still genuinely in flight
}
