import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ModuleEntitlementDecision } from "@/types/workspace-entitlements";

/**
 * Ascend OS Phase 2, Slice 6 — reuses Slice 5's audit philosophy exactly:
 * cheap-by-default, no Firestore write for routine denials.
 *
 * Per-module denials (feature_gate_disabled, subscription_required,
 * usage_limit_reached) are console-only — these fire on EVERY evaluation
 * for a workspace missing a given module, which would be constant, high-
 * volume noise if persisted (unlike Slice 5's HIGH_RISK_PERMISSIONS,
 * which are individually rare actions).
 *
 * Only the blanket, whole-workspace-state denial reasons (workspace_
 * archived, workspace_inactive, billing_inactive) get a persistent,
 * append-only Firestore row — these are rare, significant events worth a
 * durable trail, not per-module chatter.
 */

const PERSISTENT_REASONS: readonly ModuleEntitlementDecision["reason"][] = [
  "workspace_archived",
  "workspace_inactive",
  "billing_inactive",
];

/** Per-module decision — console-only, never persisted, even for a
 *  "persistent reason" (see logWorkspaceLevelDenial below for that case).
 *  Called once per module per evaluation (up to 25x) — must stay cheap. */
export function logEntitlementDecision(workspaceId: string, decision: ModuleEntitlementDecision): void {
  if (!decision.allowed) {
    console.warn("[workspace-entitlements] denied", {
      workspaceId,
      module: decision.module,
      reason: decision.reason,
    });
  }
}

/**
 * Workspace-level blanket denial (workspace_archived / workspace_inactive
 * / billing_inactive) — ONE persistent audit row per evaluation call, not
 * one per module. This is the function denyAll() in the evaluator calls;
 * it must never be called from inside a per-module loop, which is exactly
 * the mistake that would turn one archived-workspace check into 25
 * Firestore writes.
 */
export function logWorkspaceLevelDenial(workspaceId: string, reason: ModuleEntitlementDecision["reason"]): void {
  console.warn("[workspace-entitlements] workspace-level denial", { workspaceId, reason });
  if (!PERSISTENT_REASONS.includes(reason)) return;
  getAdminDb()
    .collection("workspaceEntitlementAudit")
    .add({ workspaceId, reason, createdAt: FieldValue.serverTimestamp() })
    .catch((err) => console.warn("[workspace-entitlements] audit write failed", err));
}
