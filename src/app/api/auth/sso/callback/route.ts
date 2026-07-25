import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { issueSsoBridgeToken } from "@/lib/auth/sso-bridge-token";
import { verifySsoWorkspaceAccess } from "@/lib/auth/sso-workspace-access";
import type { SubAccountDoc, SubAccountRole } from "@/types/tenancy";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/sso/callback — Version 1 SSO from Ascend. Public route (see
 * middleware.ts PUBLIC_PATHS) since the visitor isn't authenticated here yet;
 * the one-time code IS the credential for this leg. Full design + numbered
 * corrections/final rules: /Users/boss/.claude/plans/rosy-finding-summit.md.
 *
 * Five phases, each with its own failure handling + audit event:
 *   A. Identity verification  — server-to-server exchange with Ascend.
 *   B. Workspace authorization — sub-account exists, member active, role
 *      recognized, not disabled. A mapping row is necessary but never
 *      sufficient — Ascend already re-checked the growth_operations
 *      entitlement before returning anything.
 *   C. Optional provisioning  — only when no existing Firebase uid was
 *      mapped AND Ascend says provisioning is allowed.
 *   D. Bridge creation        — mints a short-lived, single-use bridge
 *      token bound to {uid, subAccountId, approvedRole}, set as an
 *      HttpOnly cookie, never a URL param.
 *
 * Phase E (finish, Firebase custom token + session cookie) lives in
 * /auth/sso/finish + /api/auth/sso/exchange-bridge-token.
 */

const ERROR_PAGE = "/auth/sso/error";
const BRIDGE_COOKIE = "__sso_bridge";

interface AscendExchangeResponse {
  email: string;
  emailVerified: boolean;
  name: string | null;
  clerkUserId: string;
  leadstackSubAccountId: string;
  leadstackRole: string;
  leadstackFirebaseUid: string | null;
  provisioningAllowed: boolean;
}

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

