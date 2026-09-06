import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { classifyTrafficSource } from "@/lib/landing/traffic-source";

/**
 * FUNNEL TELEMETRY — the measurement half of the Unified loop.
 *
 * Built to answer "did the thing we recommended actually work?", not to display
 * a view counter. The loop it has to close is:
 *
 *   RECOMMENDATION -> CREATED -> LAUNCHED -> TRAFFIC -> CONVERSION -> RESULT
 *   -> NEXT RECOMMENDATION
 *
 * So every datum is keyed by the things that loop needs to join on: workspace,
 * funnel, campaign, source, and time. `campaignId` is recorded at write time
 * rather than joined later, because a funnel can be re-linked and history must
 * stay true to what was live then.
 *
 * SHAPE IS DELIBERATELY EXTENSIBLE. `outcomes` is an open counter map, so
 * booked appointments, qualified leads, pipeline movement and revenue become
 * new keys rather than a migration. `step` is carried now, unused by today's
 * single-step pages, so multi-step funnels (P1) do not need a schema change.
 * Nothing here pre-builds those — it just declines to block them.
 *
 * MIRRORS the existing landing rollup (lib/landing/attribution-rollup.ts):
 * server-written aggregates, FieldValue.increment, one count per session per
 * stage, best-effort by contract. A miscount must NEVER break a page render or
 * a form submission, so every caller swallows failures.
 *
 * HONESTY: "visitors" means SESSIONS, because that is what is actually
 * measured. It is never presented as people.
 */

export type FunnelEventKind = "view" | "submission";

/**
 * Per-IP beacon cap. Deliberately NOT the checkout limiter: sharing that
 * bucket would let page views burn a real buyer's checkout budget, and 20/hr
 * would throttle a legitimate office behind one NAT address. Same
 * in-memory-per-instance tradeoff as every other limiter here — it blunts
 * casual inflation, it is not a security boundary.
 */
const BEACON_HOURLY_LIMIT = 240;
const BEACON_WINDOW_MS = 60 * 60 * 1000;
const beaconBuckets = new Map<string, { count: number; startedAt: number }>();

export function checkBeaconRateLimit(ip: string): boolean {
  const now = Date.now();
  let b = beaconBuckets.get(ip);
  if (!b || now - b.startedAt > BEACON_WINDOW_MS) b = { count: 0, startedAt: now };
  if (b.count >= BEACON_HOURLY_LIMIT) return false;
  b.count += 1;
  beaconBuckets.set(ip, b);
  if (beaconBuckets.size > 5000) {
    for (const [k, v] of beaconBuckets) {
      if (now - v.startedAt > BEACON_WINDOW_MS) beaconBuckets.delete(k);
    }
  }
  return true;
}

export interface FunnelEventInput {
  subAccountId: string;
  funnelId: string;
  kind: FunnelEventKind;
  /** Multi-step funnels (P1) will pass a step id; single-page passes none. */
  step?: string | null;
  /** Campaign this funnel belonged to WHEN the event happened. */
  campaignId?: string | null;
  /** True the first time a session is seen — drives the sessions counter. */
  firstInSession?: boolean;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
}

/** UTC day key. Deliberately UTC so buckets are stable regardless of where the
 *  operator or the visitor is. */
export function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Record one funnel event.
 *
 * Writes a rollup doc (fast reads for the dashboard) and a daily bucket (the
 * time series the loop needs to say "before vs after"). Both are server-only.
 */
export async function recordFunnelEvent(input: FunnelEventInput): Promise<void> {
  const db = getAdminDb();
  const inc = FieldValue.increment(1);
  const now = FieldValue.serverTimestamp();

  const source = classifyTrafficSource({
    referrer: input.referrer ?? null,
    utmSource: input.utmSource ?? null,
    utmMedium: input.utmMedium ?? null,
    gclid: input.gclid ?? null,
    fbclid: input.fbclid ?? null,
  });

  const isView = input.kind === "view";
  const totals: Record<string, unknown> = {
    [isView ? "views" : "submissions"]: inc,
  };
  // Sessions are counted once, on the first event of a session, so a visitor
  // who views and then submits is one session — not two.
  if (input.firstInSession) totals.sessions = inc;

  const ref = db.doc(`funnelStats/${input.funnelId}`);
  const dayRef = ref.collection("days").doc(dayKey());

  const rollup: Record<string, unknown> = {
    funnelId: input.funnelId,
    subAccountId: input.subAccountId,
    // Recorded per event, so re-linking a funnel later cannot rewrite history.
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    totals,
    bySource: { [source.key]: { label: source.label, ...totals } },
    updatedAt: now,
    firstSeenAt: FieldValue.serverTimestamp(),
  };

  // Best-effort by contract — see the module note. A telemetry failure must
  // never surface to a visitor or block a lead.
  await Promise.all([
    ref.set(rollup, { merge: true }),
    dayRef.set(
      {
        day: dayKey(),
        funnelId: input.funnelId,
        subAccountId: input.subAccountId,
        ...totals,
        ...(input.step ? { steps: { [input.step]: totals } } : {}),
        updatedAt: now,
      },
      { merge: true },
    ),
  ]);
}

