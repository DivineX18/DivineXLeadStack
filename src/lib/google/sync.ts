import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { googleCan } from "@/lib/google/capabilities";
import {
  accessTokenForConfig,
  fetchGa4Report,
  fetchSearchConsoleReport,
  GoogleApiError,
  type Ga4Report,
  type GscReport,
} from "@/lib/google/api";
import type { SubAccountDoc } from "@/types";

/**
 * Pull a workspace's Google reporting data and store one snapshot.
 *
 * WHERE THIS LANDS, and why it is here rather than in Ascend. The intended
 * home for these metrics is Ascend's Postgres, beside growth_timelines and
 * market_snapshots, so the Growth Scan and CRO engines can reason over real
 * traffic instead of guessing — that argument has not changed. What stopped
 * it: Ascend ships schema changes with `drizzle-kit push` against a live
 * DATABASE_URL, which is not reachable from here, so the migration could be
 * written but neither applied nor verified. Shipping an unverifiable schema
 * change into the system of record is worse than storing the snapshot here
 * and moving it once it can be proven.
 *
 * Nothing is lost by waiting: no Ascend engine consumes GA4 data today, so
 * this defers an integration rather than reversing a decision. The snapshot
 * shape is deliberately the normalised one Ascend would receive, so the move
 * is a new writer, not a reshape.
 */

/** Firestore doc id under `subAccounts/{id}/googleMetrics`. One snapshot, replaced each run. */
export const LATEST_SNAPSHOT_ID = "latest";

/** Days of history per sync. 28 covers a four-week comparison and keeps the
 *  document far inside Firestore's 1MB limit at roughly 60 bytes a day. */
export const SYNC_WINDOW_DAYS = 28;

export interface GoogleMetricsSnapshot {
  fetchedAt: FirebaseFirestore.Timestamp | FieldValue;
  rangeStart: string;
  rangeEnd: string;
  ga4: Ga4Report | null;
  searchConsole: GscReport | null;
  /** Per-service failures. A snapshot with one service broken still stores the
   *  other, because blanking a working dashboard to report an unrelated
   *  outage helps nobody. */
  errors: { service: string; code: string; message: string }[];
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export interface SyncOutcome {
  subAccountId: string;
  status: "synced" | "skipped" | "failed";
  reason?: string;
  services: string[];
}

/**
 * Sync one workspace. Never throws: a sync run covers many workspaces and one
 * broken connection must not stop the rest.
 */
export async function syncGoogleMetricsForSubAccount(subAccountId: string): Promise<SyncOutcome> {
  const db = getAdminDb();
  const snap = await db.doc(`subAccounts/${subAccountId}`).get();
  const config = snap.exists ? ((snap.data() as SubAccountDoc).googleConfig ?? null) : null;

  if (!config?.connected) {
    return { subAccountId, status: "skipped", reason: "not_connected", services: [] };
  }

  const wantsGa4 = googleCan(config, "ga4") && !!config.ga4PropertyId;
  const wantsGsc = googleCan(config, "searchConsole") && !!config.gscSiteUrl;
  if (!wantsGa4 && !wantsGsc) {
    // Connected but nothing selected yet. Not an error — the operator has not
    // finished setup — so it must not be recorded as a failure.
    return { subAccountId, status: "skipped", reason: "nothing_selected", services: [] };
  }

  const rangeStart = isoDaysAgo(SYNC_WINDOW_DAYS);
  const rangeEnd = isoDaysAgo(1); // yesterday: today is always partial
  const errors: GoogleMetricsSnapshot["errors"] = [];
  let ga4: Ga4Report | null = null;
  let searchConsole: GscReport | null = null;

  let accessToken: string;
  try {
    accessToken = await accessTokenForConfig(config);
  } catch (err) {
    // `invalid_grant` means the client revoked us, or the refresh token
    // expired — which in Testing mode happens after 7 days. Record it on the
    // connection so the UI can say "reconnect" instead of showing a stale
    // dashboard that looks merely quiet.
    const reason = err instanceof Error ? err.message : "token_refresh_failed";
    await markSyncError(subAccountId, reason);
    return { subAccountId, status: "failed", reason, services: [] };
  }

  const services: string[] = [];
  if (wantsGa4) {
    try {
      ga4 = await fetchGa4Report(accessToken, config.ga4PropertyId as string, rangeStart, rangeEnd);
      services.push("ga4");
    } catch (err) {
      errors.push(toError("ga4", err));
    }
  }
  if (wantsGsc) {
    try {
      searchConsole = await fetchSearchConsoleReport(
        accessToken, config.gscSiteUrl as string, rangeStart, rangeEnd,
      );
      services.push("searchConsole");
    } catch (err) {
      errors.push(toError("searchConsole", err));
    }
  }

  const snapshot: GoogleMetricsSnapshot = {
    fetchedAt: FieldValue.serverTimestamp(),
    rangeStart,
    rangeEnd,
    ga4,
    searchConsole,
    errors,
  };
  await db
    .doc(`subAccounts/${subAccountId}/googleMetrics/${LATEST_SNAPSHOT_ID}`)
    .set(snapshot, { merge: false });

  // Only a run that produced nothing at all is a failure. A partial run is
  // still fresher than what was there before.
  const anySucceeded = services.length > 0;
  await db.doc(`subAccounts/${subAccountId}`).set(
    {
      googleConfig: {
        ...config,
        lastSyncedAt: anySucceeded ? FieldValue.serverTimestamp() : (config.lastSyncedAt ?? null),
        lastSyncError: anySucceeded ? null : (errors[0]?.message ?? "sync produced no data"),
      },
    },
    { merge: true },
  );

  return {
    subAccountId,
    status: anySucceeded ? "synced" : "failed",
    reason: anySucceeded ? undefined : errors[0]?.code,
    services,
  };
}

function toError(service: string, err: unknown) {
  if (err instanceof GoogleApiError) {
    return { service, code: err.code, message: err.message };
  }
  return { service, code: "unknown", message: err instanceof Error ? err.message : String(err) };
}

async function markSyncError(subAccountId: string, message: string): Promise<void> {
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set({ googleConfig: { lastSyncError: message } }, { merge: true })
    .catch(() => undefined);
}

/** Every workspace with a live connection. Equality-only, so no composite index. */
export async function listConnectedSubAccountIds(): Promise<string[]> {
  const snap = await getAdminDb()
    .collection("subAccounts")
    .where("googleConfig.connected", "==", true)
    .get();
  return snap.docs.map((d) => d.id);
}
