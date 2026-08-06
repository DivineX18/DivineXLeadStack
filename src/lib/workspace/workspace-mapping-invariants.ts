/**
 * Ascend OS Phase 2, Slice 4 — pure, dependency-free invariant checks and
 * migration-row classification for Workspace Mapping v2. Deliberately has
 * NO Firebase/Firestore import anywhere in this file, so it can be unit-
 * tested directly (real function calls, real assertions) rather than only
 * via source-text pattern matching, per this slice's explicit instruction
 * to prefer dependency-injected/pure tests where feasible.
 */

import type {
  CandidateBusinessProfile,
  MigrationRowClassification,
  MigrationRowReport,
  SourceWorkspaceMappingRow,
} from "@/types/workspace-mappings";

const RECOGNIZED_SOURCE_ROLES = ["admin", "collaborator"];

/** Invariant 3: a profile can't be both primary and secondary in the same
 *  Workspace. */
export function validateNoPrimarySecondaryOverlap(
  primary: string | null,
  secondaries: string[],
): { ok: true } | { ok: false; reason: string } {
  if (primary && secondaries.includes(primary)) {
    return { ok: false, reason: `Profile ${primary} cannot be both primary and secondary in the same Workspace` };
  }
  return { ok: true };
}

/** Invariant 4: secondary profile IDs must be deduplicated. Stable order
 *  (first occurrence wins) so repeated calls with the same input are
 *  idempotent in their own right. */
export function dedupeSecondaryProfileIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

/** Invariant 9: every material mapping change increments mappingVersion.
 *  Centralized so no call site can forget or double-increment. */
export function nextMappingVersion(current: number): number {
  return current + 1;
}

export interface ProfileLinks {
  primary: string | null;
  secondaries: string[];
}
export type ProfileLinksResult =
  | { ok: true; value: ProfileLinks }
  | { ok: false; reason: string };

/** Pure computation for attachPrimaryBusinessProfile — extracted so the
 *  mutation logic itself (not just a validity check) is genuinely unit-
 *  testable without touching Firestore. */
export function computeAttachPrimary(current: ProfileLinks, profileId: string): ProfileLinksResult {
  const secondaries = current.secondaries.filter((id) => id !== profileId);
  const check = validateNoPrimarySecondaryOverlap(profileId, secondaries);
  if (!check.ok) return { ok: false, reason: check.reason };
  return { ok: true, value: { primary: profileId, secondaries } };
}

export function computeAddSecondary(current: ProfileLinks, profileId: string): ProfileLinksResult {
  if (current.primary === profileId) {
    return { ok: false, reason: `Profile ${profileId} is already the primary profile for this Workspace` };
  }
  return { ok: true, value: { primary: current.primary, secondaries: dedupeSecondaryProfileIds([...current.secondaries, profileId]) } };
}

/** Removing a profile that isn't currently a secondary is a no-op, not an
 *  error — always succeeds. */
export function computeRemoveSecondary(current: ProfileLinks, profileId: string): ProfileLinks {
  return { primary: current.primary, secondaries: current.secondaries.filter((id) => id !== profileId) };
}

/** The old primary (if any) moves into the secondary list rather than
 *  being silently dropped — a promotion never loses a link. */
export function computePromoteSecondaryToPrimary(current: ProfileLinks, profileId: string): ProfileLinksResult {
  if (!current.secondaries.includes(profileId)) {
    return { ok: false, reason: `Profile ${profileId} is not currently a secondary profile on this Workspace` };
  }
  const remaining = current.secondaries.filter((id) => id !== profileId);
  const secondaries = current.primary ? dedupeSecondaryProfileIds([...remaining, current.primary]) : remaining;
  return { ok: true, value: { primary: profileId, secondaries } };
}

/**
 * Dry-run migration classification for one source
 * `divinex_workspace_mappings` row. Pure — takes the already-looked-up
 * context (does the Flow sub-account exist, does an identity link exist,
 * what Ascend business profiles exist for this clerkUserId, is this
 * flowSubAccountId claimed by more than one source row) as plain data
 * rather than performing any lookups itself.
 *
 * Per this slice's explicit correction: when more than one candidate
 * business profile exists for a clerkUserId, this ALWAYS returns
 * "multiple_primary_candidates" -- there is no "most recently active"
 * auto-selection path in this function at all, not even as a fallback.
 * Ascend's businessProfiles schema has no canonical/primary indicator field
 * (confirmed by direct schema inspection, Slice 4 ledger entry), so there
 * is no data-driven way to pick one automatically even if this function
 * wanted to.
 */
export function classifyMigrationRow(params: {
  row: SourceWorkspaceMappingRow;
  flowSubAccountExists: boolean;
  identityLinkExists: boolean;
  candidateProfiles: CandidateBusinessProfile[];
  isDuplicateFlowSubAccountAcrossSourceRows: boolean;
}): MigrationRowReport {
  const { row, flowSubAccountExists, identityLinkExists, candidateProfiles, isDuplicateFlowSubAccountAcrossSourceRows } = params;
  const reasons: string[] = [];
  let classification: MigrationRowClassification = "eligible_for_auto_migration";

  if (isDuplicateFlowSubAccountAcrossSourceRows) {
    classification = "duplicate_flow_subaccount";
    reasons.push(
      `flowSubAccountId ${row.leadstackSubAccountId} appears in more than one source row -- cannot deterministically resolve which is authoritative`,
    );
  } else if (!flowSubAccountExists) {
    classification = "missing_flow_subaccount";
    reasons.push(`No Flow subAccounts/${row.leadstackSubAccountId} document exists`);
  } else if (!RECOGNIZED_SOURCE_ROLES.includes(row.leadstackRole)) {
    classification = "invalid_role_or_status";
    reasons.push(`Role "${row.leadstackRole}" is not one of ${RECOGNIZED_SOURCE_ROLES.join(", ")}`);
  } else if (row.connectionStatus !== "active") {
    classification = "invalid_role_or_status";
    reasons.push(`connectionStatus is "${row.connectionStatus}", not "active"`);
  } else if (!identityLinkExists) {
    classification = "missing_identity_link";
    reasons.push(
      `No identityLinks record for clerkUserId ${row.clerkUserId} -- run the Slice 3 backfill tool for this user first`,
    );
  } else if (candidateProfiles.length > 1) {
    classification = "multiple_primary_candidates";
    reasons.push(
      `${candidateProfiles.length} Ascend business profiles exist for this clerkUserId and none is marked canonical -- requires manual review, never auto-selected`,
    );
  } else if (candidateProfiles.length === 0) {
    // Not necessarily an error -- a mapping can exist with no primary
    // profile yet (a Flow-first customer who hasn't run an Ascend
    // assessment). Still flagged for manual review rather than silently
    // proceeding, since it's ambiguous whether that's expected here.
    classification = "requires_manual_review";
    reasons.push("No Ascend business profile found for this clerkUserId -- confirm this is expected before migrating");
  }

  return {
    clerkUserId: row.clerkUserId,
    leadstackSubAccountId: row.leadstackSubAccountId,
    classification,
    reasons,
    candidateProfiles: candidateProfiles.length > 0 ? candidateProfiles : undefined,
  };
}
