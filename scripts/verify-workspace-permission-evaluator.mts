/**
 * Ascend OS Phase 2, Slice 5 — structural/source-level regression coverage
 * for the Firestore-backed evaluator and its wrappers (necessarily
 * structural, same constraint as every prior slice's server-only Admin
 * SDK code — no live Firebase credentials in this environment). The pure
 * registry/compat/requirements logic already has genuine unit-test
 * coverage in verify-workspace-permission-registry.mts.
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

const evaluator = read("src/lib/permissions/evaluate-workspace-permission.ts");
const wrappers = read("src/lib/permissions/workspace-permission-wrappers.ts");
const audit = read("src/lib/permissions/workspace-permission-audit.ts");
const types = read("src/types/workspace-permissions.ts");
const rules = read("firestore.rules");

// ── Core evaluator: no NextResponse, server-only, no client leakage ────────
check(
  "Core evaluator does NOT import NextResponse anywhere (checking actual import statements, not prose in comments)",
  !/^import .*NextResponse.*$/m.test(evaluator) && !evaluator.includes('from "next/server"'),
);
check("Core evaluator is server-only (client components cannot import it)", evaluator.trimStart().startsWith('import "server-only"'));
check("Core evaluator's export name matches the required contract", evaluator.includes("export async function evaluateWorkspacePermission("));

// ── Never trust a caller-supplied role ──────────────────────────────────
check(
  "EvaluateWorkspacePermissionInput has NO effectiveRole/role field a caller could submit (type-level enforcement)",
  !/effectiveRole\s*:|(?<!\.)\brole\s*:/.test(types.split("export interface EvaluateWorkspacePermissionInput")[1]?.split("}")[0] ?? ""),
);
check(
  "effectiveRole in the evaluator is ALWAYS derived from resolveSubAccountAccess's own Firestore read, never from input",
  evaluator.includes("const effectiveRole = accessResult.access.subAccountRole as EffectiveRole") &&
    !evaluator.includes("input.effectiveRole") &&
    !evaluator.includes("input.role"),
);

// ── Never returns another Workspace's membership ────────────────────────
check(
  "resolveSubAccountAccess is always called with the SAME workspaceId that was passed into the evaluator (never a different one)",
  /resolveSubAccountAccess\(callerResult\.caller, workspaceId\)/.test(evaluator),
);
check(
  "getMappingBySubAccountId is called with the same workspaceId too (no cross-workspace lookup)",
  evaluator.includes("getMappingBySubAccountId(workspaceId)"),
);

// ── Evaluation order matches the required 6-step sequence ──────────────────
{
  const order = [
    "isWorkspacePermission(permission)", // 1. validate key
    "resolveAuthedCaller(uid)", // 2. resolve caller
    "resolveSubAccountAccess(callerResult.caller, workspaceId)", // 3. confirm workspace/access
    "getMappingBySubAccountId(workspaceId)", // 4. mapping status
    "requirementsFor(permission)", // 5. entitlement/gate
    "roleHasPermission(effectiveRole, permission)", // 6. role mapping (then deny-by-default falls out of the function's control flow)
  ];
  let lastIndex = -1;
  let inOrder = true;
  for (const marker of order) {
    const idx = evaluator.indexOf(marker);
    if (idx === -1 || idx <= lastIndex) {
      inOrder = false;
      break;
    }
    lastIndex = idx;
  }
  check("Evaluation steps appear in the required order in source (validate -> caller -> access -> mapping -> requirements -> role)", inOrder);
}

// ── Deny by default — every path returns explicitly, no implicit fallthrough ──
{
  const allowedReturns = (evaluator.match(/allowed: true/g) ?? []).length;
  const deniedReturns = (evaluator.match(/allowed: false/g) ?? []).length;
  check("Exactly one allow path exists (the final success branch)", allowedReturns === 1);
  check("Multiple explicit deny paths exist, each returning immediately (deny by default, not one catch-all)", deniedReturns >= 6);
}
check(
  "The function's final statement is the allow branch — nothing falls through past it (deny-by-default has no code path after the last explicit check)",
  evaluator.trimEnd().endsWith("return decision;\n}") || evaluator.trimEnd().endsWith("return decision;\n}\n"),
);

// ── Feature-gate / entitlement hooks reuse real existing logic ────────────
check("Billing-state check reuses the EXISTING effectiveBillingState(), not a reimplementation", evaluator.includes('from "@/lib/billing/status"') && evaluator.includes("effectiveBillingState(sub.billing)"));
check("Agency owner is never walled by a lapsed billing state (matches the real, documented BillingGuard behavior)", /effectiveRole !== "agencyOwner" && sub\?\.billing/.test(evaluator));
check("Territory check reuses the EXISTING loadEffectiveTerritoryScope(), not a reimplementation", evaluator.includes('from "@/lib/auth/territory-filter"') && evaluator.includes("loadEffectiveTerritoryScope("));
check("Workspace Mapping status check reuses the EXISTING Slice 4 service, not a duplicated Firestore read", evaluator.includes('from "@/lib/workspace/workspace-mappings-service"'));

// ── Sensitive data never returned to callers ────────────────────────────
check(
  "WorkspacePermissionDecision never carries raw membership/entitlement doc data (only effectiveRole, a coarse label)",
  !types.split("export interface WorkspacePermissionDecision")[1]?.split("}")[0]?.includes("membership") &&
    !types.split("export interface WorkspacePermissionDecision")[1]?.split("}")[0]?.includes("billing"),
);
check(
  "Human-session wrapper returns a GENERIC error message to HTTP callers, never the internal reason string verbatim",
  wrappers.includes('"Not authorized for this action"') && !wrappers.includes("error: decision.reason"),
);

// ── Wrappers: single choke point, no parallel logic ─────────────────────
check("requireWorkspacePermission (human-session) delegates to the core evaluator, doesn't reimplement it", wrappers.includes("await evaluateWorkspacePermission({ ...input, uid })"));
check(
  "evaluateServiceToServicePermission REQUIRES representedUid (not optional) at the type level",
  /representedUid: string;/.test(wrappers),
);
check(
  "Service-to-service wrapper defensively rejects an empty representedUid before calling the evaluator (never a blanket-secret bypass)",
  /if \(!params\.representedUid\)/.test(wrappers) && wrappers.indexOf("if (!params.representedUid)") < wrappers.indexOf("return evaluateWorkspacePermission({"),
);
check(
  "Zeno-capability stub also requires representedUid and routes through the SAME service-to-service function (no third parallel implementation)",
  wrappers.includes("export async function evaluateZenoCapabilityPermission") &&
    /evaluateZenoCapabilityPermission[\s\S]{0,200}return evaluateServiceToServicePermission\(/.test(wrappers),
);
check("Wrappers file does not duplicate a direct Firestore membership read (no db.doc(`subAccounts/ call here)", !wrappers.includes("db.doc(`subAccounts/"));

// ── Audit: high-risk actions logged (allow+deny), routine reads never persisted ──
check("Every denial gets a structured console log", audit.includes('console.warn("[workspace-permissions] denied"'));
check("Only the named HIGH_RISK_PERMISSIONS list gets a persistent Firestore audit row", /if \(isHighRiskPermission\(decision\.permission\)\)/.test(audit));
check(
  "Read-only/routine permissions (contacts.read, workspace.read) are NOT in the high-risk list (no persistent audit noise for them)",
  !audit.includes('"contacts.read"') && !audit.includes('"workspace.read"'),
);
check("High-risk audit writes are best-effort (never throw into the caller's request path)", audit.includes(".catch((err) =>"));
check("Audit write is append-only (.add(), not .set()/.update() on a fixed doc)", /workspacePermissionAudit["']\)\s*\n?\s*\.add\(/.test(audit.replace(/\s+/g, " ")));

// ── Firestore rules: the one genuinely new collection is locked down ──────
check(
  "firestore.rules: workspacePermissionAudit is Admin-SDK-only",
  /match \/workspacePermissionAudit\/\{[^}]+\}\s*\{\s*allow read, write: if false;/.test(rules),
);

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
