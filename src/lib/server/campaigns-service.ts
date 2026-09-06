import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  validateCampaignPlan,
  type CampaignPlan,
  type CampaignStep,
  type CampaignStepStatus,
} from "@/lib/divinex/campaign";

/**
 * CAMPAIGN PERSISTENCE — the campaign's durable shared memory.
 *
 * The plan structure already existed and was already compiled into real Flow
 * systems; the gap was that it was built in memory, used once, and discarded.
 * With nothing persisted there is no shared context for downstream assets to
 * inherit, which is why every generator independently re-decided the offer,
 * audience and CTA.
 *
 * This ADDS storage around the existing `CampaignPlan`. It does not introduce a
 * second campaign model, and it does not copy business truth — the plan keeps
 * referencing canonical ids (offerId, assetIds, brandProfileVersion) and Ascend
 * remains the authority for what the business is.
 *
 * Tenancy is the same as every other collection here: `subAccountId` on the
 * doc, re-checked on every read and write.
 */

export class CampaignValidationError extends Error {}

export interface CampaignDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  /** Customer-facing name, e.g. "More consultation leads". */
  name: string;
  plan: CampaignPlan;
  /** Campaign-level lifecycle, distinct from per-step status. */
  status: "draft" | "active" | "paused" | "archived";
  createdAt: unknown;
  updatedAt: unknown;
}

function toMillis(v: unknown): number {
  const m = v as { toMillis?: () => number } | null;
  return m && typeof m.toMillis === "function" ? m.toMillis() : 0;
}

export async function createCampaign(opts: {
  subAccountId: string;
  createdByUid: string;
  name: string;
  plan: CampaignPlan;
}): Promise<string> {
  // The existing validator stays the authority on whether a plan is coherent —
  // persistence must never become a way to store an invalid plan.
  const check = validateCampaignPlan(opts.plan);
  if (!check.ok) throw new CampaignValidationError(check.errors.join("; "));

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  if (!subSnap.exists) throw new CampaignValidationError("Unknown workspace.");

  const ref = db.collection("campaigns").doc();
  const plan: CampaignPlan = {
    ...opts.plan,
    campaignId: ref.id,
    // Snapshot the load-bearing decisions AS APPROVED, so a later change can
    // be detected without diffing every downstream asset.
    changeAwareness: {
      ...(opts.plan.approved?.primaryCta ? { ctaAtApproval: opts.plan.approved.primaryCta } : {}),
      ...(opts.plan.approved?.centralPromise ? { promiseAtApproval: opts.plan.approved.centralPromise } : {}),
    },
  };

  await ref.set({
    id: ref.id,
    subAccountId: opts.subAccountId,
    agencyId: (subSnap.data()?.agencyId as string) ?? "",
    createdByUid: opts.createdByUid,
    name: opts.name.trim().slice(0, 120) || "Untitled campaign",
    plan,
    status: "draft",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function getCampaign(subAccountId: string, campaignId: string): Promise<CampaignDoc | null> {
  const snap = await getAdminDb().doc(`campaigns/${campaignId}`).get();
  if (!snap.exists) return null;
  const c = { id: snap.id, ...(snap.data() as Omit<CampaignDoc, "id">) };
  // Ownership proof. A foreign campaign is indistinguishable from a missing one.
  return c.subAccountId === subAccountId ? c : null;
}

export async function listCampaigns(subAccountId: string): Promise<CampaignDoc[]> {
  const snap = await getAdminDb()
    .collection("campaigns")
    .where("subAccountId", "==", subAccountId)
    .limit(100)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<CampaignDoc, "id">) }))
    .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
}

/**
 * Update one step — the unit the control centre actually acts on.
 *
 * Linking an asset is how a step becomes CONNECTED: the id is a reference into
 * the system that owns the artifact, so the campaign never becomes a second
 * copy of a funnel or a workflow.
 */