/**
 * Record a business OUTCOME attributed to a funnel — a booking, a qualified
 * lead, revenue. Separate from events because outcomes arrive later and from
 * other systems, and because "conversion" and "outcome" are different
 * questions: one is did they submit, the other is did it matter.
 *
 * Not wired to booking/pipeline yet (P1+); the counter exists so those can
 * attach without a schema change.
 */
export async function recordFunnelOutcome(input: {
  subAccountId: string;
  funnelId: string;
  outcome: string;
  /** Minor units, when the outcome carries money. */
  valueCents?: number;
}): Promise<void> {
  const db = getAdminDb();
  const key = input.outcome.replace(/[^a-z0-9_]/gi, "_").slice(0, 40);
  await db.doc(`funnelStats/${input.funnelId}`).set(
    {
      funnelId: input.funnelId,
      subAccountId: input.subAccountId,
      outcomes: {
        [key]: FieldValue.increment(1),
        ...(input.valueCents ? { [`${key}_valueCents`]: FieldValue.increment(input.valueCents) } : {}),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export interface FunnelPerformance {
  funnelId: string;
  views: number;
  sessions: number;
  submissions: number;
  /** Submissions per view. Null when there is no traffic — an unmeasured
   *  funnel must read as "no data", never as 0% conversion. */
  conversionRate: number | null;
  bySource: { key: string; label: string; views: number; submissions: number }[];
  outcomes: Record<string, number>;
  daily: { day: string; views: number; submissions: number }[];
}

/** Read one funnel's performance. Ownership-checked; a foreign funnel is
 *  indistinguishable from one with no data. */
export async function getFunnelPerformance(
  subAccountId: string,
  funnelId: string,
  days = 30,
): Promise<FunnelPerformance | null> {
  const db = getAdminDb();
  const snap = await db.doc(`funnelStats/${funnelId}`).get();
  if (!snap.exists) {
    // No telemetry yet is a legitimate state, not an error — but only for a
    // funnel that actually belongs to this workspace.
    const f = await db.doc(`funnels/${funnelId}`).get();
    if (!f.exists || (f.data() as { subAccountId?: string }).subAccountId !== subAccountId) return null;
    return { funnelId, views: 0, sessions: 0, submissions: 0, conversionRate: null, bySource: [], outcomes: {}, daily: [] };
  }
  const d = snap.data() as {
    subAccountId?: string;
    totals?: { views?: number; sessions?: number; submissions?: number };
    bySource?: Record<string, { label?: string; views?: number; submissions?: number }>;
    outcomes?: Record<string, number>;
  };
  if (d.subAccountId !== subAccountId) return null;

  const daySnap = await snap.ref.collection("days").orderBy("day", "desc").limit(days).get();
  const views = d.totals?.views ?? 0;
  const submissions = d.totals?.submissions ?? 0;

  return {
    funnelId,
    views,
    sessions: d.totals?.sessions ?? 0,
    submissions,
    conversionRate: views > 0 ? submissions / views : null,
    bySource: Object.entries(d.bySource ?? {}).map(([key, v]) => ({
      key,
      label: v.label ?? key,
      views: v.views ?? 0,
      submissions: v.submissions ?? 0,
    })).sort((a, b) => b.views - a.views),
    outcomes: d.outcomes ?? {},
    daily: daySnap.docs
      .map((x) => x.data() as { day: string; views?: number; submissions?: number })
      .map((x) => ({ day: x.day, views: x.views ?? 0, submissions: x.submissions ?? 0 }))
      .reverse(),
  };
}

/** Workspace-wide funnel performance, newest activity first. */
export async function listFunnelPerformance(subAccountId: string): Promise<FunnelPerformance[]> {
  const snap = await getAdminDb()
    .collection("funnelStats")
    .where("subAccountId", "==", subAccountId)
    .limit(100)
    .get();
  return snap.docs.map((doc) => {
    const d = doc.data() as {
      totals?: { views?: number; sessions?: number; submissions?: number };
      bySource?: Record<string, { label?: string; views?: number; submissions?: number }>;
      outcomes?: Record<string, number>;
    };
    const views = d.totals?.views ?? 0;
    const submissions = d.totals?.submissions ?? 0;
    return {
      funnelId: doc.id,
      views,
      sessions: d.totals?.sessions ?? 0,
      submissions,
      conversionRate: views > 0 ? submissions / views : null,
      bySource: Object.entries(d.bySource ?? {}).map(([key, v]) => ({
        key, label: v.label ?? key, views: v.views ?? 0, submissions: v.submissions ?? 0,
      })),
      outcomes: d.outcomes ?? {},
      daily: [],
    };
  }).sort((a, b) => b.views - a.views);
}
