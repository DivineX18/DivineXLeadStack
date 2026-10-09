import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { createContactServerSide } from "@/lib/server/contacts-service";
import { issueOnboardingToken } from "@/lib/onboarding/token";
import { defaultPlatformRequirements, platformByKey } from "@/lib/onboarding/platforms";
import { fireWorkflowTrigger } from "@/lib/workflows/engine";
import type {
  ClientOnboardingDoc,
  OnboardingCompletion,
  OnboardingEventType,
  OnboardingPackageDoc,
  OnboardingPackageSnapshot,
  OnboardingPlatformAccessDoc,
  OnboardingSource,
  OnboardingStatus,
  OnboardingStripeRefs,
} from "@/types/client-onboarding";

/**
 * THE CANONICAL ENROLLMENT SERVICE.
 *
 * Manual enrollment and Stripe enrollment both call `enrollClient()`. They are
 * not two implementations that happen to agree today; there is one
 * orchestration path and the trigger is just an argument. Anything that must
 * happen on enrollment (contact, record, checklist, invite, first email,
 * notification) happens here, once, or it does not happen at all.
 *
 * This file deliberately owns NO scheduling, NO email templates and NO task
 * creation of its own. Those belong to the workflow engine, Resend and the
 * tasks service, all of which already exist and are proven.
 */

const ONBOARDINGS = "clientOnboardings";
const PACKAGES = "onboardingPackages";
const EVENTS = "onboardingEvents";

/* ------------------------------ packages ------------------------------- */

export async function listPackages(agencyId: string): Promise<OnboardingPackageDoc[]> {
  const snap = await getAdminDb()
    .collection(PACKAGES)
    .where("agencyId", "==", agencyId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<OnboardingPackageDoc, "id">) }))
    .sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));
}

export async function getPackage(
  agencyId: string,
  packageId: string,
): Promise<OnboardingPackageDoc | null> {
  const snap = await getAdminDb().doc(`${PACKAGES}/${packageId}`).get();
  if (!snap.exists) return null;
  const data = { id: snap.id, ...(snap.data() as Omit<OnboardingPackageDoc, "id">) };
  // A package id from another agency behaves exactly like a missing one.
  return data.agencyId === agencyId ? data : null;
}

/**
 * Resolve a Stripe price to a package.
 *
 * An EXPLICIT ALLOWLIST, and the only eligibility rule. Never the amount: two
 * unrelated products can cost the same. Never the product name: it is editable
 * in the Stripe dashboard by someone with no idea it is load bearing. A price
 * that matches no package resolves to null, and the caller must treat that as
 * "not a managed-services purchase" rather than guessing.
 */
export async function packageForStripePrice(
  agencyId: string,
  priceId: string,
): Promise<OnboardingPackageDoc | null> {
  if (!priceId) return null;
  const packages = await listPackages(agencyId);
  return (
    packages.find((p) => p.active && (p.stripePriceIds ?? []).includes(priceId)) ?? null
  );
}

function snapshotOf(pkg: OnboardingPackageDoc): OnboardingPackageSnapshot {
  return {
    packageId: pkg.id,
    name: pkg.name,
    slug: pkg.slug,
    priceCents: pkg.priceCents,
    currency: pkg.currency,
    intakeSections: pkg.intakeSections ?? [],
    requiredAssets: pkg.requiredAssets ?? [],
    requiredPlatforms: pkg.requiredPlatforms ?? [],
    productionChecklist: pkg.productionChecklist ?? [],
  };
}

/* -------------------------------- audit -------------------------------- */

/** Append-only, server-only, mirrors billingEvents. Never throws into a
 *  caller: losing an audit line must not fail the action it describes. */
