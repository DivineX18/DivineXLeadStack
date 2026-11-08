import { drainFeedback } from "@/lib/ai-suite/outcome-feedback";
import "server-only";
import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  verifyQStashSignature,
} from "@/lib/automations/qstash";

/**
 * Daily cleanup sweep for the public API's TTL'd collections.
 *
 * Replaces Firestore native TTL policies — those would require the buyer
 * to click into the Firebase console after cloning, which breaks the
 * "configure env vars, run firebase deploy --only firestore:rules, done"
 * onboarding model. This route does the same job using infrastructure
 * the buyer is already configuring (QStash).
 *
 * Wiring (one-time, in the QStash dashboard):
 *   Schedule: cron `0 4 * * *` (or any daily slot)
 *   Target:   ${NEXT_PUBLIC_APP_URL}/api/cron/api-cleanup
 *
 * Cost: at moderate API volume (~50k requests/month) this sweep deletes
 * ~50k apiRequestLogs/month + smaller volumes of apiIdempotency and
 * webhookEvents. Total ~$0.06/month in Firestore ops — same ballpark as
 * native TTL would cost (TTL also bills 1 delete per doc).
 *
 * Continuation: if any collection hits the per-run cap, the route
 * self-schedules a re-run in 60s (max eight hops/ten minutes). Failed
 * operations never self-publish; only provider-bounded retries apply. Caps the function execution time well
 * under Vercel's serverless timeout and prevents tablet-hot issues from
 * batch-deleting 100k docs in one shot.
 */

const BATCH_LIMIT = 500;
const CONTINUATION_DELAY_SEC = 60;
const MAX_CONTINUATIONS = 8;
const MAX_CHAIN_AGE_MS = 10 * 60 * 1000;

// Provider messages already have bounded retries. Continuations are pagination,
// never a second retry policy. Signed metadata bounds every successful chain.
interface Continuation {
  root: string;
  hop: number;
  startedAt: number;
}
function continuationContext(
  raw: string,
  messageId: string
): Continuation | null {
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (!("cleanupContinuation" in body))
    return {
      root: createHash("sha256").update(messageId).digest("hex"),
      hop: 0,
      startedAt: Date.now(),
    };
  const c = body.cleanupContinuation;
  return c &&
    typeof c === "object" &&
    typeof c.root === "string" &&
    /^[a-f0-9]{64}$/.test(c.root) &&
    Number.isInteger(c.hop) &&
    c.hop >= 1 &&
    c.hop <= MAX_CONTINUATIONS &&
    Number.isSafeInteger(c.startedAt) &&
    c.startedAt <= Date.now()
    ? { root: c.root, hop: c.hop, startedAt: c.startedAt }
    : null;
}

const CODES: Record<string, string> = {
  "4": "deadline-exceeded",
  "7": "permission-denied",
  "8": "resource-exhausted",
  "9": "failed-precondition",
  "10": "aborted",
  "14": "unavailable",
  "16": "unauthenticated",
};
function sanitizedError(error: unknown) {
  const e =
    error && typeof error === "object"
      ? (error as { name?: unknown; code?: unknown })
      : {};
  const rawCode = String(e.code ?? "unknown").replace(/^firestore\//, "");
  const code =
    CODES[rawCode] ??
    (Object.values(CODES).includes(rawCode) ? rawCode : "unknown");
  const errorClass = [
    "Error",
    "FirebaseError",
    "GoogleError",
    "TypeError",
    "RangeError",
  ].includes(String(e.name))
    ? String(e.name)
    : "Error";
  return {
    code,
    errorClass,
    retryable:
      code === "unknown"
        ? null
        : [
            "deadline-exceeded",
            "resource-exhausted",
            "aborted",
            "unavailable",
          ].includes(code),
  };
}
class SweepFailure {
  constructor(
    readonly operation: string,
    readonly error: ReturnType<typeof sanitizedError>
  ) {}
}
async function sweepOperation<T>(
  operation: string,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new SweepFailure(operation, sanitizedError(error));
  }
}

interface SweepResult {
  collection: string;
  deleted: number;
  hitCap: boolean;
}

async function sweepFlatCollection(
  collectionGroupName: string,
  now: Date
): Promise<SweepResult> {
  const db = getAdminDb();
  const snap = await sweepOperation("query_expired", () =>
    db
      .collectionGroup(collectionGroupName)
      .where("expiresAt", "<", now)
      .limit(BATCH_LIMIT)
      .get()
  );
  if (snap.empty) {
    return { collection: collectionGroupName, deleted: 0, hitCap: false };
  }
  // Firestore batch limit is 500 ops; we already capped at BATCH_LIMIT.
  await sweepOperation("batch_delete", async () => {
    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
  });
  return {
    collection: collectionGroupName,
    deleted: snap.size,
    hitCap: snap.size >= BATCH_LIMIT,
  };
}