export async function updateCampaignStep(opts: {
  subAccountId: string;
  campaignId: string;
  stepId: string;
  status?: CampaignStepStatus;
  assetKind?: CampaignStep["assetKind"];
  assetId?: string | null;
  /** Appended, never replaced — a customer's own words are history. */
  changeRequest?: string;
}): Promise<CampaignDoc | null> {
  const db = getAdminDb();
  const ref = db.doc(`campaigns/${opts.campaignId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const doc = snap.data() as Omit<CampaignDoc, "id">;
  if (doc.subAccountId !== opts.subAccountId) return null;

  const steps = (doc.plan.steps ?? []).map((s) =>
    s.id === opts.stepId
      ? {
          ...s,
          ...(opts.status ? { status: opts.status } : {}),
          ...(opts.assetKind ? { assetKind: opts.assetKind } : {}),
          ...(opts.assetId !== undefined ? { assetId: opts.assetId } : {}),
          ...(opts.changeRequest
            ? { changeRequests: [...(s.changeRequests ?? []), opts.changeRequest].slice(-20) }
            : {}),
        }
      : s,
  );

  await ref.update({ "plan.steps": steps, updatedAt: FieldValue.serverTimestamp() });
  return { id: snap.id, ...doc, plan: { ...doc.plan, steps } };
}

/**
 * Change the campaign's load-bearing decisions.
 *
 * DOES NOT rewrite downstream assets. It records the new decision and reports
 * which steps still reference the previous one, so the customer decides
 * whether to propagate. Silently rewriting approved or live assets is the one
 * behaviour this must never have.
 */
export async function updateCampaignDecisions(opts: {
  subAccountId: string;
  campaignId: string;
  approved: NonNullable<CampaignPlan["approved"]>;
}): Promise<{ campaign: CampaignDoc; staleSteps: CampaignStep[] } | null> {
  const db = getAdminDb();
  const ref = db.doc(`campaigns/${opts.campaignId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const doc = snap.data() as Omit<CampaignDoc, "id">;
  if (doc.subAccountId !== opts.subAccountId) return null;

  const prevCta = doc.plan.changeAwareness?.ctaAtApproval ?? doc.plan.approved?.primaryCta;
  const prevPromise = doc.plan.changeAwareness?.promiseAtApproval ?? doc.plan.approved?.centralPromise;
  const ctaChanged = !!opts.approved.primaryCta && opts.approved.primaryCta !== prevCta;
  const promiseChanged = !!opts.approved.centralPromise && opts.approved.centralPromise !== prevPromise;

  // A step is stale only if something was actually BUILT from the old
  // decision. Planned/skipped steps have nothing to update.
  const staleSteps =
    ctaChanged || promiseChanged
      ? (doc.plan.steps ?? []).filter(
          (s) => !!s.assetId && ["approved", "connected", "live", "review"].includes(s.status),
        )
      : [];

  const steps = (doc.plan.steps ?? []).map((s) =>
    staleSteps.some((x) => x.id === s.id) ? { ...s, status: "needs_update" as CampaignStepStatus } : s,
  );

  const plan: CampaignPlan = {
    ...doc.plan,
    approved: { ...(doc.plan.approved ?? {}), ...opts.approved },
    steps,
  };

  await ref.update({ plan, updatedAt: FieldValue.serverTimestamp() });
  return { campaign: { id: snap.id, ...doc, plan }, staleSteps };
}

/**
 * The approved decisions downstream generators inherit.
 *
 * Returns null when there is no campaign — individual creation must keep
 * working exactly as it does today, so absence is a normal state, never an
 * error.
 */
export async function campaignContextFor(
  subAccountId: string,
  campaignId: string | null | undefined,
): Promise<{ name: string; approved: NonNullable<CampaignPlan["approved"]>; objective: string; offerState?: string } | null> {
  if (!campaignId) return null;
  const c = await getCampaign(subAccountId, campaignId);
  if (!c) return null;
  return {
    name: c.name,
    approved: c.plan.approved ?? {},
    objective: c.plan.intent.objective,
    ...(c.plan.intent.offerState ? { offerState: c.plan.intent.offerState } : {}),
  };
}
