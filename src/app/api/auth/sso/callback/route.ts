import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { issueSsoBridgeToken } from "@/lib/auth/sso-bridge-token";
import { resolveOrProvisionFirebaseUser } from "@/lib/auth/sso-jit-provisioning";
import { createIdentityLinkIdempotent } from "@/lib/auth/identity-links-service";
import { createMappingIdempotent, getMappingBySubAccountId, updateMappingStatus } from "@/lib/workspace/workspace-mappings-service";
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

  // Resolve the existing mapped Firebase user, or JIT-provision a new one —
  // extracted to lib/auth/sso-jit-provisioning.ts (Ascend OS Phase 2, Slice
  // 3). Byte-for-byte identical logic to what was inline here; see
  // PHASE_2_IMPLEMENTATION_LEDGER.md for the extraction record.
  const resolved = await resolveOrProvisionFirebaseUser({
    clerkUserId: identity.clerkUserId,
    email: identity.email,
    name: identity.name,
    leadstackFirebaseUid,
    leadstackSubAccountId,
    leadstackRole,
    provisioningAllowed: identity.provisioningAllowed,
    subAgencyId: sub.agencyId,
    subName: sub.name,
  });
  if (!resolved.ok) {
    return errorRedirect(request, resolved.errorPage);
  }
  const uid = resolved.uid;

  // ── Phase C.5 — Full Ascend provisioning (Ascend OS launch pass, 2026-08-08) ──
  // Closes the launch-blocking gap where a successful, legitimate SSO login
  // still left the workspace stuck in crm_only mode because nothing ever
  // created the Flow-side identityLinks/workspaceMappings docs that
  // evaluate-workspace-entitlements.ts requires for full_ascend — those were
  // previously script-only (scripts/backfill-identity-link.mts,
  // scripts/migrate-single-workspace-mapping.mts), run by hand per customer.
  // "sso_bridge_jit" is an already-defined IdentityLinkSource (see
  // types/identity-links.ts) specifically anticipating this call site.
  // Best-effort: a failure here must never block the login itself (the
  // customer still gets into Flow at crm_only tier; this can retry on their
  // next SSO login, since both calls below are idempotent). Deliberately
  // does NOT set a primaryAscendBusinessProfileId — null is an
  // already-handled state (see GrowthScoreCard/memory-card's
  // "no_linked_business_profile" prompt), not a gap being papered over.
  try {
    await createIdentityLinkIdempotent({
      clerkUserId: identity.clerkUserId,
      firebaseUid: uid,
      emailAtLinkTime: identity.email,
      linkSource: "sso_bridge_jit",
      linkedByUid: uid,
    });

    const existingMapping = await getMappingBySubAccountId(leadstackSubAccountId);
    if (!existingMapping) {
      const created = await createMappingIdempotent({
        flowSubAccountId: leadstackSubAccountId,
        agencyId: sub.agencyId,
        ownerFirebaseUid: uid,
        primaryAscendBusinessProfileId: null,
        actingAsUid: "system:sso-bridge",
      });
      if (created.ok && created.value.mapping.status === "pending_provision") {
        await updateMappingStatus(created.value.mapping.workspaceId, "active", "system:sso-bridge");
      }
    } else if (existingMapping.status === "pending_provision") {
      // Only auto-activate a freshly-created mapping still awaiting its
      // first activation. "suspended" and "archived" are deliberate operator
      // actions — an SSO login must never silently override those.
      await updateMappingStatus(existingMapping.workspaceId, "active", "system:sso-bridge");
    }
  } catch (err) {
    console.warn("[sso/callback] full-Ascend provisioning failed (non-blocking)", err);
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
