import "server-only";

import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { getIdentityLinkByFirebaseUid } from "@/lib/auth/identity-links-service";
import { evaluateWorkspaceEntitlements } from "@/lib/entitlements/evaluate-workspace-entitlements";
import { isFeatureFlagEnabled } from "@/lib/flags/evaluate-flag";
import { createAscendIntelligenceClient } from "@/lib/intelligence/ascend-intelligence-client";
import { ascendIntelligenceConfigured } from "@/lib/intelligence/ascend-intelligence-config";
import type { SubAccountDoc } from "@/types/tenancy";
import type { WorkspaceEntitlementSummary } from "@/types/workspace-entitlements";
import type { WorkspaceMappingDoc } from "@/types/workspace-mappings";
import type { IdentityLinkDoc } from "@/types/identity-links";

/**
 * Ascend Command Center — the ONE new data-access layer this surface adds.
 * Every function here composes existing Phase 2 services (workspace
 * mappings, identity links, entitlements, feature flags, the Intelligence
 * Bridge client) rather than re-deriving any of their logic — see the
 * reuse audit in ASCEND_OS_LAUNCH_READINESS.md before extending this file.
 * Nothing here does authorization; every caller (route or Server Component)
 * must independently gate on requireAgencyOwnerAny()/getCurrentAgencyOwner()
 * first, same discipline as every other service in this codebase.
 */

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

// ── Workspace list ──────────────────────────────────────────────────────

export interface CommandCenterWorkspaceSummary {
  subAccountId: string;
  name: string;
  status: SubAccountDoc["status"];
  accountNumber: number | null;
  createdAt: string | null;
  ascendIntelligenceEnabledByAgency: boolean;
  effectiveTier: WorkspaceEntitlementSummary["effectiveTier"];
  billingState: string;
}

export async function listWorkspacesForAgency(agencyId: string): Promise<CommandCenterWorkspaceSummary[]> {
  const db = getAdminDb();
  const snap = await db.collection("subAccounts").where("agencyId", "==", agencyId).get();
  const rows = snap.docs.map((d) => ({ id: d.id, data: d.data() as SubAccountDoc }));

  const entitlements = await Promise.all(
    rows.map((r) => evaluateWorkspaceEntitlements({ workspaceId: r.id }, true)),
  );

  return rows
    .map((r, i) => ({
      subAccountId: r.id,
      name: r.data.name ?? "(unnamed)",
      status: r.data.status ?? "active",
      accountNumber: typeof r.data.accountNumber === "number" ? r.data.accountNumber : null,
      createdAt: toIso(r.data.createdAt),
      ascendIntelligenceEnabledByAgency: r.data.ascendIntelligenceEnabledByAgency === true,
      effectiveTier: entitlements[i].effectiveTier,
      billingState: entitlements[i].billingState,
    }))
    .sort((a, b) => (a.accountNumber ?? 0) - (b.accountNumber ?? 0));
}

export async function getSubAccountDoc(subAccountId: string): Promise<SubAccountDoc | null> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as SubAccountDoc), id: snap.id };
}

// ── Provisioning / connection status ────────────────────────────────────

export type CommandCenterCheckStatus = "ok" | "warning" | "missing" | "unknown";

export interface CommandCenterCheck {
  key: string;
  label: string;
  status: CommandCenterCheckStatus;
  detail: string;
}

export interface WorkspaceProvisioningReport {
  subAccountId: string;
  checks: CommandCenterCheck[];
  /** Human-readable issue strings derived from the checks above — the
   *  audit/health view's punch list. Empty when nothing is wrong. */
  issues: string[];
  mapping: WorkspaceMappingDoc | null;
  identityLink: IdentityLinkDoc | null;
  entitlements: WorkspaceEntitlementSummary;
}

