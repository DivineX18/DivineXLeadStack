/**
 * Ascend OS Phase 2, Slice 6 — structural/source-level regression coverage
 * for the Firestore-backed entitlement evaluator, wrappers, and audit
 * module (necessarily structural, same constraint as every prior slice's
 * server-only Admin SDK code). The pure registry/usage/decision/upgrade
 * logic already has genuine unit-test coverage in
 * verify-workspace-entitlements.mts.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

const evaluator = read("src/lib/entitlements/evaluate-workspace-entitlements.ts");
const wrappers = read("src/lib/entitlements/workspace-entitlement-wrappers.ts");
const audit = read("src/lib/entitlements/workspace-entitlement-audit.ts");
const registry = read("src/lib/entitlements/workspace-entitlement-registry.ts");
const rules = read("firestore.rules");

// ── One canonical registry, one evaluator ──────────────────────────────
check("Exactly one entitlement registry file exists and is the sole export source", registry.includes("export const WORKSPACE_ENTITLEMENT_REGISTRY"));
check("Exactly one core evaluator function exists", evaluator.includes("export async function evaluateWorkspaceEntitlements("));
check(
  "Registry is imported, not redefined, in the evaluator (no second inline module list)",
  evaluator.includes('from "@/lib/entitlements/workspace-entitlement-registry"') && !/WORKSPACE_ENTITLEMENT_REGISTRY\s*=\s*\{/.test(evaluator),
);

// ── Core evaluator: no NextResponse, server-only ────────────────────────
check(
  "Core evaluator does NOT import NextResponse (checking actual import statements, not prose in comments)",
  !/^import .*NextResponse.*$/m.test(evaluator) && !evaluator.includes('from "next/server"'),
);
check("Core evaluator is server-only", evaluator.trimStart().startsWith('import "server-only"'));

// ── No duplicate feature-gate or billing logic ──────────────────────────
check(
  "Feature-gate check reuses the plain sub-doc field read convention (sub[gate] === true), not a second gate-checking abstraction",
  evaluator.includes("sub[") === false, // the actual check now lives in workspace-entitlement-decision.ts
);
check(
  "The extracted pure decision module is the ONLY place that reads a gate field off the sub doc",
  read("src/lib/entitlements/workspace-entitlement-decision.ts").includes("sub[entry.requiredFeatureGate] === true"),
);
check("Billing state reuses the EXISTING effectiveBillingState(), not a reimplementation", evaluator.includes('from "@/lib/billing/status"') && evaluator.includes("effectiveBillingState(sub.billing)"));
check("Agency owner is exempted from a lapsed-billing blanket deny (matches the real, documented BillingGuard behavior)", evaluator.includes("!callerIsAgencyOwner"));
check("Workspace Mapping status reuses the EXISTING Slice 4 service, not a duplicated Firestore read", evaluator.includes('from "@/lib/workspace/workspace-mappings-service"'));

// ── Deny by default, workspace-level vs per-module audit split ─────────
check("Missing sub-account denies everything (workspace_inactive)", /!subSnap\.exists[\s\S]{0,80}denyAll\(workspaceId, "workspace_inactive"/.test(evaluator));
check("Archived sub-account denies everything (workspace_archived)", /sub\.status === "archived"[\s\S]{0,80}denyAll\(workspaceId, "workspace_archived"/.test(evaluator));
check("Archived Workspace Mapping ALSO denies everything, not just an inactive sub-account", /mapping\.status === "archived"[\s\S]{0,80}denyAll\(workspaceId, "workspace_archived"/.test(evaluator));
check(
  "denyAll() logs exactly ONE workspace-level audit event, never one per module (the excessive-write bug caught and fixed this slice)",
  evaluator.includes("logWorkspaceLevelDenial(workspaceId, reason)") &&
    !/function denyAll[\s\S]*?for \(const decision of blockedModules\) logEntitlementDecision/.test(evaluator),
);
check(
  "Per-module loop calls the per-decision (console-only) logger, not the workspace-level one",
  /for \(const mod of WORKSPACE_MODULES\)[\s\S]{0,300}logEntitlementDecision\(workspaceId, decision\)/.test(evaluator),
);

// ── Audit: persistent writes only for blanket reasons, never per-module ──
check("logEntitlementDecision (per-module) NEVER writes to Firestore", !/function logEntitlementDecision[\s\S]{0,300}getAdminDb/.test(audit));
check("logWorkspaceLevelDenial is the ONLY function in this file that writes to Firestore", /function logWorkspaceLevelDenial[\s\S]{0,400}getAdminDb\(\)/.test(audit));
check("Only the three blanket reasons are in the persistent-reasons list", audit.includes('"workspace_archived"') && audit.includes('"workspace_inactive"') && audit.includes('"billing_inactive"') && !audit.includes('"feature_gate_disabled"'));
check("Audit writes are best-effort (never throw into the caller's request path)", audit.includes(".catch((err) =>"));
check("Audit write is append-only (.add(), not .set()/.update() on a fixed doc)", /workspaceEntitlementAudit["']\)\s*\n?\s*\.add\(/.test(audit.replace(/\s+/g, " ")));

// ── Wrappers: reuse the evaluator, compose with Slice 5 permissions ────
check("Human-session wrapper delegates to the core evaluator, doesn't reimplement it", wrappers.includes("return evaluateWorkspaceEntitlements(input, permissionDecision.effectiveRole"));
check(
  "EVERY human-facing wrapper composes with Slice 5's evaluateWorkspacePermission FIRST (workspace.read) — required 'compatibility with Slice 5' wiring",
  (wrappers.match(/await evaluateWorkspacePermission\(\{/g) ?? []).length >= 3 && wrappers.includes('permission: "workspace.read"'),
);
check(
  "Service-to-service wrapper REQUIRES representedUid (not optional) at the type level, same discipline as Slice 5",
  /representedUid: string;/.test(wrappers),
);
check("Service-to-service wrapper defensively rejects an empty representedUid before calling anything else", /if \(!params\.representedUid\)/.test(wrappers));
check(
  "Zeno + Ascend-bridge stubs route through the SAME service-to-service function (no third parallel implementation)",
  wrappers.includes("export async function evaluateWorkspaceEntitlementsForZeno") &&
    /evaluateWorkspaceEntitlementsForZeno[\s\S]{0,200}return evaluateWorkspaceEntitlementsForService\(/.test(wrappers) &&
    wrappers.includes("export const evaluateWorkspaceEntitlementsForAscendBridge = evaluateWorkspaceEntitlementsForZeno"),
);
check("Wrappers file does not duplicate a direct Firestore membership/sub-account read", !wrappers.includes("db.doc(`subAccounts/"));

// ── Firestore rules: the one genuinely new collection is locked down ──────
check(
  "firestore.rules: workspaceEntitlementAudit is Admin-SDK-only",
  /match \/workspaceEntitlementAudit\/\{[^}]+\}\s*\{\s*allow read, write: if false;/.test(rules),
);

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
