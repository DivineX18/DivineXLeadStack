import "server-only";

import { Client } from "@upstash/qstash";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Auto-register the LeadStack daily cron schedules on cold start.
 *
 * Removes the manual "click into the QStash dashboard, create a
 * schedule" step from buyer onboarding. The buyer sets QStash env vars
 * and the schedules appear on the next cold start.
 *
 * Idempotent via stable `scheduleId`s — QStash treats a `create()` with
 * an existing id as a replace, so calling on every cold start is safe.
 *
 * Cost reduction:
 *   - A 24-hour Firestore marker (`system/scheduleRegistration`) caches
 *     "we registered already" so the steady-state cold start drops to a
 *     single Firestore read (~10ms) instead of 2 QStash API calls
 *     (~200ms). The marker also stores the `baseUrl` it registered
 *     against, so a redeploy that changes `NEXT_PUBLIC_APP_URL` blows
 *     the cache and re-registers immediately.
 *
 * Failure mode:
 *   - QStash down / network failure: log + skip. The next cold start
 *     retries. Schedules that already exist in QStash continue running.
 *   - Marker doc write fails: log + skip. Worst case we re-register on
 *     the next cold start instead of using the cache. No correctness
 *     impact.
 *
 * To add a new schedule: append to `SCHEDULES`. Stable scheduleId is
 * required (no random ids — that's how you end up with duplicates).
 *
 * Cross-environment hazard (found 2026-11-09): QStash's `create()` with an
 * existing scheduleId REPLACES that schedule's destination in place (see the
 * idempotency note above). If a second deployment of this codebase (e.g. a
 * staging service) cold-starts with `NODE_ENV=production` and the SAME
 * `QSTASH_TOKEN` as another deployment, it will silently repoint that other
 * deployment's `leadstack-*` schedules at its own `NEXT_PUBLIC_APP_URL` —
 * there is nothing environment-scoped about these ids by default. The
 * optional `QSTASH_SCHEDULE_ID_SUFFIX` env var exists so a second deployment
 * sharing a QStash account/token can register its own distinctly-named
 * schedules instead of overwriting the first one's. Leaving it unset
 * preserves the exact pre-existing ids and behavior for every deployment
 * that doesn't set it (i.e. every deployment today, including production).
 *
 * Staging preference (2026-11-09 revenue-readiness sprint): a test
 * environment has no reason to run these three RECURRING crons at all —
 * none of them sit on the Growth System E2E path (that path's own follow-up
 * delays go through ad hoc, non-recurring QStash messages scheduled by
 * `lib/automations/qstash.ts`, which this flag does not touch). Setting
 * `DISABLE_RECURRING_SCHEDULES=true` short-circuits this function before it
 * ever calls QStash, which is a stronger guarantee than the suffix fix
 * alone (that fix prevents a collision if schedules ARE registered; this
 * flag prevents a staging deployment from registering any recurring
 * schedule in the first place). Unset by default everywhere, including
 * production.
 */

interface ScheduleSpec {
  scheduleId: string;
  path: string;
  cron: string;
  description: string;
}

const SCHEDULES: ScheduleSpec[] = [
  {
    scheduleId: "leadstack-gitpage-heartbeat",
    path: "/api/cron/gitpage-heartbeat",
    cron: "0 3 * * *",
    description: "Daily gitpage telemetry + subscription status cache.",
  },
  {
    scheduleId: "leadstack-api-cleanup",
    path: "/api/cron/api-cleanup",
    cron: "0 4 * * *",
    description:
      "Daily sweep of expired apiRequestLogs / apiIdempotency / webhookEvents.",
  },
  {
    scheduleId: "leadstack-google-sync",
    path: "/api/cron/google-sync",
    // 05:00 UTC: after the other two, and late enough that yesterday's GA4
    // and Search Console data has settled. Search Console in particular lags
    // by a couple of days, which is why the window ends at yesterday rather
    // than today.
    cron: "0 5 * * *",
    description:
      "Daily GA4 + Search Console reporting pull for every connected workspace.",
  },
];

const MARKER_PATH = "system/scheduleRegistration";
const SKIP_AGE_MS = 24 * 60 * 60 * 1000;

function tsToDate(ts: Timestamp | Date | null | undefined): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof (ts as Timestamp).toDate === "function") {
    return (ts as Timestamp).toDate();
  }
  return null;
}

export async function ensureSchedulesRegistered(): Promise<void> {
  // Explicit staging/test opt-out — see the "Staging preference" doc comment
  // above. Checked before the QStash-credentials gate so a test environment
  // never has to touch QStash's recurring-schedule namespace at all.
  if (process.env.DISABLE_RECURRING_SCHEDULES === "true") return;
  // Gate: no QStash credentials → nothing to register. Local dev without
  // a tunnel falls into this path; that's correct.
  if (!process.env.QSTASH_TOKEN) return;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!baseUrl) return;
  // Skip in non-production runtimes where re-registering across hot reloads
  // would just churn QStash. Local production builds (`pnpm build && pnpm
  // start`) still register so buyers can test the full flow locally.
  if (process.env.NODE_ENV !== "production") return;

  const db = getAdminDb();
  const markerRef = db.doc(MARKER_PATH);

  // 24h cache check. Skip the QStash round-trip on hot cold-starts.
  try {
    const snap = await markerRef.get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      const lastUrl = data.baseUrl as string | undefined;
      const lastAt = tsToDate(data.registeredAt);
      if (
        lastUrl === baseUrl &&
        lastAt &&
        Date.now() - lastAt.getTime() < SKIP_AGE_MS
      ) {
        return;
      }
    }
  } catch (err) {
    // Marker read failures aren't fatal — fall through and re-register.
    console.warn("[schedules] marker read failed; will re-register", err);
  }

  const client = new Client({
    token: process.env.QSTASH_TOKEN,
    ...(process.env.QSTASH_URL ? { baseUrl: process.env.QSTASH_URL } : {}),
  });

  // Unset by default: every existing deployment keeps its current
  // scheduleIds untouched. Only a deployment that explicitly opts in (e.g.
  // a staging service sharing production's QStash account) gets suffixed,
  // collision-proof ids.
  const suffix = process.env.QSTASH_SCHEDULE_ID_SUFFIX?.trim();
  const scheduleIdFor = (baseId: string) =>
    suffix ? `${baseId}-${suffix}` : baseId;

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const s of SCHEDULES) {
    const scheduleId = scheduleIdFor(s.scheduleId);
    try {
      await client.schedules.create({
        scheduleId,
        destination: `${baseUrl}${s.path}`,
        cron: s.cron,
      });
      results.push({ id: scheduleId, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      console.warn(`[schedules] failed to register ${scheduleId}: ${message}`);
      results.push({ id: scheduleId, ok: false, error: message });
    }
  }

  // Update marker even on partial failure so cold starts don't pound
  // QStash. A 24-hour delay before the next attempt is acceptable — a
  // schedule that failed once isn't expected to succeed on the next cold
  // start a minute later.
  try {
    await markerRef.set(
      {
        baseUrl,
        registeredAt: FieldValue.serverTimestamp(),
        scheduleIds: SCHEDULES.map((s) => scheduleIdFor(s.scheduleId)),
        lastResults: results,
      },
      { merge: true },
    );
  } catch (err) {
    console.warn("[schedules] marker write failed", err);
  }
}
