import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import {
  getIdentityLinkByClerkId,
  createIdentityLinkIdempotent,
} from "@/lib/auth/identity-links-service";
import {
  createMappingIdempotent,
  getMappingBySubAccountId,
  updateMappingStatus,
} from "@/lib/workspace/workspace-mappings-service";
import { CUSTOM_BRAND } from "@/config/landing";
import { GLOBAL_TERRITORY_ID, type Role } from "@/types";
import type { AscendOperationsGrant } from "@/types/tenancy";

/**
 * ASCEND OWNS THE PURCHASE; FLOW OWNS ITS OWN DATA.
 *
 * The Operations handoff used to deadlock: /sso/operations/start refused
 * without an `active` divinex_workspace_mappings row, and the only things
 * that ever created one ran AFTER a successful handoff. A $197 customer
 * could therefore never make the first crossing, and `provisioning_allowed`
 * — the flag Flow's JIT path required — was never written true by anything.
 *
 * The fix is to give provisioning an owner. Ascend is the only component
 * that knows a growth_system purchase happened, so Ascend orchestrates; but
 * it cannot write Firestore, so Flow executes here behind the same signed
 * service channel the profile webhook already uses. Ascend stores the
 * returned Firebase uid, which puts every later SSO crossing on the
 * pre-existing "returning user" branch. JIT provisioning is retired rather
 * than fixed: nothing needs `provisioning_allowed` any more.
 *
 * Everything here is idempotent. A replayed Stripe webhook, a retried
 * request, or a customer who already had a Flow account must all converge
 * on ONE workspace, ONE identity link and ONE mapping.
 */

export type AscendProvisionInput = {
  clerkUserId: string;
  /** Ascend asserts this is Clerk-verified; the endpoint refuses otherwise. */
  email: string;
  emailVerified: boolean;
  name: string | null;
  businessName: string | null;
  ascendBusinessProfileId: number | null;
};

export type AscendProvisionOutcome =
  | {
      ok: true;
      /** "created" a new workspace, "attached" to one the customer already
       *  owned, or "existing" when this is a pure replay. */
      result: "created" | "attached" | "existing";
      subAccountId: string;
      agencyId: string;
      firebaseUid: string;
      role: "admin";
    }
  | { ok: false; reason: string };

/**
 * Only what a Zeno-generated asset needs somewhere to land. Every
 * spend-capable or outbound channel stays off: an Ascend purchase must not
 * silently switch on broadcasts, WhatsApp, outbound voice or the public API.
 */
const ASCEND_WORKSPACE_GATES = {
  funnelsEnabledByAgency: true,
  websiteEnabledByAgency: true,

  emailDomainEnabledByAgency: false,
  outboundVoiceEnabledByAgency: false,
  whatsappEnabledByAgency: false,
  metaInboxEnabledByAgency: false,
  communityEnabledByAgency: false,
  getLeadsEnabledByAgency: false,
  missedCallTextBackEnabledByAgency: false,
  aiSuiteEnabledByAgency: false,
  customDomainsEnabledByAgency: false,
  funnelCheckoutEnabledByAgency: false,
  socialPlannerEnabledByAgency: false,
  apiAccessEnabledByAgency: false,
  broadcastsEnabledByAgency: false,
  ascendIntelligenceEnabledByAgency: false,
} as const;

