import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import type {
  AgencyRole,
  MemberStatus,
  Role,
  SubAccountRole,
} from "@/types";

export interface AuthedCaller {
  uid: string;
  email: string;
  agencyId: string | null;
  agencyRole: AgencyRole | null;
  status: MemberStatus;
}

export interface SubAccountAccess extends AuthedCaller {
  subAccountId: string;
  subAccountRole: SubAccountRole | "agencyOwner";
}

type Claims = {
  role?: Role;
  status?: MemberStatus;
  agencyId?: string | null;
  agencyRole?: AgencyRole | null;
};

function readUidFromHeaders(request: Request): {
  uid: string;
  email: string;
} | null {
  const uid = request.headers.get("x-user-uid");
  if (!uid) return null;
  return { uid, email: request.headers.get("x-user-email") ?? "" };
}

async function readClaims(uid: string): Promise<Claims> {
  const record = await getAdminAuth().getUser(uid);
  return (record.customClaims ?? {}) as Claims;
}

/**
 * Uid-based equivalent of readCaller, for callers that don't have a
 * Request object (Ascend OS Phase 2, Slice 5's workspace-permission
 * evaluator takes a plain uid). Same claims-reading + active-status check
 * as readCaller, minus the request-header extraction — reused, not
 * reimplemented. `email` is intentionally blank here since no caller of
 * this uid-based path has ever needed it for an authorization decision
 * (SubAccountAccess consumers only read uid/agencyId/agencyRole/status/
 * subAccountRole) — matches "never expose more than needed."
 */
export async function resolveAuthedCaller(
  uid: string,
): Promise<{ ok: true; caller: AuthedCaller } | { ok: false; reason: "account_inactive" }> {
  const claims = await readClaims(uid);
  if (claims.status !== "active") {
    return { ok: false, reason: "account_inactive" };
  }
  return {
    ok: true,
    caller: {
      uid,
      email: "",
      agencyId: claims.agencyId ?? null,
      agencyRole: claims.agencyRole ?? null,
      status: claims.status,
    },
  };
}

async function readCaller(
  request: Request,
): Promise<AuthedCaller | NextResponse> {
  const headerAuth = readUidFromHeaders(request);
  if (!headerAuth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const claims = await readClaims(headerAuth.uid);
  if (claims.status !== "active") {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  return {
    uid: headerAuth.uid,
    email: headerAuth.email,
    agencyId: claims.agencyId ?? null,
    agencyRole: claims.agencyRole ?? null,
    status: claims.status,
  };
}

/** Caller must be the owner of the named agency. */
export async function requireAgencyOwner(
  request: Request,
  agencyId: string,
): Promise<AuthedCaller | NextResponse> {
  const caller = await readCaller(request);
  if (caller instanceof NextResponse) return caller;
  if (caller.agencyRole !== "owner" || caller.agencyId !== agencyId) {
    return NextResponse.json({ error: "Agency owner only" }, { status: 403 });
  }
  return caller;
}

/**
 * Caller must be an agency owner — resolves their own `agencyId` from claims
 * rather than requiring it up front. Use when the agencyId isn't known from
 * the route (e.g. an agency-scoped action keyed to the caller's own agency).
 */
export async function requireAgencyOwnerAny(
  request: Request,
): Promise<AuthedCaller | NextResponse> {
  const caller = await readCaller(request);
  if (caller instanceof NextResponse) return caller;
  if (caller.agencyRole !== "owner" || !caller.agencyId) {
    return NextResponse.json({ error: "Agency owner only" }, { status: 403 });
  }
  return caller;
}

/**
 * The NextResponse-free core of requireSubAccountMember, extracted for
 * Ascend OS Phase 2, Slice 5 so the new workspace-permission evaluator
 * (lib/permissions/evaluate-workspace-permission.ts, which explicitly must
 * NOT import NextResponse) can resolve the exact same access decision
 * requireSubAccountMember already makes, from a plain `uid`, without a
 * second, independently reinterpreted implementation. Byte-for-byte
 * identical decision logic to what was inline below before this
 * extraction — only the failure signaling changed shape (a typed reason
 * instead of building a NextResponse directly). Proven by
 * scripts/verify-require-tenancy-extraction.mts, same technique as Slice
 * 3's SSO/JIT extraction (diffs against the pre-extraction commit).
 */
export type SubAccountAccessResolution =
  | { ok: true; access: SubAccountAccess }
  | { ok: false; reason: "sub_account_not_found" | "not_a_member" | "membership_inactive" };

export async function resolveSubAccountAccess(
  caller: AuthedCaller,
  subAccountId: string,
): Promise<SubAccountAccessResolution> {
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return { ok: false, reason: "sub_account_not_found" };
  }
  const sub = subSnap.data() ?? {};

  if (caller.agencyRole === "owner" && caller.agencyId === sub.agencyId) {
    return { ok: true, access: { ...caller, subAccountId, subAccountRole: "agencyOwner" } };
  }

  const memberSnap = await db
    .doc(`subAccounts/${subAccountId}/subAccountMembers/${caller.uid}`)
    .get();
  if (!memberSnap.exists) {
    return { ok: false, reason: "not_a_member" };
  }
  const member = memberSnap.data() ?? {};
  if (member.status !== "active") {
    return { ok: false, reason: "membership_inactive" };
  }
  const role = member.role as SubAccountRole;
  return { ok: true, access: { ...caller, subAccountId, subAccountRole: role } };
}

/**
 * Caller may access the sub-account either as:
 *  - the agency owner of the sub-account's parent agency, OR
 *  - an active member of the sub-account itself (any role).
 */
export async function requireSubAccountMember(
  request: Request,
  subAccountId: string,
): Promise<SubAccountAccess | NextResponse> {
  const caller = await readCaller(request);
  if (caller instanceof NextResponse) return caller;

  const result = await resolveSubAccountAccess(caller, subAccountId);
  if (!result.ok) {
    if (result.reason === "sub_account_not_found") {
      return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
    }
    if (result.reason === "not_a_member") {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    return NextResponse.json({ error: "Membership inactive" }, { status: 403 });
  }
  return result.access;
}

/** Caller must be admin in the sub-account (agency owners count as admin). */
export async function requireSubAccountAdmin(
  request: Request,
  subAccountId: string,
): Promise<SubAccountAccess | NextResponse> {
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  if (
    access.subAccountRole !== "admin" &&
    access.subAccountRole !== "agencyOwner"
  ) {
    return NextResponse.json(
      { error: "Sub-account admin only" },
      { status: 403 },
    );
  }
  return access;
}
