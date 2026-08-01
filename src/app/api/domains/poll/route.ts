import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  qstashIsConfigured,
  verifyQStashSignature,
} from "@/lib/automations/qstash";
import { getServiceCustomDomain } from "@/lib/render/client";
import type { CustomDomainDoc } from "@/types/custom-domains";

export const dynamic = "force-dynamic";

/**
 * QStash callback that polls one custom domain's DNS status. Mirrors the
 * website-builder poll route's shape (signature verify -> load doc -> bail
 * if stale -> check -> update -> reschedule or settle), same 20s/45-attempt
 * cadence and cap.
 */

const POLL_INTERVAL_SECONDS = 20;
const MAX_POLL_ATTEMPTS = 45;

interface PollPayload {
  domain?: string;
  attempts?: number;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!qstashIsConfigured()) {
    return NextResponse.json({ error: "QStash is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Upstash-Signature header" }, { status: 401 });
  }
  const rawBody = await request.text();
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: PollPayload;
  try {
    payload = JSON.parse(rawBody) as PollPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof payload.domain !== "string") {
    return NextResponse.json({ error: "Body must include domain" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.doc(`customDomains/${payload.domain}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: true, ignored: "doc-missing" });
  }
  const doc = snap.data() as CustomDomainDoc;
  if (doc.status !== "pending") {
    return NextResponse.json({ ok: true, ignored: "already-settled" });
  }

  const attempts = (payload.attempts ?? 0) + 1;
  if (attempts > MAX_POLL_ATTEMPTS) {
    await ref.update({ status: "failed", updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true, settled: "timeout" });
  }

  let result;
  try {
    result = await getServiceCustomDomain(payload.domain);
  } catch (err) {
    console.warn("[domains/poll] status check threw — rescheduling", err);
    await reschedule(payload.domain, attempts);
    return NextResponse.json({ ok: true, deferred: "transient" });
  }

  if (result?.verificationStatus === "verified") {
    await ref.update({
      status: "verified",
      misconfigured: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, settled: "verified" });
  }

  await ref.update({ misconfigured: true, updatedAt: FieldValue.serverTimestamp() });
  const rescheduled = await reschedule(payload.domain, attempts);
  if (!rescheduled) {
    // Doesn't fail the domain — DNS can still be added later and rechecked
    // manually via the "Recheck now" button even if the background chain died.
    return NextResponse.json({ ok: true, settled: "reschedule-failed" });
  }
  return NextResponse.json({ ok: true, deferred: "in-progress" });
}

async function reschedule(domain: string, attempts: number): Promise<boolean> {
  const result = await publishCallback({
    pathname: "/api/domains/poll",
    body: { domain, attempts },
    delaySeconds: POLL_INTERVAL_SECONDS,
    deduplicationId: `domain_${domain}_${attempts}`,
  });
  return result !== null;
}
