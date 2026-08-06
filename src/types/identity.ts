/**
 * Ascend OS Phase 2, Slice 7 — the canonical Identity Context. Composes
 * (never reimplements) Slices 3-6: identityLinks, the SSO bridge's JIT
 * provisioning, Workspace Mapping v2, the permission evaluator, and the
 * entitlement evaluator.
 *
 * Repository truth this model is built on (Slice 7 audit): Flow has NO
 * Clerk code anywhere — Clerk lives entirely on Ascend's side of the SSO
 * bridge. A Flow session is always a Firebase session; `IdentityProvider`
 * below is not "which auth system authenticated this request" (always
 * Firebase, enforced by middleware.ts's authMiddleware) but "how did this
 * Firebase identity come to exist" — native signup, or via the SSO
 * bridge's JIT/resolve path (Slice 3, lib/auth/sso-jit-provisioning.ts).
 */

// MemberStatus/AgencyRole resolved via the @/types barrel, matching the
// existing convention in lib/auth/require-tenancy.ts — note MemberStatus
// is ALSO independently defined (same shape, different meaning) in
// types/community.ts; the barrel only re-exports types/firebase.ts's
// version (types/index.ts does not `export * from "./community"`), so
// this import is unambiguous, not a naming collision in practice.
import type { AgencyRole, MemberStatus } from "@/types";
import type { EffectiveRole, WorkspacePermission } from "@/types/workspace-permissions";
import type { WorkspaceMappingStatus } from "@/types/workspace-mappings";
import type { WorkspaceEntitlementSummary } from "@/types/workspace-entitlements";

// ── Identity source / provider ──────────────────────────────────────────

/** Always "firebase" today — Flow has no other session-issuing system.
 *  Kept as a union (not a literal) for Slice 8's future Firebase-first
 *  Ascend login work, which this slice's instructions explicitly say not
 *  to build yet — see IdentityMigrationState below. */
export type IdentityProvider = "firebase";

/** How this Firebase identity came to exist — provenance, not the
 *  authentication mechanism (which is always Firebase). Derived from
 *  whether an identityLinks record exists for this uid (Slice 3). */
export type IdentitySource =
  | "native_signup" // no identityLinks record -- signed up directly in Flow
  | "sso_jit_provisioned" // identityLinks record with linkSource "sso_bridge_jit"
  | "migration_backfilled" // identityLinks record with linkSource "migration_backfill"
  | "unknown"; // an identityLinks record exists with an unrecognized linkSource -- fail closed to "unknown", never guess

// ── Session ──────────────────────────────────────────────────────────────

export type SessionState = "active" | "no_session" | "account_inactive";

export interface AuthenticatedUser {
  uid: string;
  email: string;
  status: MemberStatus;
  agencyId: string | null;
  agencyRole: AgencyRole | null;
}

export interface SessionMetadata {
  provider: IdentityProvider;
  source: IdentitySource;
  hasIdentityLink: boolean;
  /** Only populated when an identityLinks record exists — the Ascend-side
   *  Clerk user id this Firebase identity is linked to. Never used as a
   *  lookup key, display-only provenance (mirrors identityLinks'
   *  emailAtLinkTime philosophy — Slice 3). */
  linkedClerkUserId: string | null;
}

export interface SessionIdentity {
  state: SessionState;
  user: AuthenticatedUser | null;
  metadata: SessionMetadata | null;
}

// ── Workspace selection ─────────────────────────────────────────────────

export type WorkspaceSelectionReason =
  | "explicit" // caller supplied a workspaceId explicitly (e.g. from a /sa/[subAccountId]/ route param)
  | "sole_membership" // exactly one userMemberships entry exists, auto-selected
  | "multiple_available" // 2+ memberships exist and none was explicitly requested -- never guessed, see Slice 7 ledger
  | "none_available"; // no memberships and no explicit request

export interface WorkspaceSelection {
  workspaceId: string | null;
  reason: WorkspaceSelectionReason;
  /** Every candidate workspaceId this uid is a member of (from
   *  userMemberships/{uid}/subAccounts, the EXISTING denormalized index
   *  that already powers the sub-account switcher — reused, not
   *  reimplemented). Populated even when a single one was auto-selected,
   *  so a future switcher UI never has to re-query this. */
  candidates: string[];
}

export type WorkspaceIdentityStatus =
  | "active"
  | "archived"
  | "inactive" // sub-account exists but the caller's membership isn't active, or the sub-account itself is archived
  | "not_found";

export interface WorkspaceIdentity {
  workspaceId: string;
  status: WorkspaceIdentityStatus;
  effectiveRole: EffectiveRole | null; // null when status !== "active"
  mappingStatus: WorkspaceMappingStatus | null; // null = no Workspace Mapping v2 record exists for this sub-account (normal, most sub-accounts don't have one yet)
  /** Every permission this role is allowed, precomputed via the pure
   *  roleHasPermission() (Slice 5) -- zero extra Firestore reads beyond
   *  what resolving effectiveRole already required. */
  allowedPermissions: WorkspacePermission[];
  entitlements: WorkspaceEntitlementSummary | null; // null when status !== "active"
}

// ── Migration foundation (representation only -- no migration performed) ──

/** Where this identity sits relative to the future Firebase-first
 *  migration (Slice 2's Blueprint §2). Purely descriptive -- no function
 *  in this slice moves an identity between these states. */
export type IdentityMigrationState =
  | "firebase_native" // no identityLinks record -- always was Firebase-only, nothing to migrate
  | "linked_dual" // identityLinks record exists -- this identity has a live Ascend/Clerk counterpart
  | "unlinked_ascend_pending"; // reserved for a future signal (an Ascend user not yet linked) -- never set by this slice, no data source exists for it yet

// ── Resolution result ────────────────────────────────────────────────────

export interface IdentityContext {
  session: SessionIdentity;
  workspaceSelection: WorkspaceSelection;
  workspace: WorkspaceIdentity | null; // null when no workspace was resolved (none_available, multiple_available with no explicit pick, or not_found/archived)
  migrationState: IdentityMigrationState;
  resolvedAt: number; // Date.now() at resolution time -- diagnostic only, never persisted or compared for cache invalidation by this slice
}

/** Alias -- both names appear in this slice's spec; kept as one type so
 *  there is exactly one canonical shape, not two independently-evolving
 *  ones. */
export type IdentityResolutionResult = IdentityContext;