export async function recordOnboardingEvent(opts: {
  onboardingId: string;
  agencyId: string;
  type: OnboardingEventType;
  actor: string;
  detail: string;
}): Promise<void> {
  try {
    await getAdminDb().collection(EVENTS).add({
      onboardingId: opts.onboardingId,
      agencyId: opts.agencyId,
      type: opts.type,
      actor: opts.actor,
      detail: opts.detail.slice(0, 500),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[onboarding] audit write failed", err);
  }
}

/* ------------------------------ completion ----------------------------- */

export function computeCompletion(
  onboarding: Pick<ClientOnboardingDoc, "package" | "intakeSectionsComplete">,
  assetKeys: string[],
  access: Pick<OnboardingPlatformAccessDoc, "key" | "state" | "required">[],
): OnboardingCompletion {
  const sections = onboarding.package.intakeSections ?? [];
  const done = (onboarding.intakeSectionsComplete ?? []).filter((s) => sections.includes(s));
  const intakePct = sections.length === 0 ? 100 : Math.round((done.length / sections.length) * 100);

  const requiredAssets = onboarding.package.requiredAssets ?? [];
  const haveAssets = requiredAssets.filter((k) => assetKeys.includes(k));
  const assetsPct =
    requiredAssets.length === 0 ? 100 : Math.round((haveAssets.length / requiredAssets.length) * 100);

  // Only VERIFIED counts. A client saying they sent the invite is not access,
  // and letting it count would make the dashboard lie about readiness.
  const requiredAccess = access.filter((a) => a.required);
  const verified = requiredAccess.filter((a) => a.state === "verified");
  const accessPct =
    requiredAccess.length === 0 ? 100 : Math.round((verified.length / requiredAccess.length) * 100);

  return {
    intakePct,
    assetsPct,
    accessPct,
    overallPct: Math.round((intakePct + assetsPct + accessPct) / 3),
  };
}

/* ------------------------------- enroll -------------------------------- */

export interface EnrollClientInput {
  agencyId: string;
  /** The DIVINEX workspace the CRM contact is created in. */
  crmSubAccountId: string;
  packageId: string;
  businessName: string;
  contactEmail: string;
  contactName?: string;
  websiteUrl?: string | null;
  notes?: string | null;
  accountOwnerUid: string;
  createdByUid: string;
  source: OnboardingSource;
  stripe?: OnboardingStripeRefs | null;
  /** Reuse an existing CRM contact rather than creating a second one. */
  existingContactId?: string | null;
}

export type EnrollResult =
  | { ok: true; onboarding: ClientOnboardingDoc; inviteToken: string }
  | { ok: false; reason: "package_missing" | "duplicate" | "invalid"; detail?: string };

/**
 * Create the engagement. One path, whatever triggered it.
 *
 * NO WORKSPACE IS CREATED HERE. `subAccountId` stays null until handoff: a
 * prospect who pays and goes quiet should leave a contact and a stalled
 * record, not an empty workspace with its own billing and sidebar.
 */
export async function enrollClient(input: EnrollClientInput): Promise<EnrollResult> {
  const db = getAdminDb();
  const email = input.contactEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, reason: "invalid", detail: "A contact email is required." };
  if (!input.businessName.trim()) return { ok: false, reason: "invalid", detail: "A business name is required." };

  const pkg = await getPackage(input.agencyId, input.packageId);
  if (!pkg) return { ok: false, reason: "package_missing" };

  // One live engagement per business per package. A second purchase of a
  // DIFFERENT package is a legitimate new engagement, so the guard is on the
  // pair, not on the email alone.
  const existing = await db
    .collection(ONBOARDINGS)
    .where("agencyId", "==", input.agencyId)
    .where("contactEmail", "==", email)
    .where("packageId", "==", input.packageId)
    .get();
  const live = existing.docs.find((d) => {
    const s = (d.data() as ClientOnboardingDoc).status;
    return s !== "cancelled" && s !== "completed";
  });
  if (live) {
    return { ok: false, reason: "duplicate", detail: `Already onboarding as ${live.id}.` };
  }

  let contactId = input.existingContactId ?? null;
  if (!contactId) {
    const found = await db
      .collection("contacts")
      .where("subAccountId", "==", input.crmSubAccountId)
      .where("email", "==", email)
      .limit(1)
      .get();
    contactId = found.empty ? null : found.docs[0].id;
  }
  if (!contactId) {
    const created = await createContactServerSide({
      subAccountId: input.crmSubAccountId,
      agencyId: input.agencyId,
      createdByUid: input.createdByUid,
      mode: "live",
      name: input.contactName?.trim() || input.businessName.trim(),
      email,
      phone: "",
      company: input.businessName.trim(),
      address: "",
      source: "client-onboarding",
      tags: ["client-onboarding", pkg.slug],
    } as never);
    contactId = (created as { id?: string }).id ?? String(created);
  }

  const ref = db.collection(ONBOARDINGS).doc();
  const { token, hash } = issueOnboardingToken(ref.id);
  const expires = new Date();
  expires.setDate(expires.getDate() + INVITE_DAYS);

  const doc: Omit<ClientOnboardingDoc, "id"> = {
    agencyId: input.agencyId,
    subAccountId: null,
    contactId,
    businessName: input.businessName.trim(),
    contactEmail: email,
    websiteUrl: input.websiteUrl?.trim() || null,
    notes: input.notes?.trim() || null,
    packageId: pkg.id,
    package: snapshotOf(pkg),
    status: "draft",
    accountOwnerUid: input.accountOwnerUid,
    source: input.source,
    stripe: input.stripe ?? null,
    inviteTokenHash: hash,
    inviteExpiresAt: expires,
    intake: {},
    intakeSectionsComplete: [],
    intakeSubmittedAt: null,
    completion: { intakePct: 0, assetsPct: 0, accessPct: 0, overallPct: 0 },
    blockedReason: null,
    lastClientActivityAt: null,
    lastReminderAt: null,
    readyForProductionAt: null,
    completedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdByUid: input.createdByUid,
  };
  await ref.set(doc);

  // The checklist is seeded from the SNAPSHOT, so a later package edit cannot
  // silently add a requirement to an engagement already under way.
  const batch = db.batch();
  for (const req of doc.package.requiredPlatforms) {
    const def = platformByKey(req.key);
    batch.set(ref.collection("platformAccess").doc(req.key), {
      key: req.key,
      state: req.required ? "not_invited" : "not_required",
      permissionLevel: req.permissionLevel || def?.defaultPermission || "As discussed",
      required: req.required,
      invitedAt: null,
      verifiedAt: null,
      verifiedByUid: null,
      note: null,
      updatedAt: FieldValue.serverTimestamp(),
    } satisfies Omit<OnboardingPlatformAccessDoc, "id">);
  }
  await batch.commit();

  await recordOnboardingEvent({
    onboardingId: ref.id,
    agencyId: input.agencyId,
    type: "onboarding.created",
    actor: input.createdByUid,
    detail: `${input.businessName.trim()} enrolled on ${pkg.name} via ${input.source}.`,
  });

  // The welcome sequence and every reminder after it are ordinary workflows
  // on an ordinary trigger. No scheduler is built here: the engine already
  // owns waits, conditions, QStash, the send window and opt-out.
  //
  // fireWorkflowTrigger never throws by contract, but it is awaited inside
  // the same try as nothing else, because an enrollment that succeeded must
  // not be reported as failed because a workflow lookup hiccuped.
  try {
    await fireWorkflowTrigger({
      subAccountId: input.crmSubAccountId,
      agencyId: input.agencyId,
      type: "onboarding.created",
      contactId,
      context: {
        onboardingId: ref.id,
        businessName: doc.businessName,
        packageName: pkg.name,
        packageSlug: pkg.slug,
        source: input.source,
      },
    });
  } catch (err) {
    console.error("[onboarding] workflow trigger failed", err);
  }

  return {
    ok: true,
    onboarding: { id: ref.id, ...doc } as ClientOnboardingDoc,
    inviteToken: token,
  };
}

export const INVITE_DAYS = 30;

/* -------------------------------- reads -------------------------------- */

export async function getOnboarding(
  agencyId: string,
  onboardingId: string,
): Promise<ClientOnboardingDoc | null> {
  const snap = await getAdminDb().doc(`${ONBOARDINGS}/${onboardingId}`).get();
  if (!snap.exists) return null;
  const data = { id: snap.id, ...(snap.data() as Omit<ClientOnboardingDoc, "id">) };
  return data.agencyId === agencyId ? data : null;
}

export async function listOnboardings(agencyId: string): Promise<ClientOnboardingDoc[]> {
  const snap = await getAdminDb()
    .collection(ONBOARDINGS)
    .where("agencyId", "==", agencyId)
    .limit(500)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClientOnboardingDoc, "id">) }));
}