export async function getWorkspaceProvisioningReport(subAccountId: string): Promise<WorkspaceProvisioningReport | null> {
  const sub = await getSubAccountDoc(subAccountId);
  if (!sub) return null;

  const [mapping, entitlements] = await Promise.all([
    getMappingBySubAccountId(subAccountId),
    evaluateWorkspaceEntitlements({ workspaceId: subAccountId }, true),
  ]);

  const checks: CommandCenterCheck[] = [];
  const issues: string[] = [];

  // 1. Workspace mapping v2
  if (!mapping) {
    checks.push({ key: "mapping", label: "Workspace Mapping v2", status: "missing", detail: "No workspaceMappings doc exists for this workspace." });
    issues.push("No Workspace Mapping v2 record — Full Ascend cannot activate until one is created (via SSO login JIT or manual provisioning).");
  } else {
    const ok = mapping.status === "active";
    checks.push({
      key: "mapping",
      label: "Workspace Mapping v2",
      status: ok ? "ok" : "warning",
      detail: `status: ${mapping.status}, provisioning: ${mapping.provisioningStatus}`,
    });
    if (!ok) issues.push(`Workspace mapping status is "${mapping.status}" (not active).`);
    if (mapping.provisioningStatus === "partial_failure") {
      const details = mapping.lastReconciliationResult?.details ?? "no details recorded";
      checks.push({ key: "provisioning", label: "Provisioning", status: "warning", detail: `partial_failure — ${details}` });
      issues.push(`Provisioning partial failure: ${details}`);
    }
  }

  // 2. Business profile link (Ascend side)
  if (mapping?.primaryAscendBusinessProfileId) {
    checks.push({
      key: "business_profile",
      label: "Ascend business-profile link",
      status: "ok",
      detail: `primaryAscendBusinessProfileId: ${mapping.primaryAscendBusinessProfileId}`,
    });
  } else {
    checks.push({
      key: "business_profile",
      label: "Ascend business-profile link",
      status: mapping ? "warning" : "unknown",
      detail: mapping ? "Mapping exists but no primary business profile linked yet." : "Cannot check — no mapping exists.",
    });
    if (mapping) issues.push("No Ascend business profile linked yet — intelligence cards will show \"link a business profile\".");
  }

  // 3. Identity link (owner) — only checkable once a mapping names an owner uid
  let identityLink: IdentityLinkDoc | null = null;
  if (mapping?.ownerFirebaseUid) {
    identityLink = await getIdentityLinkByFirebaseUid(mapping.ownerFirebaseUid);
    if (identityLink) {
      const ok = identityLink.status === "active";
      checks.push({
        key: "identity_link",
        label: "Identity link (Clerk ↔ Firebase)",
        status: ok ? "ok" : "warning",
        detail: `status: ${identityLink.status}, source: ${identityLink.linkSource}`,
      });
      if (!ok) issues.push(`Identity link status is "${identityLink.status}" (not active).`);
    } else {
      checks.push({
        key: "identity_link",
        label: "Identity link (Clerk ↔ Firebase)",
        status: "missing",
        detail: `No identityLinks doc for firebaseUid ${mapping.ownerFirebaseUid}.`,
      });
      issues.push("No identity link for the workspace owner — SSO login will re-create this automatically on next sign-in.");
    }
  } else {
    checks.push({ key: "identity_link", label: "Identity link (Clerk ↔ Firebase)", status: "unknown", detail: "Cannot check — no workspace mapping names an owner uid." });
  }

  // 4. Firebase Auth user status for the mapped owner
  if (mapping?.ownerFirebaseUid) {
    try {
      const user = await getAdminAuth().getUser(mapping.ownerFirebaseUid);
      checks.push({
        key: "firebase_user",
        label: "Firebase/user status",
        status: user.disabled ? "warning" : "ok",
        detail: user.disabled ? `${user.email ?? mapping.ownerFirebaseUid} is disabled` : `${user.email ?? mapping.ownerFirebaseUid} active`,
      });
      if (user.disabled) issues.push(`Owner's Firebase Auth account (${user.email ?? mapping.ownerFirebaseUid}) is disabled.`);
    } catch {
      checks.push({ key: "firebase_user", label: "Firebase/user status", status: "missing", detail: `No Firebase Auth user for uid ${mapping.ownerFirebaseUid}.` });
      issues.push("Mapped owner's Firebase Auth user no longer exists.");
    }
  } else {
    checks.push({ key: "firebase_user", label: "Firebase/user status", status: "unknown", detail: "Cannot check — no workspace mapping names an owner uid." });
  }

  // 5. Ascend Intelligence gate (commercial)
  checks.push({
    key: "ascend_gate",
    label: "ascendIntelligenceEnabledByAgency",
    status: sub.ascendIntelligenceEnabledByAgency === true ? "ok" : "warning",
    detail: sub.ascendIntelligenceEnabledByAgency === true ? "on" : "off",
  });
  if (sub.ascendIntelligenceEnabledByAgency !== true) issues.push("Ascend Intelligence gate is off for this workspace's plan.");

  // 6. Entitlement / billing
  checks.push({
    key: "entitlement",
    label: "Entitlement tier",
    status: entitlements.effectiveTier === "full_ascend" ? "ok" : "warning",
    detail: `${entitlements.effectiveTier} (billing: ${entitlements.billingState})`,
  });
  if (entitlements.billingState === "lapsed" || entitlements.billingState === "past_due") {
    issues.push(`Billing state is "${entitlements.billingState}".`);
  }

  // 7. Rollout flags, evaluated for the mapped owner (or "unknown" caller if none)
  const flagUid = mapping?.ownerFirebaseUid ?? "unknown";
  const [unifiedShell, unifiedNavigation] = await Promise.all([
    isFeatureFlagEnabled("unified_shell", { uid: flagUid, workspaceId: subAccountId, isAgencyOwner: false }),
    isFeatureFlagEnabled("unified_navigation", { uid: flagUid, workspaceId: subAccountId, isAgencyOwner: false }),
  ]);
  checks.push({ key: "flag_unified_shell", label: "unified_shell rollout flag", status: unifiedShell ? "ok" : "warning", detail: unifiedShell ? "on for this workspace" : "off for this workspace" });
  checks.push({ key: "flag_unified_navigation", label: "unified_navigation rollout flag", status: unifiedNavigation ? "ok" : "warning", detail: unifiedNavigation ? "on for this workspace" : "off for this workspace" });
  if (!unifiedShell) issues.push("unified_shell rollout flag is off for this workspace — Full Ascend chrome will not render even if entitled.");

  // 8. Intelligence Bridge / Ascend-side reachability (best-effort — this is
  // an HTTP signal from Ascend's own API, NOT a direct Postgres read. Flow
  // has no database connection to Ascend's Postgres at all; this is the
  // closest real, queryable signal that exists, and is labeled as such so
  // it's never mistaken for ground truth on the Ascend side.
  if (!ascendIntelligenceConfigured()) {
    checks.push({ key: "intelligence_bridge", label: "Intelligence Bridge", status: "unknown", detail: "ASCEND_INTELLIGENCE_API_URL/SECRET not configured on this deployment." });
  } else if (!mapping?.primaryAscendBusinessProfileId) {
    checks.push({ key: "intelligence_bridge", label: "Intelligence Bridge", status: "unknown", detail: "No business profile linked — nothing to query." });
  } else {
    const client = createAscendIntelligenceClient();
    const result = await client.getDashboardSummary(mapping.primaryAscendBusinessProfileId);
    const reachable = result.meta.status === "ok" || result.meta.status === "cached" || result.meta.status === "stale";
    checks.push({
      key: "intelligence_bridge",
      label: "Intelligence Bridge (via HTTP, not a direct Postgres read)",
      status: reachable ? "ok" : "warning",
      detail: reachable ? `reachable (status: ${result.meta.status})` : `status: ${result.meta.status}${result.meta.reasonCode ? `, reason: ${result.meta.reasonCode}` : ""}`,
    });
    if (!reachable) issues.push(`Intelligence Bridge unreachable or degraded (status: ${result.meta.status}).`);
  }

  return { subAccountId, checks, issues, mapping, identityLink, entitlements };
}