async function sweepWebhookEvents(now: Date): Promise<SweepResult> {
  // webhookEvents has a `deliveries/{id}` subcollection. recursiveDelete
  // is the only safe way to remove the parent — a batch delete would
  // orphan the deliveries.
  const db = getAdminDb();
  const snap = await sweepOperation("query_expired", () =>
    db
      .collectionGroup("webhookEvents")
      .where("expiresAt", "<", now)
      .limit(BATCH_LIMIT)
      .get()
  );
  if (snap.empty) {
    return { collection: "webhookEvents", deleted: 0, hitCap: false };
  }
  // recursiveDelete on each ref — Firestore Admin SDK throttles internally
  // to avoid hot-tablet writes. Sequential per doc keeps memory bounded;
  // for our volume this is fine. If sweep volume grows past 5k/day we'd
  // want to fan-out via QStash + parallelize. Track via the response
  // counts before that's a real concern.
  let deleted = 0;
  for (const doc of snap.docs) {
    await sweepOperation("recursive_delete", () => db.recursiveDelete(doc.ref));
    deleted += 1;
  }
  return {
    collection: "webhookEvents",
    deleted,
    hitCap: snap.size >= BATCH_LIMIT,
  };
}

export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const chain = continuationContext(
    rawBody,
    request.headers.get("upstash-message-id") || signature
  );
  if (!chain)
    return NextResponse.json(
      { error: "Invalid cleanup continuation" },
      { status: 400 }
    );
  // Old/replayed continuation messages are acknowledged without touching data.
  if (chain.hop > 0 && Date.now() - chain.startedAt >= MAX_CHAIN_AGE_MS)
    return NextResponse.json({
      ok: true,
      continuationRequired: false,
      continuationScheduled: false,
      continuationStopped: "chain_expired",
    });
  const startedAt = Date.now();
  const now = new Date();

  const results: SweepResult[] = [];
  const failures: {
    collection: string;
    operation: string;
    code: string;
    errorClass: string;
    retryable: boolean | null;
  }[] = [];
  for (const [collection, sweep] of [
    ["apiRequestLogs", () => sweepFlatCollection("apiRequestLogs", now)],
    ["apiIdempotency", () => sweepFlatCollection("apiIdempotency", now)],
    ["webhookEvents", () => sweepWebhookEvents(now)],
  ] as const) {
    try {
      results.push(await sweep());
    } catch (error) {
      failures.push({
        collection,
        operation:
          error instanceof SweepFailure ? error.operation : "initialize_sweep",
        ...(error instanceof SweepFailure
          ? error.error
          : sanitizedError(error)),
      });
    }
  }
  const sweepFailed = failures.length > 0;

  // Receipt delivery is independent of TTL maintenance. An unrelated cleanup
  // failure must not strand durable receipts.
  let feedbackPending = false;
  let feedbackFailed = false;
  try {
    feedbackPending = await drainFeedback();
  } catch (error) {
    feedbackFailed = true;
    failures.push({
      collection: "aiSuiteFeedback",
      operation: "drain_feedback",
      ...sanitizedError(error),
    });
  }
  const unfinished = feedbackPending || results.some((r) => r.hitCap);
  const continuationRequired = !sweepFailed && !feedbackFailed && unfinished;
  const withinBudget =
    chain.hop < MAX_CONTINUATIONS &&
    Date.now() - chain.startedAt < MAX_CHAIN_AGE_MS;
  let continuationScheduled = false;
  let publishError: ReturnType<typeof sanitizedError> | undefined;
  if (continuationRequired && withinBudget) {
    try {
      continuationScheduled = !!(await publishCallback({
        pathname: "/api/cron/api-cleanup",
        body: { cleanupContinuation: { ...chain, hop: chain.hop + 1 } },
        delaySeconds: CONTINUATION_DELAY_SEC,
        // Stable across provider redelivery; never a fresh minute-based chain.
        deduplicationId: `api_cleanup_${chain.root}_${chain.hop + 1}`,
        retries: 3,
        onError: (error) => {
          publishError = sanitizedError(error);
        },
      }));
    } catch (error) {
      publishError = sanitizedError(error);
    }
    if (!continuationScheduled)
      failures.push({
        collection: "callback",
        operation: "publish_continuation",
        ...(publishError ?? sanitizedError(null)),
      });
  }
  const continuationStopped =
    continuationRequired && !withinBudget ? "chain_budget_exhausted" : null;
  // Exhausted successful pagination is not a failure/retry chain. Remaining
  // durable work waits for the next independent daily sweep or owner review.
  for (const failure of failures)
    console.error("[cron/api-cleanup] operation_failed", {
      ...failure,
      continuationRequired,
      continuationScheduled,
    });
  console.info("[cron/api-cleanup] completed", {
    sweepFailed,
    feedbackFailed,
    continuationRequired,
    continuationScheduled,
    continuationStopped,
    hop: chain.hop,
  });
  const ok =
    !sweepFailed &&
    !feedbackFailed &&
    (!continuationRequired || !withinBudget || continuationScheduled);
  return NextResponse.json(
    {
      ok,
      durationMs: Date.now() - startedAt,
      results,
      sweepFailed,
      feedbackFailed,
      failures,
      continuationStopped,
      continuationRequired,
      continuationScheduled,
    },
    { status: ok ? 200 : 503 }
  );
}
