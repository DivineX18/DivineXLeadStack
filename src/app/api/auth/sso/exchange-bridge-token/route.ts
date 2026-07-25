import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { verifySsoBridgeToken, hashSsoBridgeToken } from "@/lib/auth/sso-bridge-token";
import { verifySsoWorkspaceAccess } from "@/lib/auth/sso-workspace-access";

export const dynamic = "force-dynamic";

const BRIDGE_COOKIE = "__sso_bridge";

/**
 * POST /api/auth/sso/exchange-bridge-token — Phase E (Growth Operations
 * side). Reads the HttpOnly bridge cookie server-side (never touches JS),
 * atomically consumes the single-use bridge doc, re-validates workspace
 * access hasn't drifted since the callback (Final rule 2), and mints a
 * Firebase custom token JIT — returned ONLY in the JSON body, never a URL.
 * The client (`/auth/sso/finish`) signs in with it, then calls the
 * existing, unmodified `createSessionCookie()` — same path the normal
 * login form uses.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`${BRIDGE_COOKIE}=([^;]+)`));
  const rawToken = match ? decodeURIComponent(match[1]) : "";

  if (!rawToken) {
    return NextResponse.json({ error: "No SSO session in progress" }, { status: 400 });
  }

  const verified = verifySsoBridgeToken(rawToken);
  if (!verified) {
    return NextResponse.json({ error: "Invalid or expired SSO session" }, { status: 403 });
  }

  const db = getAdminDb();
  const bridgeRef = db.doc(`ssoBridge/${verified.bridgeId}`);
  const presentedHash = hashSsoBridgeToken(rawToken);

  // Atomic single-use consume — read + check + mark-used inside one
  // transaction, matching the pattern in /api/quotes/[token]/respond.
  let bridge: { uid: string; subAccountId: string; approvedRole: string } | null = null;
  try {
    bridge = await db.runTransaction(async (tx) => {
      const snap = await tx.get(bridgeRef);
      if (!snap.exists) return null;
      const data = snap.data()!;
      if (data.tokenHash !== presentedHash) return null;
      if (data.usedAt) return null;
      if (typeof data.expiresAt === "number" && data.expiresAt < Date.now()) return null;
      tx.update(bridgeRef, { usedAt: FieldValue.serverTimestamp() });
      return {
        uid: data.uid as string,
        subAccountId: data.subAccountId as string,
        approvedRole: data.approvedRole as string,
      };
    });
  } catch (err) {
    console.error("[sso/exchange-bridge-token] transaction failed", err);
    return NextResponse.json({ error: "Could not complete sign-in" }, { status: 500 });
  }

  if (!bridge) {
    return NextResponse.json({ error: "Invalid, expired, or already-used SSO session" }, { status: 403 });
  }

  // Final rule 2: re-validate the bridge's uid/subAccountId/role still
  // match current reality — closes the window between the callback
  // approving access and this exchange completing.
  const access = await verifySsoWorkspaceAccess({
    uid: bridge.uid,
    subAccountId: bridge.subAccountId,
    approvedRole: bridge.approvedRole,
  });
  if (!access.ok) {
    return NextResponse.json({ error: "Workspace access changed — please try again" }, { status: 403 });
  }

  let customToken: string;
  try {
    customToken = await getAdminAuth().createCustomToken(bridge.uid);
  } catch (err) {
    console.error("[sso/exchange-bridge-token] createCustomToken failed", err);
    return NextResponse.json({ error: "Could not complete sign-in" }, { status: 500 });
  }

  const response = NextResponse.json({
    customToken,
    subAccountId: bridge.subAccountId,
  });
  // Clear the bridge cookie now that it's consumed.
  response.cookies.set(BRIDGE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