// ── Members ──────────────────────────────────────────────────────────────

export interface CommandCenterMemberRow {
  uid: string;
  role: string;
  status: string;
  email: string | null;
  displayName: string | null;
}

export interface CommandCenterInviteRow {
  id: string;
  email: string;
  role: string;
  status: string;
}

export async function listMembersForWorkspace(subAccountId: string): Promise<{ members: CommandCenterMemberRow[]; invites: CommandCenterInviteRow[] }> {
  const db = getAdminDb();
  const [membersSnap, invitesSnap] = await Promise.all([
    db.collection(`subAccounts/${subAccountId}/subAccountMembers`).get(),
    db.collection("invites").where("subAccountId", "==", subAccountId).get(),
  ]);

  const members: CommandCenterMemberRow[] = membersSnap.docs.map((d) => {
    const data = d.data() as { role?: string; status?: string; email?: string; displayName?: string };
    return { uid: d.id, role: data.role ?? "collaborator", status: data.status ?? "active", email: data.email ?? null, displayName: data.displayName ?? null };
  });

  const invites: CommandCenterInviteRow[] = invitesSnap.docs
    .map((d) => {
      const data = d.data() as { email?: string; role?: string; status?: string };
      return { id: d.id, email: data.email ?? "", role: data.role ?? "collaborator", status: data.status ?? "pending" };
    })
    .filter((i) => i.status === "pending");

  return { members: members.filter((m) => m.status === "active"), invites };
}
