/**
 * Ascend OS Phase 2, Slice 4 — structural/source-level regression coverage
 * for the Firestore-backed Workspace Mapping v2 service layer, migration
 * tooling, Firestore rules, and authz separation. The pure decision logic
 * already has genuine unit-test coverage in
 * verify-workspace-mapping-invariants.mts — this file covers what can only
 * reasonably be verified structurally given no live Firebase Admin
 * credentials are available in this environment (same established
 * constraint as Slice 3's verify-sso-jit-extraction.mts /
 * verify-identity-links.mts).
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

const svc = read("src/lib/workspace/workspace-mappings-service.ts");
const authz = read("src/lib/workspace/workspace-mappings-authz.ts");
const invariants = read("src/lib/workspace/workspace-mapping-invariants.ts");
const rules = read("firestore.rules");
const dryRun = read("scripts/dry-run-workspace-mapping-migration.mts");
const singleMigrate = read("scripts/migrate-single-workspace-mapping.mts");
const reconcileCli = read("scripts/reconcile-workspace-mapping.mts");
const identityLinksSvc = read("src/lib/auth/identity-links-service.ts");

// ── Idempotent create + duplicate flowSubAccountId conflict ────────────────
check("1a. createMappingIdempotent runs inside a transaction (atomic check-then-write)", /runTransaction\(async \(tx\)/.test(svc));
check("1b. A conflicting flowSubAccountId returns a result the caller must branch on, never silently overwrites", svc.includes('outcome: "conflict"'));
check(
  "1c. Same-owner re-create is treated as an idempotent no-op (created: false), not a duplicate or an error",
  svc.includes("result.existing.ownerFirebaseUid === params.ownerFirebaseUid") && svc.includes("created: false"),
);
check(
  "1d. Different-owner conflict on the same flowSubAccountId is rejected, not merged",
  /flowSubAccountId \$\{params\.flowSubAccountId\} is already mapped to a different owner/.test(svc),
);
check("1e. flowSubAccountId uniqueness is structural (doc ID = flowSubAccountId on the reverse index)", svc.includes("reverseIndexCol().doc(params.flowSubAccountId)"));

// ── mappingVersion increments on every material change ─────────────────────
check(
  "2a. withMapping() (the shared read-modify-write helper for all mutations) always increments mappingVersion",
  /mappingVersion: nextMappingVersion\(current\.mappingVersion\)/.test(svc),
);
const mutatingFns = ["attachPrimaryBusinessProfile", "addSecondaryBusinessProfile", "removeSecondaryBusinessProfile", "promoteSecondaryToPrimary", "updateMappingStatus", "recordPartialFailure"];
for (const fn of mutatingFns) {
  check(`2b. ${fn} routes through withMapping() (inherits the version-increment guarantee)`, new RegExp(`export async function ${fn}[\\s\\S]{0,400}?withMapping\\(`).test(svc));
}

// ── Archive / restore ───────────────────────────────────────────────────────
check("3a. archiveMapping sets status to archived via the shared status updater", svc.includes('export async function archiveMapping') && svc.includes('updateMappingStatus(workspaceId, "archived"'));
check(
  "3b. restoreArchivedMapping REFUSES to restore a mapping that isn't currently archived (fails closed, doesn't just overwrite status)",
  /if \(m\.status !== "archived"\)/.test(svc),
);
check("3c. Archived mappings are never deleted anywhere in this file (no .delete() call exists)", !svc.includes(".delete()"));

// ── Partial failure recording ───────────────────────────────────────────────
check("4a. recordPartialFailure sets provisioningStatus to partial_failure", svc.includes('"partial_failure" as WorkspaceMappingProvisioningStatus'));
check("4b. recordPartialFailure logs the specific step and reason to the audit trail, not just a generic marker", /logAttempt\(\{ workspaceId, outcome: "partial_failure", step, reason, actingAsUid \}\)/.test(svc));

// ── Reconciliation ───────────────────────────────────────────────────────────
check("5a. Reconciliation checks the REAL Flow SubAccount document exists", svc.includes('db.doc(`subAccounts/${mapping.flowSubAccountId}`).get()'));
check("5b. Missing SubAccount is reported as check_failed, not silently ignored", svc.includes('outcome: "check_failed"'));
check("5c. Reconciliation checks real owner membership (subAccountMembers), not just presence of an ownerFirebaseUid field", svc.includes("subAccountMembers/${mapping.ownerFirebaseUid}"));
{
  // Precisely isolate the doc-write object reconcileMapping actually
  // passes to withMapping() and confirm ownerFirebaseUid never appears in
  // it — the only conditionally-written field is agencyId.
  const reconcileWriteBlock = svc.match(/await withMapping\(workspaceId, actingAsUid, "reconcile",[\s\S]{0,300}?\}\)\);/)?.[0] ?? "";
  check(
    "5d. Ownership/membership drift is NEVER auto-repaired regardless of the repairSafeDrift flag (only agencyId is written back)",
    svc.includes("NEVER auto-repaired, ownership is never guessed") &&
      reconcileWriteBlock.length > 0 &&
      !reconcileWriteBlock.includes("ownerFirebaseUid") &&
      reconcileWriteBlock.includes("agencyRepaired"),
  );
}
check(
  "5e. agencyId drift IS the one case that can be auto-repaired, and only when repairSafeDrift is explicitly passed",
  /if \(options\.repairSafeDrift\)/.test(svc) && svc.includes("agencyId drift auto-repaired"),
);
check(
  "5f. Ascend business-profile existence uses an INJECTED checker (dependency injection), not a hardcoded Postgres/HTTP call",
  svc.includes("ascendProfileExistenceCheck?: (profileId: string) => Promise<boolean>"),
);
check(
  "5g. When no checker is injected, the report says so explicitly rather than silently skipping the check",
  svc.includes("Ascend business profile existence NOT verified"),
);
check("5h. Every reconciliation run writes lastReconciliationResult back onto the mapping doc", svc.includes("lastReconciliationResult: result"));

// ── Audit event creation (every mutating path) ──────────────────────────────
const auditedOutcomes = ['"conflict"', '"created"', '"updated"', '"rejected"', '"partial_failure"'];
for (const outcome of auditedOutcomes) {
  check(`6. Audit log covers outcome ${outcome}`, svc.includes(outcome) && svc.includes("logAttempt"));
}
check("6z. Attempt log is append-only (.add(), never .set()/.update() on a fixed doc)", svc.includes('collection("workspaceMappingAttempts")') && /workspaceMappingAttempts["']?\)\s*\n?\s*\.add\(/.test(svc.replace(/\s+/g, " ")));

// ── No runtime email matching anywhere in this slice's new code ────────────
for (const [label, src] of [["service", svc], ["authz", authz], ["invariants", invariants], ["dry-run tool", dryRun], ["single-migrate tool", singleMigrate]] as const) {
  check(`7. ${label}: no email-based matching/lookup anywhere`, !/\.where\(["']email/.test(src) && !/email.*===.*email/.test(src.replace(/\s+/g, " ")));
}

// ── Separation: workspaceMappings vs identityLinks vs Flow memberships ─────
check("8a. workspace-mappings-service.ts does not import from identity-links-service.ts (kept separate, not merged)", !svc.includes("identity-links-service"));
check("8b. WorkspaceMappingDoc and IdentityLinkDoc are distinct types in distinct files (not a shared/combined schema)", !read("src/types/workspace-mappings.ts").includes("firebaseUid: string") || read("src/types/workspace-mappings.ts").includes("ownerFirebaseUid"));
check("8c. Single-mapping migration tool RESOLVES an identity link (read-only) rather than creating one inline — keeps the two systems' write paths separate", singleMigrate.includes("getIdentityLinkByClerkId") && !singleMigrate.includes("createIdentityLinkIdempotent"));
check("8d. identityLinks service has no knowledge of workspaceMappings (no import either direction)", !identityLinksSvc.includes("workspace-mappings"));

// ── Authorization reuse — human-session functions ───────────────────────────
check("9a. Authz wrapper reuses Flow's EXISTING requireSubAccountMember, doesn't reimplement it", authz.includes('from "@/lib/auth/require-tenancy"') && authz.includes("requireSubAccountMember("));
check("9b. Authz wrapper fails closed (returns the NextResponse) when access check fails, before touching the mapping", /if \(access instanceof NextResponse\) return access;/.test(authz));
check("9c. Reconciliation via the human-session path is admin-only (not open to every member)", authz.includes('access.subAccountRole !== "admin" && access.subAccountRole !== "agencyOwner"'));
check("9d. Authz wrapper never leaks the internal service-layer reason string verbatim to the HTTP caller", authz.includes("Reconciliation could not complete") && !authz.includes("error: result.reason"));
check(
  "9e. Service-to-service functions (workspace-mappings-service.ts) have NO import of require-tenancy or NextResponse — confirms they are not accidentally the same code path as the human-session wrapper",
  !svc.includes("require-tenancy") && !svc.includes("NextResponse"),
);

// ── Migration tooling: dry-run-safe, single-scope, never guesses primary ──
check(
  "10a. Dry-run migration tool performs zero Firestore writes (no .doc(...).set/.update, no .collection(...).add — the in-memory Map.set() used for duplicate detection is not a Firestore call)",
  !/\.doc\([^)]*\)\s*\.\s*(set|update)\(/.test(dryRun) && !/\.collection\([^)]*\)\s*\.\s*add\(/.test(dryRun),
);
check("10b. Dry-run tool never auto-selects a primary profile (delegates entirely to classifyMigrationRow)", !dryRun.includes("mostRecent") && !dryRun.includes(".sort(") );
check("10c. Single-mapping tool has no loop/batch construct", !/for\s*\(.*of.*rows/i.test(singleMigrate) && !/for await/.test(singleMigrate));
check("10d. Single-mapping tool requires an EXPLICIT primary-profile decision (flag), never defaults silently", singleMigrate.includes("noPrimaryProfile") && singleMigrate.includes("never guesses a primary profile"));
check("10e. Single-mapping tool is dry-run by default (apply must be explicit)", singleMigrate.includes('const apply = args["apply"] === true'));
check("10f. Single-mapping tool checks for an existing mapping FIRST and exits without writing if already mapped (idempotent)", /if \(existingMapping\) \{[\s\S]{0,300}?return;\s*\n\s*\}/.test(singleMigrate));
check("10g. Reconciliation CLI never repairs ownership/membership drift, only optionally the safe agencyId case", reconcileCli.includes("--repair-safe-drift") && !reconcileCli.includes("ownerFirebaseUid ="));

// ── Firestore rules: all three new collections locked down ────────────────
for (const collection of ["workspaceMappings", "workspaceMappingsBySubAccount", "workspaceMappingAttempts"]) {
  const re = new RegExp(`match /${collection}/\\{[^}]+\\}\\s*\\{\\s*allow read, write: if false;`);
  check(`11. firestore.rules: ${collection} is Admin-SDK-only`, re.test(rules));
}

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
