import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { WorkspacePermission, WorkspacePermissionDecision } from "@/types/workspace-permissions";

/**
 * Ascend OS Phase 2, Slice 5 — deliberately cheap-by-default audit
 * behavior, per this slice's explicit instruction: denials are observable
 * without creating a high-volume Firestore write for every successful
 * read.
 *
 *   - Every DENIAL gets a structured console log (cheap, no Firestore
 *     write) — always observable in server logs.
 *   - A small, named set of HIGH-RISK permissions additionally get a
 *     persistent, append-only Firestore audit row on EVERY evaluation
 *     (allow or deny) — because for these specific actions, knowing WHO
 *     was allowed to do them is as valuable as knowing who was denied.
 *   - Routine reads and ordinary operational writes (contacts, deals,
 *     tasks, calendar, etc.) NEVER produce a persistent audit row, even
 *     when denied — only the console log.
 */

const HIGH_RISK_PERMISSIONS: readonly WorkspacePermission[] = [
  "billing.manage",
  "stripe.connect",
  "api.manage",
  "agency.manage",
  "orders.refund",
  "members.manage",
  "zeno.execute",
  "domains.manage",
  "integrations.manage",
];

export function isHighRiskPermission(permission: WorkspacePermission): boolean {
  return HIGH_RISK_PERMISSIONS.includes(permission);
}

export function logPermissionDecision(decision: WorkspacePermissionDecision, uid: string): void {
  if (!decision.allowed) {
    console.warn("[workspace-permissions] denied", {
      uid,
      workspaceId: decision.workspaceId,
      permission: decision.permission,
      reason: decision.reason,
    });
  }

  if (isHighRiskPermission(decision.permission)) {
    // Best-effort, never blocks or throws into the caller's request path —
    // matches the established pattern (e.g. lib/auth/sso-jit-provisioning.ts's
    // auditFailure).
    getAdminDb()
      .collection("workspacePermissionAudit")
      .add({
        uid,
        workspaceId: decision.workspaceId,
        permission: decision.permission,
        allowed: decision.allowed,
        reason: decision.reason,
        effectiveRole: decision.effectiveRole ?? null,
        createdAt: FieldValue.serverTimestamp(),
      })
      .catch((err) => console.warn("[workspace-permissions] audit write failed", err));
  }
}