async function auditSuccess(uid: string, subAccountId: string) {
  try {
    await getAdminDb().collection("ssoLoginAttempts").add({
      event: "bridge_created",
      uid,
      subAccountId,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("[sso/callback] audit write failed", err);
  }
}

function errorRedirect(request: Request, reason: string): NextResponse {
  const url = new URL(ERROR_PAGE, request.url);
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) {
    await auditFailure("missing_code");
    return errorRedirect(request, "missing_code");
  }

  const exchangeUrl = process.env.ASCEND_SSO_EXCHANGE_URL;
  const sharedSecret = process.env.ASCEND_SSO_SHARED_SECRET;
  if (!exchangeUrl || !sharedSecret) {
    console.error("[sso/callback] ASCEND_SSO_EXCHANGE_URL/ASCEND_SSO_SHARED_SECRET not configured");
    return errorRedirect(request, "not_configured");
  }

  // ── Phase A — identity verification ────────────────────────────────────
  let identity: AscendExchangeResponse;
  try {
    const res = await fetch(exchangeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sharedSecret}`,
      },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      await auditFailure("exchange_rejected", { ascendError: body?.error ?? null, status: res.status });
      return errorRedirect(request, "exchange_rejected");
    }
    identity = await res.json();
  } catch (err) {
    console.error("[sso/callback] exchange request failed", err);
    await auditFailure("exchange_network_error");
    return errorRedirect(request, "network_error");
  }

  if (!identity.emailVerified) {
    await auditFailure("unverified_email", { clerkUserId: identity.clerkUserId });
    return errorRedirect(request, "unverified_email");
  }

  const db = getAdminDb();
  const auth = getAdminAuth();
  const { leadstackSubAccountId, leadstackFirebaseUid, leadstackRole } = identity;

  // ── Phase B — workspace authorization ──────────────────────────────────
  // 1. Target sub-account exists.
  const subSnap = await db.doc(`subAccounts/${leadstackSubAccountId}`).get();
  if (!subSnap.exists) {
    await auditFailure("sub_account_not_found", { clerkUserId: identity.clerkUserId, subAccountId: leadstackSubAccountId });
    return errorRedirect(request, "workspace_unavailable");
  }
  const sub = subSnap.data() as SubAccountDoc;

  // 2. Recognized role.
  const RECOGNIZED_ROLES: SubAccountRole[] = ["admin", "collaborator"];
  if (!RECOGNIZED_ROLES.includes(leadstackRole as SubAccountRole)) {
    await auditFailure("role_not_recognized", { clerkUserId: identity.clerkUserId, role: leadstackRole });
    return errorRedirect(request, "role_not_recognized");
  }

  let uid: string;

  if (leadstackFirebaseUid) {
    // Returning user — resolve by the explicitly mapped UID, never by email
    // alone. Verify the account exists, isn't disabled, and its email
    // matches Ascend's verified email as a consistency check (not the
    // lookup key).
    let userRecord;
    try {
      userRecord = await auth.getUser(leadstackFirebaseUid);
    } catch {
      await auditFailure("mapped_uid_not_found", { clerkUserId: identity.clerkUserId, uid: leadstackFirebaseUid });
      return errorRedirect(request, "account_unavailable");
    }
    if (userRecord.disabled) {
      await auditFailure("account_disabled", { clerkUserId: identity.clerkUserId, uid: leadstackFirebaseUid });
      return errorRedirect(request, "account_unavailable");
    }
    if (userRecord.email?.toLowerCase() !== identity.email.toLowerCase()) {
      await auditFailure("email_mismatch", { clerkUserId: identity.clerkUserId, uid: leadstackFirebaseUid });
      return errorRedirect(request, "account_unavailable");
    }

    // 3/4. Active membership in this EXACT sub-account (or the agency-owner
    // shortcut), role matches the mapping exactly (Final rule 1 — never
    // auto-correct a mismatch, fail closed instead). Shared with Phase E's
    // re-validation so both checks can never drift apart.
    const access = await verifySsoWorkspaceAccess({
      uid: leadstackFirebaseUid,
      subAccountId: leadstackSubAccountId,
      approvedRole: leadstackRole,
    });
    if (!access.ok) {
      await auditFailure(access.reason, { clerkUserId: identity.clerkUserId, uid: leadstackFirebaseUid, subAccountId: leadstackSubAccountId });
      return errorRedirect(request, "no_workspace_access");
    }

    uid = leadstackFirebaseUid;
  } else {
    // ── Phase C — optional provisioning ──────────────────────────────────
    if (!identity.provisioningAllowed) {
      await auditFailure("provisioning_not_allowed", { clerkUserId: identity.clerkUserId });
      return errorRedirect(request, "setup_needed");
    }

    let userRecord;
    try {
      userRecord = await auth.createUser({
        email: identity.email,
        displayName: identity.name ?? identity.email.split("@")[0],
        // No password is ever set — this account only ever authenticates
        // via the SSO bridge.
      });
    } catch (err) {
      console.error("[sso/callback] provisioning createUser failed", err);
      await auditFailure("provisioning_create_user_failed", { clerkUserId: identity.clerkUserId });
      return errorRedirect(request, "provisioning_failed");
    }
    uid = userRecord.uid;

    try {
      await auth.setCustomUserClaims(uid, {
        role: (leadstackRole === "admin" ? "admin" : "collaborator") as SubAccountRole,
        status: "active",
        agencyId: sub.agencyId,
        agencyRole: null,
      });

      const batch = db.batch();
      batch.set(db.doc(`users/${uid}`), {
        uid,
        email: identity.email,
        displayName: identity.name ?? identity.email.split("@")[0],
        photoURL: null,
        stripeCustomerId: null,
        subscriptionStatus: "inactive",
        subscriptionPriceId: null,
        role: (leadstackRole === "admin" ? "admin" : "collaborator") as SubAccountRole,
        status: "active",
        primaryAgencyId: sub.agencyId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(
        db.doc(`subAccounts/${leadstackSubAccountId}/subAccountMembers/${uid}`),
        {
          uid,
          subAccountId: leadstackSubAccountId,
          agencyId: sub.agencyId,
          role: leadstackRole,
          status: "active",
          email: identity.email,
          displayName: identity.name ?? identity.email.split("@")[0],
          addedAt: FieldValue.serverTimestamp(),
          addedByUid: uid,
          assignedTerritoryIds: [],
        },
      );
      batch.set(
        db.doc(`userMemberships/${uid}/subAccounts/${leadstackSubAccountId}`),
        {
          subAccountId: leadstackSubAccountId,
          agencyId: sub.agencyId,
          role: leadstackRole,
          name: sub.name,
          addedAt: FieldValue.serverTimestamp(),
        },
      );
      await batch.commit();
    } catch (err) {
      console.error("[sso/callback] provisioning finalize failed, rolling back orphan user", err);
      await auth.deleteUser(uid).catch(() => undefined);
      await auditFailure("provisioning_finalize_failed", { clerkUserId: identity.clerkUserId });
      return errorRedirect(request, "provisioning_failed");
    }
  }

  // ── Phase D — bridge creation ──────────────────────────────────────────
  const bridgeRef = db.collection("ssoBridge").doc();
  const bridgeId = bridgeRef.id;
  const { token, hash } = issueSsoBridgeToken(bridgeId);
  const expiresAt = Date.now() + 30_000;

  await bridgeRef.set({
    uid,
    bridgeId,
    tokenHash: hash,
    subAccountId: leadstackSubAccountId,
    approvedRole: leadstackRole,
    expiresAt,
    createdAt: FieldValue.serverTimestamp(),
    usedAt: null,
  });

  await auditSuccess(uid, leadstackSubAccountId);

  const response = NextResponse.redirect(new URL("/auth/sso/finish", request.url));
  response.cookies.set(BRIDGE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 30,
    // Must cover both /auth/sso/finish (the page navigation) and
    // /api/auth/sso/exchange-bridge-token (the same-origin fetch the finish
    // page makes) — those are different path prefixes, so this needs to be
    // root-scoped. Short 30s TTL + HttpOnly + Secure keeps the blast radius
    // small regardless.
    path: "/",
  });
  return response;
}
