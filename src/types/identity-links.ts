/**
 * Ascend OS Phase 2, Slice 3 — the explicit, audited Clerk<->Firebase
 * identity-link record (Blueprint §2.2). Never derive this mapping from a
 * runtime email lookup; the row itself is the only source of truth once
 * created, per the same "never link by email alone" principle the existing
 * SSO bridge already enforces (lib/auth/sso-workspace-access.ts).
 */

export type IdentityLinkStatus = "active" | "revoked" | "superseded";

export type IdentityLinkSource =
  | "sso_bridge_jit" // created inline by the live SSO callback's JIT path
  | "migration_backfill" // created by the offline backfill script
  | "manual_admin"; // created by an explicit admin action (not built yet)

export type IdentityLinkMigrationState = "not_started" | "in_progress" | "complete" | "failed";

export interface IdentityLinkDoc {
  clerkUserId: string;
  firebaseUid: string;
  status: IdentityLinkStatus;
  linkVersion: number;
  createdAt: unknown;
  updatedAt: unknown;
  linkedByUid: string; // the acting uid, or "system:migration-script" / "system:sso-bridge"
  linkSource: IdentityLinkSource;
  lastVerifiedAt: unknown;
  migrationState: IdentityLinkMigrationState;
  failureReason: string | null;
  /** Audit display only — NEVER used as a lookup key or a matching
   *  condition. Recorded purely so a human reviewing a link record can see
   *  what email was on file at link time, e.g. to spot a later email
   *  change without that being mistaken for account drift. */
  emailAtLinkTime: string;
}

export type CreateIdentityLinkResult =
  | { ok: true; created: boolean; link: IdentityLinkDoc } // created=false means idempotent no-op (already existed, identical pairing)
  | { ok: false; reason: "clerk_id_conflict" | "firebase_uid_conflict"; existingLink: IdentityLinkDoc };
