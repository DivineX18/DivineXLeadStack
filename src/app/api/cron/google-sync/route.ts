import "server-only";

import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import {
  listConnectedSubAccountIds,
  syncGoogleMetricsForSubAccount,
  type SyncOutcome,
} from "@/lib/google/sync";

/**
 * Daily Google reporting sync — QStash callback.
 *
 *   POST /api/cron/google-sync
 *
 * Public path; the Upstash signature IS the credential, exactly as for the
 * two existing cron routes. No Cloud Scheduler and no paid Google service:
 * the GA4 Data, Search Console and Ads reporting APIs are free at these
 * volumes, and scheduling is the QStash we already pay for.
 *
 * Budget: Explorer-tier Ads access allows 2,880 production operations a day,
 * so the design target is a handful of calls per workspace per day, not per
 * page view. Reads are served from the stored snapshot; nothing in the UI
 * calls Google directly.
 */

/** One workspace at a time. Each is a few seconds of network, and a parallel
 *  fan-out across every workspace would risk the platform request timeout for
 *  no gain on a once-a-day job. */
async function runAll(): Promise<SyncOutcome[]> {
  const ids = await listConnectedSubAccountIds();
  const out: SyncOutcome[] = [];
  for (const id of ids) {
    // syncGoogleMetricsForSubAccount never throws — one broken connection
    // must not end the run for every other workspace.
    out.push(await syncGoogleMetricsForSubAccount(id));
  }
  return out;
}

export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  if (!(await verifyQStashSignature(signature, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const startedAt = Date.now();
  const results = await runAll();

  return NextResponse.json({
    ok: true,
    workspaces: results.length,
    synced: results.filter((r) => r.status === "synced").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    ms: Date.now() - startedAt,
    results,
  });
}