export async function listAccess(
  onboardingId: string,
): Promise<OnboardingPlatformAccessDoc[]> {
  const snap = await getAdminDb()
    .collection(`${ONBOARDINGS}/${onboardingId}/platformAccess`)
    .get();
  return snap.docs.map((d) => ({ ...(d.data() as OnboardingPlatformAccessDoc), key: d.id }));
}

export async function listAssetKeys(onboardingId: string): Promise<string[]> {
  const snap = await getAdminDb().collection(`${ONBOARDINGS}/${onboardingId}/assets`).get();
  return [...new Set(snap.docs.map((d) => String(d.data().key ?? "")))].filter(Boolean);
}

/** Recompute and persist completion. Cheap, and always from live subdocs
 *  rather than a counter that can drift. */
export async function refreshCompletion(
  onboarding: ClientOnboardingDoc,
): Promise<OnboardingCompletion> {
  const [assetKeys, access] = await Promise.all([
    listAssetKeys(onboarding.id),
    listAccess(onboarding.id),
  ]);
  const completion = computeCompletion(onboarding, assetKeys, access);
  await getAdminDb()
    .doc(`${ONBOARDINGS}/${onboarding.id}`)
    .update({ completion, updatedAt: FieldValue.serverTimestamp() });
  return completion;
}

