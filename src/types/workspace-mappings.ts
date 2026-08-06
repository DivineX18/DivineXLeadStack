/**
 * Ascend OS Phase 2, Slice 4 — Workspace Mapping v2. Generalizes Ascend's
 * existing `divinex_workspace_mappings` table (one hardcoded clerkUserId ->
 * leadstackSubAccountId pairing) into the durable N:1 model: Flow
 * SubAccount is the canonical Workspace (PHASE_1_IMPLEMENTATION_BLUEPRINT.md
 * §1.1); one Workspace has exactly one primary Ascend business profile plus
 * zero or more linked secondary profiles.
 *
 * Field names follow this slice's explicit instruction (ownerFirebaseUid,
 * not the architecture draft's ownerUserId) since the live SSO/identity
 * work already established `firebaseUid` as the canonical field name for a
 * Firebase user id (see types/identity-links.ts) -- repository convention
 * wins over the earlier planning draft's provisional naming.
 *
 * Deliberately distinct from identityLinks (Clerk<->Firebase) and Flow
 * subAccountMembers (Firebase user<->role) -- never combined into one
 * document or collection. See PHASE_2_IMPLEMENTATION_LEDGER.md, Slice 4,
 * "Separation from identity links and memberships".
 */

export type WorkspaceMappingStatus = "pending_provision" | "active" | "suspended" | "archived";

export type WorkspaceMappingProvisioningStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "partial_failure";

export interface ReconciliationResult {
  at: unknown; // FieldValue.serverTimestamp() on write, Timestamp on read
  outcome: "clean" | "drift_detected" | "drift_repaired" | "check_failed";
  driftFields: string[];
  details: string;
}

export interface WorkspaceMappingDoc {
  workspaceId: string;
  flowSubAccountId: string;
  agencyId: string | null;
  ownerFirebaseUid: string;
  primaryAscendBusinessProfileId: string | null;
  linkedSecondaryAscendBusinessProfileIds: string[];
  status: WorkspaceMappingStatus;
  provisioningStatus: WorkspaceMappingProvisioningStatus;
  mappingVersion: number;
  lastReconciliationResult: ReconciliationResult | null;
  createdAt: unknown;
  updatedAt: unknown;
}

export type WorkspaceMappingResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; existing?: WorkspaceMappingDoc };

// ── Migration dry-run classification (pure, no Firestore) ──────────────────

export interface SourceWorkspaceMappingRow {
  clerkUserId: string;
  leadstackSubAccountId: string;
  leadstackRole: string;
  leadstackFirebaseUid: string | null;
  provisioningAllowed: boolean;
  connectionStatus: string;
}

export interface CandidateBusinessProfile {
  id: string;
  businessName: string;
  updatedAt: string | null; // ISO string, for report display only -- NEVER used to auto-select
}

export type MigrationRowClassification =
  | "eligible_for_auto_migration"
  | "missing_flow_subaccount"
  | "missing_identity_link"
  | "multiple_primary_candidates"
  | "duplicate_flow_subaccount"
  | "invalid_role_or_status"
  | "requires_manual_review";

export interface MigrationRowReport {
  clerkUserId: string;
  leadstackSubAccountId: string;
  classification: MigrationRowClassification;
  reasons: string[];
  candidateProfiles?: CandidateBusinessProfile[];
}
