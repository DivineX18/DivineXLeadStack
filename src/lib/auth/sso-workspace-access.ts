import "server-only";

import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import type { UserDoc } from "@/types/firebase";
import type { SubAccountMemberDoc } from "@/types/tenancy";

/**
 * The Phase B workspace-authorization check, factored out so Phase E
 * (`/api/auth/sso/exchange-bridge-token`) can re-run the EXACT same check
 * the callback route already ran (Final rule 2 — re-validate the bridge's
 * uid/subAccountId/role still match current reality before completing the
 * sign-in), rather than a second hand-maintained copy that could drift.
 *
 * Returns `{ ok: true }` or `{ ok: false, reason }` — never throws for an
 * expected failure, only for genuine infrastructure errors.
 */
export async function verifySsoWorkspaceAccess(params: {
  uid: string;
  subAccountId: string;
  approvedRole: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { uid, subAccountId, approvedRole } = params;
  const db = getAdminDb();
  const auth = getAdminAuth();

  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) return { ok: false, reason: "sub_account_not_found" };
  const sub = subSnap.data() as { agencyId: string };

  let userRecord;
  try {
    userRecord = await auth.getUser(uid);
  } catch {
    return { ok: false, reason: "mapped_uid_not_found" };
  }
  if (userRecord.disabled) return { ok: false, reason: "account_disabled" };

  const userDocSnap = await db.doc(`users/${uid}`).get();
  const userDoc = userDocSnap.data() as UserDoc | undefined;
  if (!userDocSnap.exists || userDoc?.status === "removed") {
    return { ok: false, reason: "account_removed" };
  }

  const memberSnap = await db
    .doc(`subAccounts/${subAccountId}/subAccountMembers/${uid}`)
    .get();
  const member = memberSnap.data() as SubAccountMemberDoc | undefined;
  const hasActiveMembership = memberSnap.exists && member?.status === "active";

  const claims = userRecord.customClaims as
    | { agencyRole?: string; agencyId?: string }
    | undefined;
  const isAgencyOwnerShortcut =
    claims?.agencyRole === "owner" && claims?.agencyId === sub.agencyId;

  if (!hasActiveMembership && !isAgencyOwnerShortcut) {
    return { ok: false, reason: "no_active_membership" };
  }

  // Never auto-correct a mismatch — fail closed (Final rule 1).
  if (hasActiveMembership && member!.role !== approvedRole) {
    return { ok: false, reason: "role_mismatch" };
  }

  return { ok: true };
}