function grant(clerkUserId: string, provisionedByAscend: boolean): AscendOperationsGrant {
  return {
    status: "active",
    clerkUserId,
    product: "growth_system",
    provisionedByAscend,
    grantedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** The workspace this uid owns or administers, if any. Membership index only
 *  — never an email lookup. */
async function findOwnedWorkspace(uid: string): Promise<{ subAccountId: string; agencyId: string } | null> {
  const snap = await getAdminDb().collection(`userMemberships/${uid}/subAccounts`).limit(50).get();
  if (snap.empty) return null;
  const admin = snap.docs.find((d) => (d.data() as { role?: string }).role === "admin") ?? snap.docs[0];
  const data = admin.data() as { subAccountId?: string; agencyId?: string };
  if (!data.subAccountId || !data.agencyId) return null;
  return { subAccountId: data.subAccountId, agencyId: data.agencyId };
}

/** Stamp the Ascend grant + mapping onto a workspace, without disturbing
 *  anything else about it. Safe to re-run. */
async function finalize(params: {
  subAccountId: string;
  agencyId: string;
  uid: string;
  clerkUserId: string;
  provisionedByAscend: boolean;
  ascendBusinessProfileId: number | null;
}): Promise<void> {
  const { subAccountId, agencyId, uid, clerkUserId, provisionedByAscend } = params;

  const subRef = getAdminDb().doc(`subAccounts/${subAccountId}`);

  // NEVER DOWNGRADE provisionedByAscend ON A REPLAY.
  //
  // The replay branch calls this with `false`, because it cannot tell from
  // an identity link alone who originally created the workspace. Writing
  // that over an existing `true` would quietly convert an Ascend-created
  // workspace into one Ascend merely attached to — and the withdrawal rule
  // in evaluate-workspace-entitlements only lapses the former, so a
  // cancelled subscription would keep full Flow access forever. Once true,
  // it stays true; only the original creation can set it.
  const prior = (await subRef.get()).data()?.ascendOperations as { provisionedByAscend?: boolean } | undefined;
  const effectiveProvisionedByAscend = prior?.provisionedByAscend === true || provisionedByAscend;

  await subRef.set(
    {
      ascendOperations: grant(clerkUserId, effectiveProvisionedByAscend),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const existing = await getMappingBySubAccountId(subAccountId);
  if (!existing) {
    await createMappingIdempotent({
      flowSubAccountId: subAccountId,
      agencyId,
      ownerFirebaseUid: uid,
      primaryAscendBusinessProfileId: params.ascendBusinessProfileId
        ? String(params.ascendBusinessProfileId)
        : null,
      actingAsUid: "system:ascend-provisioning",
    });
  }
  const mapping = await getMappingBySubAccountId(subAccountId);
  // Only a freshly provisioned mapping is auto-activated. A suspended or
  // archived one stays as it is: provisioning must never silently undo a
  // deliberate operator decision.
  if (mapping && mapping.status === "pending_provision") {
    await updateMappingStatus(mapping.workspaceId, "active", "system:ascend-provisioning");
  }
}

export async function provisionAscendOperationsWorkspace(
  input: AscendProvisionInput,
): Promise<AscendProvisionOutcome> {
  const { clerkUserId, email, emailVerified, name, businessName } = input;

  if (!clerkUserId || !email) return { ok: false, reason: "missing_identity" };
  // Convergence onto an existing Flow account leans on mailbox control, so
  // an unverified address is refused outright rather than trusted.
  if (!emailVerified) return { ok: false, reason: "email_not_verified" };

  const auth = getAdminAuth();
  const db = getAdminDb();
  const displayName = name ?? email.split("@")[0];

  // ── 1. Replay: this Clerk identity is already linked ────────────────────
  const link = await getIdentityLinkByClerkId(clerkUserId);
  if (link && link.status === "active") {
    let existingUid: string;
    try {
      const rec = await auth.getUser(link.firebaseUid);
      if (rec.disabled) return { ok: false, reason: "account_disabled" };
      existingUid = rec.uid;
    } catch {
      return { ok: false, reason: "linked_account_missing" };
    }
    const owned = await findOwnedWorkspace(existingUid);
    if (!owned) return { ok: false, reason: "linked_identity_without_workspace" };
    await finalize({
      subAccountId: owned.subAccountId,
      agencyId: owned.agencyId,
      uid: existingUid,
      clerkUserId,
      provisionedByAscend: false,
      ascendBusinessProfileId: input.ascendBusinessProfileId,
    });
    return {
      ok: true,
      result: "existing",
      subAccountId: owned.subAccountId,
      agencyId: owned.agencyId,
      firebaseUid: existingUid,
      role: "admin",
    };
  }

  // ── 2. Existing Flow customer buying Ascend ─────────────────────────────
  // The ONLY case where an email is consulted, and only to find a candidate:
  // both sides have independently verified the same mailbox (Clerk verified
  // it, Firebase holds it), and the result is recorded as an explicit,
  // audited identityLinks row rather than an implicit runtime match. Every
  // later crossing then resolves through that row, never through email.
  let existingRecord: { uid: string } | null = null;
  try {
    const rec = await auth.getUserByEmail(email);
    existingRecord = { uid: rec.uid };
  } catch {
    existingRecord = null;
  }

  if (existingRecord) {
    const owned = await findOwnedWorkspace(existingRecord.uid);
    if (!owned) return { ok: false, reason: "existing_account_without_workspace" };

    const linked = await createIdentityLinkIdempotent({
      clerkUserId,
      firebaseUid: existingRecord.uid,
      emailAtLinkTime: email,
      linkSource: "ascend_provisioning",
      linkedByUid: "system:ascend-provisioning",
    });
    if (!linked.ok) return { ok: false, reason: linked.reason };

    await finalize({
      subAccountId: owned.subAccountId,
      agencyId: owned.agencyId,
      uid: existingRecord.uid,
      clerkUserId,
      provisionedByAscend: false,
      ascendBusinessProfileId: input.ascendBusinessProfileId,
    });
    return {
      ok: true,
      result: "attached",
      subAccountId: owned.subAccountId,
      agencyId: owned.agencyId,
      firebaseUid: existingRecord.uid,
      role: "admin",
    };
  }

  // ── 3. Brand-new Ascend customer: their own tenant ─────────────────────
  // Their own agency, exactly like a standalone Flow signup. Sharing one
  // DivineX agency across customers would put every Ascend customer inside
  // a tenant whose agency-owner shortcut can read all of them, which is the
  // boundary Phase 11 closed.
  const userRecord = await auth.createUser({ email, displayName }).catch(() => null);
  if (!userRecord) return { ok: false, reason: "create_user_failed" };
  const uid = userRecord.uid;

  const agencyRef = db.collection("agencies").doc();
  const subAccountRef = db.collection("subAccounts").doc();
  const agencyId = agencyRef.id;
  const subAccountId = subAccountRef.id;
  const agencyName = businessName ? `${businessName}` : displayName ? `${displayName}'s Workspace` : CUSTOM_BRAND.name;

  try {
    await auth.setCustomUserClaims(uid, {
      role: "admin" as Role,
      status: "active",
      agencyId,
      agencyRole: "owner",
    });

    const batch = db.batch();
    batch.set(db.doc(`users/${uid}`), {
      uid,
      email,
      displayName,
      photoURL: null,
      stripeCustomerId: null,
      subscriptionStatus: "inactive",
      subscriptionPriceId: null,
      role: "admin" as Role,
      status: "active",
      primaryAgencyId: agencyId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(agencyRef, {
      id: agencyId,
      name: agencyName,
      ownerUid: uid,
      stripeCustomerId: null,
      subscriptionStatus: "inactive",
      subscriptionPriceId: null,
      logoUrl: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(agencyRef.collection("agencyMembers").doc(uid), {
      uid,
      agencyId,
      role: "owner",
      status: "active",
      email,
      displayName,
      addedAt: FieldValue.serverTimestamp(),
      addedByUid: uid,
    });
    batch.set(agencyRef.collection("counters").doc("subAccount"), { next: 1001 });

    // Server-timestamp sentinels stand in for the Date fields SubAccountDoc
    // declares, exactly as the signup route writes them.
    const subDoc: Record<string, unknown> = {
      id: subAccountId,
      agencyId,
      accountNumber: 1000,
      name: "Main",
      slug: "main",
      status: "active",
      timezone: "UTC",
      createdByUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      twilioConfig: null,
      resendConfig: null,
      stripeConfig: null,
      metaConfig: null,
      bookingConfig: null,
      sendWindow: null,
      bookingLink: null,
      replyToEmail: null,
      ...ASCEND_WORKSPACE_GATES,
      // Nothing may fire on its own in a workspace the customer has not
      // opened yet. An operator turns automations on deliberately.
      automationsPaused: true,
      ascendOperations: grant(clerkUserId, true),
    };
    batch.set(subAccountRef, subDoc);

    batch.set(subAccountRef.collection("subAccountMembers").doc(uid), {
      uid,
      subAccountId,
      agencyId,
      role: "admin",
      status: "active",
      email,
      displayName,
      addedAt: FieldValue.serverTimestamp(),
      addedByUid: uid,
      assignedTerritoryIds: [GLOBAL_TERRITORY_ID],
    });
    batch.set(db.doc(`userMemberships/${uid}/agencies/${agencyId}`), {
      agencyId,
      role: "owner",
      name: agencyName,
    });
    batch.set(db.doc(`userMemberships/${uid}/subAccounts/${subAccountId}`), {
      subAccountId,
      agencyId,
      accountNumber: 1000,
      role: "admin",
      name: "Main",
      addedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
  } catch {
    // Never leave a half-built tenant behind.
    await auth.deleteUser(uid).catch(() => undefined);
    return { ok: false, reason: "provision_finalize_failed" };
  }

  const linked = await createIdentityLinkIdempotent({
    clerkUserId,
    firebaseUid: uid,
    emailAtLinkTime: email,
    linkSource: "ascend_provisioning",
    linkedByUid: "system:ascend-provisioning",
  });
  if (!linked.ok) return { ok: false, reason: linked.reason };

  await finalize({
    subAccountId,
    agencyId,
    uid,
    clerkUserId,
    provisionedByAscend: true,
    ascendBusinessProfileId: input.ascendBusinessProfileId,
  });

  return { ok: true, result: "created", subAccountId, agencyId, firebaseUid: uid, role: "admin" };
}
