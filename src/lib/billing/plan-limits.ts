import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { BillingPlanDoc, PlanLimits } from "@/types/billing";
import { ASCEND_SOLO_WORKSPACE_LIMITS } from "@/lib/intelligence/ascend-solo-checkout";
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
 * RESOLVED FROM THE WORKSPACE'S OWN PURCHASED PLAN, and counted there.
 *
 * This was previously pooled at the agency: limits merged the most generous
 * ceiling across every plan the agency had on sale, and all workspaces shared
 * one monthly counter. That is correct for one-agency-per-deployment, and
 * exactly wrong for self-serve, where every customer is a workspace under ONE
 * shared agency. Under the old model a $99 customer received the $797 ceiling,
 * one heavy customer exhausted everyone's quota, and a single plan without
 * limits made every tier unlimited. Limits now come from the plan the workspace
 * actually bought (`subAccounts/{id}.billing.planId`) and are counted per
 * workspace.
 *
 * NO BILLING RECORD MEANS UNLIMITED, deliberately. Absent/null billing is the
 * documented "comped" default for legacy workspaces and the agency owner's own.
 * Limits are a property of what someone BOUGHT; inferring a ceiling for someone
 * who bought nothing would wall existing customers on a guess. This is also what
 * grandfathers everyone who predates plan limits.
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
  | "growthScans"
  | "members"
  | "voiceMinutes"
  | "aiSpend"
  | "sharedSms";

/** Counters that reset each calendar month. `subAccounts`/`websites` are
 *  point-in-time counts of live records instead, so they are absent here. */
const MONTHLY_KINDS = ["emails", "aiGenerations", "growthScans", "voiceMinutes", "aiSpend", "sharedSms"] as const;
type MonthlyKind = (typeof MONTHLY_KINDS)[number];

const LIMIT_FIELD: Record<LimitKind, keyof PlanLimits> = {
  subAccounts: "maxSubAccounts",
  websites: "maxWebsites",
  emails: "maxEmailsPerMonth",
  aiGenerations: "maxAiGenerationsPerMonth",
  growthScans: "maxGrowthScansPerMonth",
  members: "maxMembers",
  voiceMinutes: "maxVoiceMinutesPerMonth",
  aiSpend: "maxAiSpendPerMonth",
  sharedSms: "maxSharedSmsPerMonth",
};

/** Customer-facing nouns. These appear in the refusal, so they are written the
 *  way a customer would describe the thing, not the way the schema names it. */
