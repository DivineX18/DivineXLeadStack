import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { decryptSecret, tenantSecretsConfigured } from "@/lib/crypto/secrets";
import { revokeRefreshToken } from "@/lib/google/oauth";
import type { SubAccountDoc } from "@/types";

/**
 * Disconnect a workspace's Google connection.
 *
 *   DELETE /api/sub-accounts/[id]/google
 *
 * Sub-account admin only. Mirrors the Meta disconnect, with one addition that
 * is not optional here: the refresh token is REVOKED at Google before the
 * local record is cleared.
 *
 * Why that matters. Deleting our copy of a token is not a disconnect — the
 * grant keeps living in the customer's Google account as an app with standing
 * access to their analytics, ads and search data. The privacy policy tells
 * them disconnecting removes our access, and a reviewer will follow that claim
 * through the demo video. It has to be true.
 *
 * Order is deliberate: revoke first, clear second. Clearing first would lose
 * the only copy of the token and leave the grant alive with no way to reach
 * it. A revoke failure still clears locally — we must not strand a workspace
 * in a connected state it cannot leave — but it is reported so the operator
 * can revoke by hand at myaccount.google.com/permissions.
 */

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const snap = await db.doc(`subAccounts/${id}`).get();
  const cfg = snap.exists ? ((snap.data() as SubAccountDoc).googleConfig ?? null) : null;

  if (!cfg?.connected) {
    // Idempotent: disconnecting something already disconnected is a success,
    // not a 404. A retried request must not look like an error.
    return NextResponse.json({ ok: true, alreadyDisconnected: true });
  }

  let revoked = false;
  let revokeError: string | null = null;

  if (cfg.refreshTokenEncrypted && tenantSecretsConfigured()) {
    try {
      const token = decryptSecret(cfg.refreshTokenEncrypted);
      const result = await revokeRefreshToken(token);
      revoked = result.revoked;
      revokeError = result.reason;
    } catch (err) {
      // A decrypt failure means TENANT_SECRETS_KEY rotated out from under this
      // record. The token is already unusable by us, so local state still goes
      // — but say so rather than imply a clean revoke.
      revokeError = "decrypt_failed";
      console.warn(`[google/disconnect] could not decrypt token sa=${id}`, err);
    }
  } else if (!tenantSecretsConfigured()) {
    revokeError = "secrets_not_configured";
  }

  await db.doc(`subAccounts/${id}`).update({
    googleConfig: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // NOTE: synced metrics live in Ascend, keyed by business profile, and are
  // not written yet (that lands with the sync phase). When they do, deleting
  // them belongs HERE, so that one action satisfies the whole deletion promise
  // in the privacy policy rather than leaving data behind in the other system.
  return NextResponse.json({
    ok: true,
    revokedAtGoogle: revoked,
    // Surfaced so the settings card can tell the operator to revoke by hand
    // instead of quietly leaving a live grant in the client's Google account.
    revokeError: revoked ? null : revokeError,
  });
}