/* ------------------------------- status -------------------------------- */

export async function setOnboardingStatus(opts: {
  agencyId: string;
  onboardingId: string;
  status: OnboardingStatus;
  actor: string;
  blockedReason?: string | null;
}): Promise<boolean> {
  const onboarding = await getOnboarding(opts.agencyId, opts.onboardingId);
  if (!onboarding) return false;
  const patch: Record<string, unknown> = {
    status: opts.status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (opts.status === "blocked") patch.blockedReason = opts.blockedReason ?? null;
  if (opts.status !== "blocked") patch.blockedReason = null;
  if (opts.status === "ready_for_production") patch.readyForProductionAt = FieldValue.serverTimestamp();
  if (opts.status === "completed") patch.completedAt = FieldValue.serverTimestamp();
  await getAdminDb().doc(`${ONBOARDINGS}/${opts.onboardingId}`).update(patch);

  const TYPE: Partial<Record<OnboardingStatus, OnboardingEventType>> = {
    blocked: "onboarding.blocked",
    paused: "onboarding.paused",
    in_progress: "onboarding.resumed",
    cancelled: "onboarding.cancelled",
    ready_for_production: "onboarding.ready_for_production",
    completed: "onboarding.completed",
  };
  const type = TYPE[opts.status];
  if (type) {
    await recordOnboardingEvent({
      onboardingId: opts.onboardingId,
      agencyId: opts.agencyId,
      type,
      actor: opts.actor,
      detail: opts.blockedReason ? `Status ${opts.status}: ${opts.blockedReason}` : `Status set to ${opts.status}.`,
    });
  }
  return true;
}

/** Rotate the invite link. The previous one dies immediately. */
export async function reissueInvite(opts: {
  agencyId: string;
  onboardingId: string;
  actor: string;
}): Promise<string | null> {
  const onboarding = await getOnboarding(opts.agencyId, opts.onboardingId);
  if (!onboarding) return null;
  const { token, hash } = issueOnboardingToken(onboarding.id);
  const expires = new Date();
  expires.setDate(expires.getDate() + INVITE_DAYS);
  await getAdminDb().doc(`${ONBOARDINGS}/${onboarding.id}`).update({
    inviteTokenHash: hash,
    inviteExpiresAt: expires,
    status: onboarding.status === "draft" ? "invited" : onboarding.status,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await recordOnboardingEvent({
    onboardingId: onboarding.id,
    agencyId: opts.agencyId,
    type: "onboarding.invited",
    actor: opts.actor,
    detail: "Invite link issued.",
  });
  return token;
}

export { defaultPlatformRequirements };
