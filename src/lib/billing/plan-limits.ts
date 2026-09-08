import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { BillingPlanDoc, PlanLimits } from "@/types/billing";
import type { SubAccountDoc } from "@/types";

/**
 * PLAN USAGE CEILINGS — the one place a limit is resolved, counted and refused.
 *
 * WHY THIS EXISTS. Pricing is sold on a gross-margin floor: every plan must
 * stay above 50% even when a customer uses everything it allows. That is only
 * true if the cost drivers actually stop. Feature gates decide WHAT a customer
 * can reach; these decide HOW MUCH, and without them "unlimited" quietly means
 * "unbounded cost" on the tiers that can afford it least.
 *
 * POOLED AT THE AGENCY, deliberately. A per-workspace ceiling protects nothing
 * when the same plan also grants many workspaces — 25 workspaces each under a
 * generous per-workspace cap is 25× the intended spend. The counters therefore
 * live on the agency, and every workspace draws from the same monthly pool.
 *
 * WHAT IS NOT CAPPED, and why: SMS and voice. Those run on the customer's own
 * Twilio credentials, so they are the customer's bill, not the agency's. A cap
 * there would restrict someone's spending of their own money.
 *
 * FAILS GRACEFULLY, NEVER SILENTLY. A refusal returns a specific, actionable
 * message naming the limit and what to do about it. A counter outage does the
 * opposite of a gate outage: it ALLOWS the action (see `checkPlanLimit`),
 * because charging a customer and then blocking them because our own bookkeeping
 * hiccuped is worse than one uncounted send.
 */

export type LimitKind =
  | "subAccounts"
  | "websites"
  | "emails"
  | "aiGenerations"
  | "growthScans";

/** Counters that reset each calendar month. `subAccounts`/`websites` are
 *  point-in-time counts of live records instead, so they are absent here. */
const MONTHLY_KINDS = ["emails", "aiGenerations", "growthScans"] as const;
type MonthlyKind = (typeof MONTHLY_KINDS)[number];

const LIMIT_FIELD: Record<LimitKind, keyof PlanLimits> = {
  subAccounts: "maxSubAccounts",
  websites: "maxWebsites",
  emails: "maxEmailsPerMonth",
  aiGenerations: "maxAiGenerationsPerMonth",
  growthScans: "maxGrowthScansPerMonth",
};

/** Customer-facing nouns. These appear in the refusal, so they are written the
 *  way a customer would describe the thing, not the way the schema names it. */
const LABEL: Record<LimitKind, { one: string; many: string }> = {
  subAccounts: { one: "client workspace", many: "client workspaces" },
  websites: { one: "website", many: "websites" },
  emails: { one: "email", many: "emails" },
  aiGenerations: { one: "generation", many: "AI generations" },
  growthScans: { one: "Growth Scan", many: "Growth Scans" },
};

export interface LimitDecision {
  allowed: boolean;
  /** null when the plan records no ceiling for this kind. */
  limit: number | null;
  used: number;
  /** Populated only when `allowed` is false. Safe to show a customer. */
  message?: string;
}

