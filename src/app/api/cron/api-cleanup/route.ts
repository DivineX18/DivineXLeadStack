import { drainFeedback } from "@/lib/ai-suite/outcome-feedback";
import "server-only";

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
 * self-schedules a re-run in 60s. Caps the function execution time well
 * under Vercel's serverless timeout and prevents tablet-hot issues from
 * batch-deleting 100k docs in one shot.
 */

const BATCH_LIMIT = 500;
const CONTINUATION_DELAY_SEC = 60;

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
  const snap = await db
    .collectionGroup(collectionGroupName)
    .where("expiresAt", "<", now)
    .limit(BATCH_LIMIT)
    .get();
  if (snap.empty) {
    return { collection: collectionGroupName, deleted: 0, hitCap: false };
  }
  // Firestore batch limit is 500 ops; we already capped at BATCH_LIMIT.
  const batch = db.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
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
  const snap = await db
    .collectionGroup("webhookEvents")
    .where("expiresAt", "<", now)
    .limit(BATCH_LIMIT)
    .get();
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
    await db.recursiveDelete(doc.ref);
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

  const startedAt = Date.now();
  const now = new Date();

  const results: SweepResult[] = [];
  let sweepFailed = false;
  for (const sweep of [
    () => sweepFlatCollection("apiRequestLogs", now),
    () => sweepFlatCollection("apiIdempotency", now),
    () => sweepWebhookEvents(now),
  ]) {
    try {
      results.push(await sweep());
    } catch {
      sweepFailed = true;
      console.error("[cron/api-cleanup] sweep failed");
    }
  }

  // Receipt delivery is independent of TTL maintenance. An unrelated cleanup
  // failure must not strand durable receipts.
  let feedbackPending = false;
  let feedbackFailed = false;
  try {
    feedbackPending = await drainFeedback();
  } catch {
    feedbackFailed = true;
    console.error("[cron/api-cleanup] feedback drain failed");
  }
  const continuationRequired =
    sweepFailed ||
    feedbackFailed ||
    feedbackPending ||
    results.some((r) => r.hitCap);
  let continuationScheduled = false;
  if (continuationRequired) {
    try {
      continuationScheduled = !!(await publishCallback({
        pathname: "/api/cron/api-cleanup",
        body: {},
        delaySeconds: CONTINUATION_DELAY_SEC,
        deduplicationId: `api-cleanup_continuation_${Math.floor(Date.now() / 60000)}`,
      }));
    } catch {
      /* Non-2xx below preserves provider retry and exposes the failure. */
    }
    if (!continuationScheduled)
      console.error("[cron/api-cleanup] continuation publish failed");
  }
  const ok =
    !sweepFailed &&
    !feedbackFailed &&
    (!continuationRequired || continuationScheduled);
  return NextResponse.json(
    {
      ok,
      durationMs: Date.now() - startedAt,
      results,
      sweepFailed,
      feedbackFailed,
      continuationRequired,
      continuationScheduled,
    },
    { status: ok ? 200 : 503 }
  );
}
