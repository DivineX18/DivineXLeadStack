import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  CreateIdentityLinkResult,
  IdentityLinkDoc,
  IdentityLinkMigrationState,
  IdentityLinkSource,
  IdentityLinkStatus,
} from "@/types/identity-links";

/**
 * Ascend OS Phase 2, Slice 3. Storage shape:
 *  - identityLinks/{clerkUserId}          — the real link. Doc ID IS the
 *    clerkUserId, so Firestore's own "you can't create two docs at the
 *    same path" gives clerkUserId uniqueness for free — no separate
 *    uniqueness check needed for that half.
 *  - identityLinksByFirebaseUid/{firebaseUid} — reverse index, `{
 *    clerkUserId }`. Same trick gives firebaseUid uniqueness.
 *  - identityLinkAttempts/{auto}          — append-only audit log of every
 *    create attempt (success, conflict, or infra failure), mirroring the
 *    existing ssoAuditEvents/ssoLoginAttempts pattern already used by the
 *    SSO bridge.
 *
 * Never link by email. `emailAtLinkTime` is recorded on the link doc for
 * human audit display only — no function in this file ever reads it back
 * as a lookup key or comparison condition.
 */

function linksCol() {
  return getAdminDb().collection("identityLinks");
}
function reverseIndexCol() {
  return getAdminDb().collection("identityLinksByFirebaseUid");
}

async function logAttempt(entry: Record<string, unknown>) {
  try {
    await getAdminDb().collection("identityLinkAttempts").add({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("[identity-links] attempt-log write failed", err);
  }
}

export async function getIdentityLinkByClerkId(
  clerkUserId: string,
): Promise<IdentityLinkDoc | null> {
  const snap = await linksCol().doc(clerkUserId).get();
  return snap.exists ? (snap.data() as IdentityLinkDoc) : null;
}

export async function getIdentityLinkByFirebaseUid(
  firebaseUid: string,
): Promise<IdentityLinkDoc | null> {
  const idxSnap = await reverseIndexCol().doc(firebaseUid).get();
  if (!idxSnap.exists) return null;
  const { clerkUserId } = idxSnap.data() as { clerkUserId: string };
  return getIdentityLinkByClerkId(clerkUserId);
}

/**
 * Idempotent, conflict-detecting create. Never overwrites an existing link
 * that points somewhere else — a conflict is returned to the caller, never
 * silently resolved. Every attempt (success, no-op, or conflict) is logged.
 */
export async function createIdentityLinkIdempotent(params: {
  clerkUserId: string;
  firebaseUid: string;
  emailAtLinkTime: string;
  linkSource: IdentityLinkSource;
  linkedByUid: string;
  migrationState?: IdentityLinkMigrationState;
}): Promise<CreateIdentityLinkResult> {
  const { clerkUserId, firebaseUid, emailAtLinkTime, linkSource, linkedByUid } = params;
  const db = getAdminDb();
  const linkRef = linksCol().doc(clerkUserId);
  const reverseRef = reverseIndexCol().doc(firebaseUid);

  const result = await db.runTransaction(async (tx) => {
    const [linkSnap, reverseSnap] = await Promise.all([tx.get(linkRef), tx.get(reverseRef)]);

    if (linkSnap.exists) {
      const existing = linkSnap.data() as IdentityLinkDoc;
      if (existing.firebaseUid === firebaseUid) {
        // Idempotent re-run of the exact same pairing — not a conflict.
        return { outcome: "noop" as const, link: existing };
      }
      return { outcome: "clerk_id_conflict" as const, link: existing };
    }

    if (reverseSnap.exists) {
      const { clerkUserId: otherClerkUserId } = reverseSnap.data() as { clerkUserId: string };
      if (otherClerkUserId !== clerkUserId) {
        const otherLinkSnap = await tx.get(linksCol().doc(otherClerkUserId));
        const existing = otherLinkSnap.exists ? (otherLinkSnap.data() as IdentityLinkDoc) : null;
        return { outcome: "firebase_uid_conflict" as const, link: existing };
      }
    }

    const link: IdentityLinkDoc = {
      clerkUserId,
      firebaseUid,
      status: "active",
      linkVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      linkedByUid,
      linkSource,
      lastVerifiedAt: FieldValue.serverTimestamp(),
      migrationState: params.migrationState ?? "not_started",
      failureReason: null,
      emailAtLinkTime,
    };
    tx.set(linkRef, link);
    tx.set(reverseRef, { clerkUserId });
    return { outcome: "created" as const, link };
  });

  if (result.outcome === "noop") {
    await logAttempt({ clerkUserId, firebaseUid, outcome: "noop", linkSource });
    return { ok: true, created: false, link: result.link };
  }
  if (result.outcome === "created") {
    await logAttempt({ clerkUserId, firebaseUid, outcome: "created", linkSource });
    return { ok: true, created: true, link: result.link };
  }
  if (result.outcome === "clerk_id_conflict") {
    await logAttempt({
      clerkUserId,
      firebaseUid,
      outcome: "clerk_id_conflict",
      linkSource,
      existingFirebaseUid: result.link.firebaseUid,
    });
    return { ok: false, reason: "clerk_id_conflict", existingLink: result.link };
  }
  // firebase_uid_conflict
  await logAttempt({
    clerkUserId,
    firebaseUid,
    outcome: "firebase_uid_conflict",
    linkSource,
    existingClerkUserId: result.link?.clerkUserId ?? null,
  });
  // A conflict where the reverse index points at a clerkUserId with no
  // corresponding link doc is itself a data-integrity problem worth
  // surfacing distinctly rather than crashing — return a synthetic
  // "unknown" existing link so the caller can still branch on `ok: false`.
  return {
    ok: false,
    reason: "firebase_uid_conflict",
    existingLink:
      result.link ??
      ({
        clerkUserId: "unknown",
        firebaseUid,
        status: "active",
        linkVersion: 0,
        createdAt: null,
        updatedAt: null,
        linkedByUid: "unknown",
        linkSource: "migration_backfill",
        lastVerifiedAt: null,
        migrationState: "failed",
        failureReason: "reverse_index_orphaned",
        emailAtLinkTime: "",
      } satisfies IdentityLinkDoc),
  };
}

export async function updateIdentityLinkStatus(
  clerkUserId: string,
  status: IdentityLinkStatus,
  updatedByUid: string,
): Promise<void> {
  await linksCol().doc(clerkUserId).update({
    status,
    updatedAt: FieldValue.serverTimestamp(),
    lastVerifiedAt: FieldValue.serverTimestamp(),
  });
  await logAttempt({ clerkUserId, outcome: "status_updated", newStatus: status, updatedByUid });
}

/** For infra-level failures that happen BEFORE a transaction can even
 *  resolve ok/conflict (network error, malformed input caught upstream,
 *  etc.) — no link doc exists to attach this to, so it only ever writes
 *  to the attempt log. Never logs secrets — callers must pass only
 *  non-sensitive identifiers and a short reason string. */
export async function recordIdentityLinkFailure(params: {
  clerkUserId: string;
  firebaseUid: string | null;
  reason: string;
  linkSource: IdentityLinkSource;
}): Promise<void> {
  await logAttempt({
    clerkUserId: params.clerkUserId,
    firebaseUid: params.firebaseUid,
    outcome: "failure",
    reason: params.reason,
    linkSource: params.linkSource,
  });
}