export function monthKey(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The active plan's limits for an agency.
 *
 * Resolution is deliberately forgiving: no agency, no plan, an archived plan
 * or a plan predating limits all return `null` for every field, which reads as
 * unlimited. Limits are a property of what someone BOUGHT — inferring one from
 * an absent record would wall a paying customer on a guess.
 */
export async function resolvePlanLimits(agencyId: string | null): Promise<PlanLimits> {
  const none: PlanLimits = {
    maxSubAccounts: null,
    maxWebsites: null,
    maxEmailsPerMonth: null,
    maxAiGenerationsPerMonth: null,
    maxGrowthScansPerMonth: null,
  };
  if (!agencyId) return none;

  try {
    const db = getAdminDb();
    // The agency's plan is whichever plan its workspaces are subscribed to.
    // Reading it from the default plan keeps this a single document read on
    // the hot path rather than a per-workspace fan-out.
    const snap = await db
      .collection(`agencies/${agencyId}/plans`)
      .where("status", "==", "active")
      .get();
    if (snap.empty) return none;

    // An agency on several active plans takes the most generous ceiling, so a
    // customer who paid for a higher tier is never limited by a lower one they
    // also happen to hold.
    const plans = snap.docs.map((d) => (d.data() as BillingPlanDoc).limits ?? none);
    const merge = (k: keyof PlanLimits): number | null => {
      const vals = plans.map((p) => p[k]);
      if (vals.some((v) => v === null || v === undefined)) return null; // unlimited wins
      return Math.max(...(vals as number[]));
    };
    return {
      maxSubAccounts: merge("maxSubAccounts"),
      maxWebsites: merge("maxWebsites"),
      maxEmailsPerMonth: merge("maxEmailsPerMonth"),
      maxAiGenerationsPerMonth: merge("maxAiGenerationsPerMonth"),
      maxGrowthScansPerMonth: merge("maxGrowthScansPerMonth"),
    };
  } catch (err) {
    // Cannot read the plan → cannot prove a limit → allow. Same reasoning as
    // the counter-outage case below.
    console.warn("[plan-limits] resolve failed; treating as unlimited", { agencyId, err });
    return none;
  }
}

/** Pooled monthly usage for one agency. */
async function readMonthlyUsage(agencyId: string, kind: MonthlyKind): Promise<number> {
  const db = getAdminDb();
  const snap = await db.doc(`agencies/${agencyId}/usageCounters/${monthKey()}`).get();
  return Number((snap.data() as Record<string, unknown> | undefined)?.[kind] ?? 0);
}

/**
 * Record consumption. Best-effort and never throws: a dropped increment costs
 * one unit of accuracy, whereas a throw here would fail the customer's actual
 * action (their email, their asset) for a bookkeeping reason.
 */
export async function recordPlanUsage(
  agencyId: string | null,
  kind: MonthlyKind,
  amount = 1,
): Promise<void> {
  if (!agencyId || amount <= 0) return;
  try {
    await getAdminDb()
      .doc(`agencies/${agencyId}/usageCounters/${monthKey()}`)
      .set(
        { [kind]: FieldValue.increment(amount), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
  } catch (err) {
    console.warn("[plan-limits] recordPlanUsage failed", { agencyId, kind, err });
  }
}

/**
 * May this agency consume `amount` more of `kind`?
 *
 * Fails OPEN on infrastructure trouble. That is the opposite of how the feature
 * gates behave, and it is deliberate: a gate answers "did they buy this?", where
 * guessing yes gives away product. A limit answers "have they used too much?",
 * where guessing no takes away product someone has already paid for. The costs
 * of being wrong are not symmetrical.
 */
export async function checkPlanLimit(input: {
  agencyId: string | null;
  kind: LimitKind;
  /** Current count for point-in-time kinds (workspaces, websites). Monthly
   *  kinds read their own pooled counter and ignore this. */
  currentCount?: number;
  amount?: number;
  limits?: PlanLimits;
}): Promise<LimitDecision> {
  const amount = input.amount ?? 1;
  const limits = input.limits ?? (await resolvePlanLimits(input.agencyId));
  const limit = limits[LIMIT_FIELD[input.kind]];

  if (limit === null || limit === undefined) return { allowed: true, limit: null, used: 0 };

  let used = input.currentCount ?? 0;
  if ((MONTHLY_KINDS as readonly string[]).includes(input.kind) && input.agencyId) {
    try {
      used = await readMonthlyUsage(input.agencyId, input.kind as MonthlyKind);
    } catch (err) {
      console.warn("[plan-limits] usage read failed; allowing", { kind: input.kind, err });
      return { allowed: true, limit, used: 0 };
    }
  }

  if (used + amount <= limit) return { allowed: true, limit, used };

  return { allowed: false, limit, used, message: limitMessage(input.kind, limit, used) };
}

/**
 * The refusal a customer reads. It names the ceiling, what they have used, and
 * the one action that resolves it — a bare "limit reached" leaves someone stuck
 * with no idea whether to wait, delete something, or pay.
 */
export function limitMessage(kind: LimitKind, limit: number, used: number): string {
  const { one, many } = LABEL[kind];
  if (kind === "subAccounts" || kind === "websites") {
    return (
      `Your plan includes ${limit} ${limit === 1 ? one : many}, and you're using ${used}. ` +
      `Upgrade your plan to add more, or remove one you no longer need.`
    );
  }
  return (
    `You've used all ${limit} ${many} included in your plan this month (${used} of ${limit}). ` +
    `This resets on the 1st. Upgrade your plan to raise the limit.`
  );
}

/** Convenience for the workspace-creation path, which knows the agency but
 *  has to count live workspaces itself. */
export async function checkSubAccountLimit(agencyId: string | null): Promise<LimitDecision> {
  if (!agencyId) return { allowed: true, limit: null, used: 0 };
  const limits = await resolvePlanLimits(agencyId);
  if (limits.maxSubAccounts === null) return { allowed: true, limit: null, used: 0 };
  const snap = await getAdminDb()
    .collection("subAccounts")
    .where("agencyId", "==", agencyId)
    .get();
  // Archived/removed workspaces should not consume a seat the customer is
  // no longer getting value from.
  const live = snap.docs.filter((d) => (d.data() as SubAccountDoc).status !== "archived").length;
  return checkPlanLimit({ agencyId, kind: "subAccounts", currentCount: live, limits });
}