const LABEL: Record<LimitKind, { one: string; many: string }> = {
  subAccounts: { one: "client workspace", many: "client workspaces" },
  websites: { one: "website", many: "websites" },
  emails: { one: "email", many: "emails" },
  aiGenerations: { one: "generation", many: "AI generations" },
  growthScans: { one: "Growth Scan", many: "Growth Scans" },
  members: { one: "member", many: "members" },
  voiceMinutes: { one: "voice minute", many: "voice minutes" },
  // Customer-facing wording only. The dollar ceiling behind it is internal.
  aiSpend: { one: "AI generation", many: "intelligent generations" },
  sharedSms: { one: "text message", many: "text messages" },
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

export const NO_LIMITS: PlanLimits = {
  maxSubAccounts: null,
  maxWebsites: null,
  maxEmailsPerMonth: null,
  maxAiGenerationsPerMonth: null,
  maxGrowthScansPerMonth: null,
  maxMembers: null,
  maxVoiceMinutesPerMonth: null,
  maxAiSpendPerMonth: null,
  maxSharedSmsPerMonth: null,
};

/**
 * The limits of the plan a workspace is actually on.
 *
 * Resolution is deliberately forgiving: no workspace, no billing record, no
 * planId, a deleted plan or a plan predating limits all read as unlimited.
 * See the "NO BILLING RECORD MEANS UNLIMITED" note at the top of this file.
 *
 * Pass `subAccountData` when the caller already holds the sub-account document
 * (most do) to save a read on the hot path.
 */
export async function resolvePlanLimits(
  subAccountId: string | null,
  subAccountData?: Record<string, unknown> | null,
): Promise<PlanLimits> {
  if (!subAccountId && !subAccountData) return NO_LIMITS;

  try {
    const db = getAdminDb();
    let data = subAccountData ?? null;
    if (!data && subAccountId) {
      const snap = await db.doc(`subAccounts/${subAccountId}`).get();
      if (!snap.exists) return NO_LIMITS;
      data = snap.data() as Record<string, unknown>;
    }
    if (!data) return NO_LIMITS;

    const billing = data.billing as { planId?: string | null } | null | undefined;
    const agencyId = data.agencyId as string | undefined;

    // ONE EXCEPTION TO THE GRANDFATHER CLAUSE.
    //
    // An Ascend-provisioned workspace has no plan because Ascend granted it
    // rather than Client Billing selling it — so it fell through to unlimited
    // alongside the comped and legacy workspaces that clause is actually for.
    // This one is a paying $197 customer, and the only thing standing between
    // it and unlimited Growth Scans, asset generations and broadcast email
    // was three agency gates happening to be off.
    //
    // Checked BEFORE the planId test would reject it, and AFTER nothing:
    // a workspace that later takes a real Flow plan is matched by the branch
    // below and that plan wins, so buying Flow on top of Ascend is unaffected.
    if (!billing?.planId && data.ascendOperations != null) {
      const grant = data.ascendOperations as { provisionedByAscend?: boolean };
      if (grant.provisionedByAscend === true) return ASCEND_SOLO_WORKSPACE_LIMITS;
    }

    // Comped / legacy / agency-owner workspaces carry no plan and stay
    // unlimited — the grandfather clause, stated once here.
    if (!billing?.planId || !agencyId) return NO_LIMITS;

    const planSnap = await db.doc(`agencies/${agencyId}/plans/${billing.planId}`).get();
    if (!planSnap.exists) return NO_LIMITS;
    return (planSnap.data() as BillingPlanDoc).limits ?? NO_LIMITS;
  } catch (err) {
    // Cannot read the plan → cannot prove a limit → allow. Same reasoning as
    // the counter-outage case below.
    console.warn("[plan-limits] resolve failed; treating as unlimited", { subAccountId, err });
    return NO_LIMITS;
  }
}

/** Monthly usage for one workspace. */
async function readMonthlyUsage(subAccountId: string, kind: MonthlyKind): Promise<number> {
  const db = getAdminDb();
  const snap = await db.doc(`subAccounts/${subAccountId}/usageCounters/${monthKey()}`).get();
  return Number((snap.data() as Record<string, unknown> | undefined)?.[kind] ?? 0);
}

/**
 * Record consumption. Best-effort and never throws: a dropped increment costs
 * one unit of accuracy, whereas a throw here would fail the customer's actual
 * action (their email, their asset) for a bookkeeping reason.
 */
export async function recordPlanUsage(
  subAccountId: string | null,
  kind: MonthlyKind,
  amount = 1,
): Promise<void> {
  if (!subAccountId || amount <= 0) return;
  try {
    await getAdminDb()
      .doc(`subAccounts/${subAccountId}/usageCounters/${monthKey()}`)
      .set(
        { [kind]: FieldValue.increment(amount), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
  } catch (err) {
    console.warn("[plan-limits] recordPlanUsage failed", { subAccountId, kind, err });
  }
}

/**
 * May this workspace consume `amount` more of `kind`?
 *
 * Fails OPEN on infrastructure trouble. That is the opposite of how the feature
 * gates behave, and it is deliberate: a gate answers "did they buy this?", where
 * guessing yes gives away product. A limit answers "have they used too much?",
 * where guessing no takes away product someone has already paid for. The costs
 * of being wrong are not symmetrical.
 */
export async function checkPlanLimit(input: {
  subAccountId: string | null;
  kind: LimitKind;
  /** The sub-account doc, when the caller already holds it — saves a read. */
  subAccountData?: Record<string, unknown> | null;
  /** Current count for point-in-time kinds (workspaces, websites). Monthly
   *  kinds read their own counter and ignore this. */
  currentCount?: number;
  amount?: number;
  limits?: PlanLimits;
}): Promise<LimitDecision> {
  const amount = input.amount ?? 1;
  const limits =
    input.limits ?? (await resolvePlanLimits(input.subAccountId, input.subAccountData));
  const limit = limits[LIMIT_FIELD[input.kind]];

  if (limit === null || limit === undefined) return { allowed: true, limit: null, used: 0 };

  let used = input.currentCount ?? 0;
  if ((MONTHLY_KINDS as readonly string[]).includes(input.kind) && input.subAccountId) {
    try {
      used = await readMonthlyUsage(input.subAccountId, input.kind as MonthlyKind);
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
  // A ceiling of zero is not "you ran out", it is "your plan does not include
  // this". Falling through would produce "you've used all 0 Growth Scans
  // (0 of 0)", which reads as a bug and tells the customer nothing.
  // Shared SMS at zero is not an upsell. Texting IS supported, on the
  // customer's own Twilio account, so "upgrade your plan" would be wrong
  // twice: no plan sells the shared sender, and the thing they need is a
  // connection they can make themselves in Settings.
  if (kind === "sharedSms" && limit === 0) {
    return "Connect your Twilio account to send text messages (Settings → SMS).";
  }
  if (limit === 0) {
    return `${many[0].toUpperCase()}${many.slice(1)} aren't included in your plan. Upgrade your plan to use them.`;
  }
  if (kind === "aiSpend") {
    /**
     * NO NUMBER AT ALL.
     *
     * The ceiling is a DOLLAR figure, and every other branch here renders
     * the limit as a count of the thing being limited. That turned $15 into
     * "you've used all 15 intelligent generations", which is both an
     * internal economics leak and untrue: 15 is not a number of
     * generations. The customer needs to know they are out and what to do,
     * and nothing here is improved by a figure.
     */
    return (
      "You've reached this month's included intelligent-generation usage. " +
      "It resets on the 1st, and upgrading your plan raises the allowance."
    );
  }
  if (kind === "members") {
    // A solo plan refusing a second person is a different conversation from
    // running out of websites, so it gets its own sentence.
    if (limit === 1) {
      return (
        "Your plan includes a single user, so there is nobody to invite yet. " +
        "Upgrade your plan to work with a team."
      );
    }
    return (
      `You've reached the ${limit}-member limit on your plan (${used} of ${limit} in use). ` +
      `Upgrade your plan to add more, or remove a member you no longer need.`
    );
  }
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

/**
 * The workspace seat check for the creation path.
 *
 * Scoped to the workspaces THIS person owns (`createdByUid`), never to the
 * whole agency. In self-serve every customer is a workspace under one shared
 * agency, so an agency-wide count meant one customer's workspaces consumed
 * another's seats — and, once the agency passed the merged ceiling, a paying
 * customer could clear checkout and then fail provisioning.
 *
 * The ceiling is the most generous `maxSubAccounts` across the plans that
 * person already holds; someone holding no plan (agency owner, comped, legacy)
 * is unlimited, as is their first workspace.
 */
export async function checkSubAccountLimit(input: {
  agencyId: string | null;
  creatorUid: string | null;
}): Promise<LimitDecision> {
  const unlimited: LimitDecision = { allowed: true, limit: null, used: 0 };
  if (!input.agencyId || !input.creatorUid) return unlimited;

  try {
    const snap = await getAdminDb()
      .collection("subAccounts")
      .where("agencyId", "==", input.agencyId)
      .where("createdByUid", "==", input.creatorUid)
      .get();
    // Archived/removed workspaces should not consume a seat the customer is
    // no longer getting value from.
    const live = snap.docs.filter((d) => (d.data() as SubAccountDoc).status !== "archived");
    if (live.length === 0) return unlimited;

    let ceiling = 0;
    for (const d of live) {
      const l = await resolvePlanLimits(d.id, d.data() as Record<string, unknown>);
      if (l.maxSubAccounts === null || l.maxSubAccounts === undefined) return unlimited;
      ceiling = Math.max(ceiling, l.maxSubAccounts);
    }
    return checkPlanLimit({
      subAccountId: null,
      kind: "subAccounts",
      currentCount: live.length,
      limits: { ...NO_LIMITS, maxSubAccounts: ceiling },
    });
  } catch (err) {
    // Same fail-open reasoning as everywhere else in this module.
    console.warn("[plan-limits] seat check failed; allowing", { ...input, err });
    return unlimited;
  }
}

/**
 * Seat check for the membership path.
 *
 * GRANDFATHER-SAFE BY CONSTRUCTION. This answers one question only: may
 * ANOTHER member be added right now. It never evicts, never disables and
 * never audits what is already there, so introducing a limit below a
 * workspace's current headcount leaves every existing member working and
 * only stops the next addition. Fall back below the cap and the next
 * addition is allowed again, because the count is read live every time.
 *
 * Counts ACTIVE members only: a removed member is not occupying a seat.
 *
 * Fails OPEN, like everything else in this module. A Firestore hiccup must
 * not lock an admin out of inviting their own team; an uncounted seat is
 * the cheaper mistake.
 */
export async function checkMemberLimit(input: {
  subAccountId: string;
  subAccountData?: Record<string, unknown> | null;
  /** Members being added in this operation. Defaults to 1. */
  amount?: number;
}): Promise<LimitDecision> {
  const unlimited: LimitDecision = { allowed: true, limit: null, used: 0 };
  try {
    const limits = await resolvePlanLimits(input.subAccountId, input.subAccountData);
    if (limits.maxMembers === null || limits.maxMembers === undefined) return unlimited;

    const snap = await getAdminDb()
      .collection(`subAccounts/${input.subAccountId}/subAccountMembers`)
      .get();
    const active = snap.docs.filter((d) => (d.data() as { status?: string }).status === "active");

    return checkPlanLimit({
      subAccountId: input.subAccountId,
      kind: "members",
      currentCount: active.length,
      amount: input.amount ?? 1,
      limits,
    });
  } catch (err) {
    console.warn("[plan-limits] member check failed; allowing", {
      subAccountId: input.subAccountId,
      err,
    });
    return unlimited;
  }
}
