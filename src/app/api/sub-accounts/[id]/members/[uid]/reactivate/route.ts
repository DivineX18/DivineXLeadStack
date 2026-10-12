import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAgencyOwner } from "@/lib/auth/require-tenancy";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";

/**
 * Re-enable a disabled account, from inside the app.
 *
 *   POST /api/sub-accounts/[id]/members/[uid]/reactivate
 *
 * AGENCY OWNER only — deliberately stricter than the sub-account admin who can
 * invite. Inviting someone back is routine; overriding a disable is not, and
 * the person who can do it should be the one accountable for the deployment.
 *
 * Why this exists. Removing a member's last membership disables their auth
 * account, and re-inviting them reactivates it automatically because that
 * carries our own removal marker. An account disabled WITHOUT that marker is
 * different: either someone disabled it directly in Firebase, or our own
 * removal half-completed (the DELETE route disables the account and writes the
 * claim in two separate calls, so a failure between them leaves exactly this
 * state). The invite path refuses that case rather than silently undoing a
 * decision it cannot see the reason for.
 *
 * Refusing is right; leaving no way out was not. This is the way out: explicit,
 * owner-only, and audited, instead of either a silent override or a trip to the
 * Firebase console.
 */

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; uid: string }> },
) {
  const { id: subAccountId, uid: targetUid } = await ctx.params;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }
  const agencyId = (subSnap.data()?.agencyId as string | undefined) ?? "";

  const owner = await requireAgencyOwner(request, agencyId);
  if (owner instanceof NextResponse) return owner;

  const auth = getAdminAuth();
  const target = await auth.getUser(targetUid).catch(() => null);
  if (!target) {
    return NextResponse.json({ error: "That account no longer exists." }, { status: 404 });
  }

  const claims = (target.customClaims ?? {}) as { agencyId?: string; status?: string };

  // Never reactivate an account belonging to a different agency. Same rule the
  // invite path enforces, and it matters more here because this bypasses the
  // refusal rather than being subject to it.
  if (claims.agencyId && claims.agencyId !== agencyId) {
    return NextResponse.json(
      { error: "That account belongs to a different agency." },
      { status: 403 },
    );
  }

  const wasDisabled = target.disabled || claims.status === "removed";
  if (!wasDisabled) {
    // Idempotent: already-enabled is the desired end state, not an error.
    return NextResponse.json({ ok: true, alreadyActive: true, uid: targetUid });
  }

  // Claims first, then the account. If the second call fails the account stays
  // disabled, which is the safe direction to fail: a signed-in-capable account
  // whose claims still said "removed" would be force-signed-out by AuthContext
  // on every page load, which looks like a broken login rather than a refusal.
  await auth.setCustomUserClaims(targetUid, {
    ...claims,
    status: "active",
    agencyId: claims.agencyId ?? agencyId,
  });
  await auth.updateUser(targetUid, { disabled: false });

  await db.doc(`users/${targetUid}`).set(
    { status: "active", updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  // Audit. A reactivation overrides a prior disable, so it is recorded with
  // WHO did it rather than left as a silent flag flip.
  console.info("[members/reactivate] account re-enabled", {
    subAccountId,
    targetUid,
    byUid: owner.uid,
  });
  void emitWebhookEvent({
    subAccountId,
    agencyId,
    mode: "live",
    type: "member.reactivated",
    payload: {
      member: {
        uid: targetUid,
        object: "member",
        email: target.email ?? "",
        reactivated_by_uid: owner.uid,
        reactivated_at: new Date().toISOString(),
      },
    },
  });

  // Note: this only re-enables the ACCOUNT. It deliberately grants no
  // workspace access — the caller follows with the normal invite, which
  // applies the usual role and seat checks rather than inheriting whatever
  // membership existed before.
  return NextResponse.json({ ok: true, uid: targetUid, email: target.email ?? null });
}
