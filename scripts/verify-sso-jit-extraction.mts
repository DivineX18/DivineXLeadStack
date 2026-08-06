/**
 * Characterization/regression coverage for Ascend OS Phase 2, Slice 3: the
 * JIT Firebase provisioning logic was extracted out of
 * src/app/api/auth/sso/callback/route.ts (Phase B(3/4)+C) into a standalone
 * src/lib/auth/sso-jit-provisioning.ts function so a future migration
 * script can call the exact same logic the live SSO callback uses, instead
 * of duplicating it.
 *
 * This is a structural/source-level regression check, not a live-Firebase
 * integration test — matching this repo's existing convention
 * (scripts/verify-checkout-ghl-audit.mts) for logic that touches Admin SDK
 * singletons requiring real credentials to initialize. Section 1 diffs the
 * extracted function against the ORIGINAL committed route file (via `git
 * show HEAD:...`) so this proves preservation against the actual prior
 * behavior, not just "a label exists somewhere."
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
// Pinned to the specific commit immediately BEFORE the extraction landed
// (Slice 2's commit), not a floating HEAD -- HEAD now points at the
// extraction commit itself (Slice 3), so diffing against HEAD would
// compare the extracted code against itself and produce false failures.
// Pinning keeps this test meaningful indefinitely, not just at the moment
// the extraction commit was made.
const PRE_EXTRACTION_COMMIT = "4c92849";
const readAtHead = (rel: string) =>
  execSync(`git show ${PRE_EXTRACTION_COMMIT}:${rel}`, { cwd: root, encoding: "utf8" });

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

const originalRoute = readAtHead("src/app/api/auth/sso/callback/route.ts");
const newRoute = read("src/app/api/auth/sso/callback/route.ts");
const jit = read("src/lib/auth/sso-jit-provisioning.ts");
const exchangeRoute = read("src/app/api/auth/sso/exchange-bridge-token/route.ts");

// ── 1. Original behavior-critical fragments all survive somewhere ─────────
// Literal fragments must appear verbatim in the ORIGINAL (sanity-checked
// below) and verbatim in either the new route or the extracted file.
// Regex entries tolerate legitimate refactor-only differences from
// parameterization (identity.email -> the destructured `email` param) or
// from calling getAdminAuth() inline instead of a cached local `auth` var
// (confirmed functionally identical — getAdminAuth() returns a cached
// singleton, verified against lib/firebase/admin.ts) — those are NOT
// findings, so the check must not flag them as if they were.
type Expectation = { label: string; original: string | RegExp; matchesNew: RegExp };

const literalFragments: string[] = [
  `if (userRecord.disabled) {`,
  `await verifySsoWorkspaceAccess({`,
  `approvedRole: leadstackRole,`,
  `"mapped_uid_not_found"`,
  `"account_disabled"`,
  `"email_mismatch"`,
  `"account_unavailable"`,
  `"no_workspace_access"`,
  `"provisioning_not_allowed"`,
  `"setup_needed"`,
  `No password is ever set`,
  `role: (leadstackRole === "admin" ? "admin" : "collaborator") as SubAccountRole`,
  `agencyRole: null,`,
  `subscriptionStatus: "inactive"`,
  `assignedTerritoryIds: []`,
  `"provisioning_finalize_failed"`,
  `"provisioning_failed"`,
  `"provisioning_create_user_failed"`,
];

for (const fragment of literalFragments) {
  const inOriginal = originalRoute.includes(fragment);
  const inNewCombined = newRoute.includes(fragment) || jit.includes(fragment);
  if (!inOriginal) {
    check(`(sanity) fragment was actually in the original: "${fragment.slice(0, 40)}..."`, false);
    continue;
  }
  check(`Preserved: "${fragment.slice(0, 50)}${fragment.length > 50 ? "..." : ""}"`, inNewCombined);
}

// Refactor-tolerant expectations — same underlying logic, allowed to differ
// in variable naming (parameterization) or call style (getAdminAuth() vs a
// cached local var, both return the same cached singleton).
const toleratedExpectations: Expectation[] = [
  {
    label: "Existing-user lookup by mapped UID (auth.getUser / getAdminAuth().getUser)",
    original: "userRecord = await auth.getUser(leadstackFirebaseUid)",
    matchesNew: /userRecord = await (auth|getAdminAuth\(\))\.getUser\(leadstackFirebaseUid\)/,
  },
  {
    label: "Email-consistency check (identity.email or destructured email)",
    original: "userRecord.email?.toLowerCase() !== identity.email.toLowerCase()",
    matchesNew: /userRecord\.email\?\.toLowerCase\(\) !== (identity\.)?email\.toLowerCase\(\)/,
  },
  {
    label: "provisioningAllowed gate (identity.provisioningAllowed or destructured)",
    original: "if (!identity.provisioningAllowed) {",
    matchesNew: /if \(!(identity\.)?provisioningAllowed\) \{/,
  },
  {
    label: "Orphan-user rollback calls deleteUser, swallows the error (single- or multi-line)",
    original: "await auth.deleteUser(uid).catch(() => undefined)",
    matchesNew: /(auth|getAdminAuth\(\))\s*\n?\s*\.deleteUser\(uid\)\s*\n?\s*\.catch\(\(\) => undefined\)/,
  },
];

for (const exp of toleratedExpectations) {
  const inOriginal = originalRoute.includes(exp.original as string);
  const inNewCombined = exp.matchesNew.test(newRoute) || exp.matchesNew.test(jit);
  if (!inOriginal) {
    check(`(sanity) tolerated-expectation baseline was actually in the original: ${exp.label}`, false);
    continue;
  }
  check(`Preserved (refactor-tolerant): ${exp.label}`, inNewCombined);
}

// ── 2. Extraction actually happened (not a duplication) ────────────────────
check(
  "2a. New route no longer inlines auth.createUser (moved out, not copied)",
  !newRoute.includes("auth.createUser("),
);
check(
  "2b. New route no longer inlines auth.getUser (moved out, not copied)",
  !newRoute.includes("auth.getUser("),
);
check(
  "2c. New route imports resolveOrProvisionFirebaseUser from the extracted file",
  newRoute.includes('import { resolveOrProvisionFirebaseUser } from "@/lib/auth/sso-jit-provisioning"'),
);
check(
  "2d. New route calls resolveOrProvisionFirebaseUser and checks .ok before proceeding",
  /const resolved = await resolveOrProvisionFirebaseUser\(/.test(newRoute) &&
    /if \(!resolved\.ok\)/.test(newRoute),
);
check(
  "2e. New route no longer has a local `const auth = getAdminAuth()` (dead after extraction)",
  !newRoute.includes("const auth = getAdminAuth()"),
);
check(
  "2f. Extracted file exports resolveOrProvisionFirebaseUser",
  /export async function resolveOrProvisionFirebaseUser/.test(jit),
);
check("2g. Extracted file is server-only", jit.trimStart().startsWith('import "server-only"'));

// ── 3. Fail-closed: every failure path returns before Phase D ─────────────
const failureReturns = (jit.match(/return \{ ok: false, errorPage:/g) ?? []).length;
check("3a. Extracted function has exactly 7 distinct failure-return points", failureReturns === 7);
const successReturns = (jit.match(/return \{ ok: true,/g) ?? []).length;
check("3b. Extracted function has exactly 2 success-return points (existing-user, new-user)", successReturns === 2);
check(
  "3c. New route never reaches Phase D (bridge creation) without resolved.ok being true first",
  (() => {
    const resolvedIdx = newRoute.indexOf("const resolved = await resolveOrProvisionFirebaseUser");
    const okCheckIdx = newRoute.indexOf("if (!resolved.ok)", resolvedIdx);
    const uidAssignIdx = newRoute.indexOf("const uid = resolved.uid", okCheckIdx);
    const phaseDIdx = newRoute.indexOf("Phase D", uidAssignIdx);
    return resolvedIdx > -1 && okCheckIdx > resolvedIdx && uidAssignIdx > okCheckIdx && phaseDIdx > uidAssignIdx;
  })(),
);

// ── 4. Role/workspace authorization untouched in the route ────────────────
check(
  "4a. RECOGNIZED_ROLES check still lives in the route (was never part of the extraction)",
  newRoute.includes('const RECOGNIZED_ROLES: SubAccountRole[] = ["admin", "collaborator"]'),
);
check(
  "4b. verifySsoWorkspaceAccess import moved OUT of the route (no longer called there directly)",
  !newRoute.includes("sso-workspace-access"),
);
check(
  "4c. verifySsoWorkspaceAccess is imported and called in the extracted file",
  jit.includes('from "@/lib/auth/sso-workspace-access"') && jit.includes("await verifySsoWorkspaceAccess({"),
);

// ── 5. Session-cookie creation (Phase E) untouched by this slice ──────────
check(
  "5a. exchange-bridge-token/route.ts still mints a Firebase custom token (unchanged by this slice)",
  exchangeRoute.includes("createCustomToken(bridge.uid)"),
);
check(
  "5b. exchange-bridge-token/route.ts still re-validates workspace access before minting (Final rule 2, unchanged)",
  exchangeRoute.includes("verifySsoWorkspaceAccess({"),
);
check(
  "5c. exchange-bridge-token/route.ts still clears the bridge cookie after use (unchanged)",
  exchangeRoute.includes('response.cookies.set(BRIDGE_COOKIE, "", { path: "/", maxAge: 0 })'),
);

// ── 6. Audit logging — every reason string from the original still fires ──
const originalAuditReasons = [
  "missing_code",
  "exchange_rejected",
  "exchange_network_error",
  "unverified_email",
  "sub_account_not_found",
  "role_not_recognized",
  "mapped_uid_not_found",
  "account_disabled",
  "email_mismatch",
  "provisioning_not_allowed",
  "provisioning_create_user_failed",
  "provisioning_finalize_failed",
];
for (const reason of originalAuditReasons) {
  const inOriginal = originalRoute.includes(`"${reason}"`);
  const inNewCombined = newRoute.includes(`"${reason}"`) || jit.includes(`"${reason}"`);
  if (!inOriginal) {
    check(`(sanity) audit reason was actually in the original: ${reason}`, false);
    continue;
  }
  check(`Audit reason preserved: ${reason}`, inNewCombined);
}
// The dynamic access.reason case (workspace-access failures) isn't a fixed
// string literal — confirm the pass-through is preserved structurally.
check(
  "6a. Workspace-access failure still audits the dynamic access.reason (not hardcoded)",
  jit.includes("await auditFailure(access.reason,"),
);

// ── 7. Line-count sanity — a real extraction shrinks the route file ───────
const originalLines = originalRoute.split("\n").length;
const newLines = newRoute.split("\n").length;
check(
  `7a. Route file materially shrank (was ${originalLines} lines, now ${newLines}) — confirms logic moved, not just added-to`,
  newLines < originalLines - 60,
);

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
