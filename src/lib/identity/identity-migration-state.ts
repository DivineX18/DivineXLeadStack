/**
 * Ascend OS Phase 2, Slice 7 — pure migration-state and identity-source
 * derivation. No Firebase import. Foundation/representation only — no
 * function here migrates anything, per this slice's explicit instruction.
 */

import type { IdentityLinkSource } from "@/types/identity-links";
import type { IdentityMigrationState, IdentitySource } from "@/types/identity";

export function deriveIdentitySource(hasIdentityLink: boolean, linkSource: IdentityLinkSource | null): IdentitySource {
  if (!hasIdentityLink) return "native_signup";
  if (linkSource === "sso_bridge_jit") return "sso_jit_provisioned";
  if (linkSource === "migration_backfill") return "migration_backfilled";
  // "manual_admin" or any future/unrecognized source -- fail closed to
  // "unknown" rather than guessing which bucket it belongs in.
  return "unknown";
}

export function deriveMigrationState(hasIdentityLink: boolean): IdentityMigrationState {
  return hasIdentityLink ? "linked_dual" : "firebase_native";
}
