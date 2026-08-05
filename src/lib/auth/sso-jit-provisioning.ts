import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { verifySsoWorkspaceAccess } from "@/lib/auth/sso-workspace-access";
import type { SubAccountRole } from "@/types/tenancy";

/**
 * Extracted byte-for-byte from the SSO callback route's former inline
 * Phase B(3/4)+C block (Ascend OS Phase 2, Slice 3 — see
 * PHASE_2_IMPLEMENTATION_LEDGER.md for the extraction record and the
 * regression proof). Every audit reason string and extra-field shape is
 * preserved exactly as it was inline. The only thing NOT preserved
 * in-place is building the actual redirect Response — that stays a route
 * handler concern, so this returns an `errorPage` string for the caller
 * to pass to its own `errorRedirect()` instead of deciding the redirect
 * itself.
 *
 * `auditFailure()` is intentionally duplicated (not shared) with the one
 * still defined in callback/route.ts for its other, non-extracted failure
 * branches (missing_code, exchange_rejected, etc.) — collapsing both into
 * one shared helper is a reasonable future cleanup, but bundling it into
 * this behavior-preservation-critical extraction would widen the diff for
 * no functional benefit.
 */

async function auditFailure(reason: string, extra?: Record<string, unknown>) {
  try {
    await getAdminDb().collection("ssoLoginAttempts").add({
      event: "callback_failure",
      failureCategory: reason,
      ...extra,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("[sso/callback] audit write failed", err);
  }
}

export type ResolveOrProvisionResult =
  | { ok: true; uid: string }
  | { ok: false; errorPage: string };

export async function resolveOrProvisionFirebaseUser(params: {
  clerkUserId: string;
  email: string;
  name: string | null;
  leadstackFirebaseUid: string | null;
  leadstackSubAccountId: string;
  leadstackRole: string;
  provisioningAllowed: boolean;
  subAgencyId: string;
  subName: string;
}): Promise<ResolveOrProvisionResult> {
  const {
    clerkUserId,
    email,
    name,
    leadstackFirebaseUid,
    leadstackSubAccountId,
    leadstackRole,
    provisioningAllowed,
    subAgencyId,
    subName,
  } = params;

  if (leadstackFirebaseUid) {
    // Returning user — resolve by the explicitly mapped UID, never by email
    // alone. Verify the account exists, isn't disabled, and its email
    // matches Ascend's verified email as a consistency check (not the
    // lookup key).
    let userRecord;
    try {
      userRecord = await getAdminAuth().getUser(leadstackFirebaseUid);
    } catch {
      await auditFailure("mapped_uid_not_found", { clerkUserId, uid: leadstackFirebaseUid });
      return { ok: false, errorPage: "account_unavailable" };
    }
    if (userRecord.disabled) {
      await auditFailure("account_disabled", { clerkUserId, uid: leadstackFirebaseUid });
      return { ok: false, errorPage: "account_unavailable" };
    }
    if (userRecord.email?.toLowerCase() !== email.toLowerCase()) {
      await auditFailure("email_mismatch", { clerkUserId, uid: leadstackFirebaseUid });
      return { ok: false, errorPage: "account_unavailable" };
    }

    // Active membership in this EXACT sub-account (or the agency-owner
    // shortcut), role matches the mapping exactly (Final rule 1 — never
    // auto-correct a mismatch, fail closed instead). Shared with Phase E's
    // re-validation so both checks can never drift apart.
    const access = await verifySsoWorkspaceAccess({
      uid: leadstackFirebaseUid,
      subAccountId: leadstackSubAccountId,
      approvedRole: leadstackRole,
    });
    if (!access.ok) {
      await auditFailure(access.reason, {
        clerkUserId,
        uid: leadstackFirebaseUid,
        subAccountId: leadstackSubAccountId,
      });
      return { ok: false, errorPage: "no_workspace_access" };
    }

    return { ok: true, uid: leadstackFirebaseUid };
  }

  // Phase C — optional provisioning
  if (!provisioningAllowed) {
    await auditFailure("provisioning_not_allowed", { clerkUserId });
    return { ok: false, errorPage: "setup_needed" };
  }

  let userRecord;
  try {
    userRecord = await getAdminAuth().createUser({
      email,
      displayName: name ?? email.split("@")[0],
      // No password is ever set — this account only ever authenticates
      // via the SSO bridge.
    });
  } catch (err) {
    console.error("[sso/callback] provisioning createUser failed", err);
    await auditFailure("provisioning_create_user_failed", { clerkUserId });
    return { ok: false, errorPage: "provisioning_failed" };
  }
  const uid = userRecord.uid;

  try {
    await getAdminAuth().setCustomUserClaims(uid, {
      role: (leadstackRole === "admin" ? "admin" : "collaborator") as SubAccountRole,
      status: "active",
      agencyId: subAgencyId,
      agencyRole: null,
    });

    const db = getAdminDb();
    const batch = db.batch();
    batch.set(db.doc(`users/${uid}`), {
      uid,
      email,
      displayName: name ?? email.split("@")[0],
      photoURL: null,
      stripeCustomerId: null,
      subscriptionStatus: "inactive",
      subscriptionPriceId: null,
      role: (leadstackRole === "admin" ? "admin" : "collaborator") as SubAccountRole,
      status: "active",
      primaryAgencyId: subAgencyId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(db.doc(`subAccounts/${leadstackSubAccountId}/subAccountMembers/${uid}`), {
      uid,
      subAccountId: leadstackSubAccountId,
      agencyId: subAgencyId,
      role: leadstackRole,
      status: "active",
      email,
      displayName: name ?? email.split("@")[0],
      addedAt: FieldValue.serverTimestamp(),
      addedByUid: uid,
      assignedTerritoryIds: [],
    });
    batch.set(db.doc(`userMemberships/${uid}/subAccounts/${leadstackSubAccountId}`), {
      subAccountId: leadstackSubAccountId,
      agencyId: subAgencyId,
      role: leadstackRole,
      name: subName,
      addedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    console.error("[sso/callback] provisioning finalize failed, rolling back orphan user", err);
    await getAdminAuth()
      .deleteUser(uid)
      .catch(() => undefined);
    await auditFailure("provisioning_finalize_failed", { clerkUserId });
    return { ok: false, errorPage: "provisioning_failed" };
  }

  return { ok: true, uid };
}
