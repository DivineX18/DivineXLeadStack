/**
 * Ascend OS Phase 2, Slice 7 — GENUINE unit tests (real function calls,
 * real assertions) for the pure workspace-selection and migration-state
 * logic. No Firebase import anywhere in this file.
 */
import { decideWorkspaceSelection } from "../src/lib/identity/workspace-selection.ts";
import { deriveIdentitySource, deriveMigrationState } from "../src/lib/identity/identity-migration-state.ts";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

// ── Workspace selection ──────────────────────────────────────────────────
{
  const explicit = decideWorkspaceSelection("sa_explicit", ["sa_1", "sa_2"]);
  check("An explicit workspaceId always wins, even with other candidates present", explicit.workspaceId === "sa_explicit" && explicit.reason === "explicit");

  const none = decideWorkspaceSelection(null, []);
  check("No candidates and no explicit request -> none_available, workspaceId null", none.workspaceId === null && none.reason === "none_available");

  const sole = decideWorkspaceSelection(null, ["sa_only"]);
  check("Exactly one candidate is auto-selected", sole.workspaceId === "sa_only" && sole.reason === "sole_membership");

  const multiple = decideWorkspaceSelection(null, ["sa_1", "sa_2", "sa_3"]);
  check(
    "Multiple candidates with no explicit request NEVER auto-picks one (no 'most recently active' signal exists in the schema, confirmed by audit)",
    multiple.workspaceId === null && multiple.reason === "multiple_available",
  );
  check("Multiple-candidates case still surfaces every candidate for a future switcher UI to use", multiple.candidates.length === 3);

  const explicitAlone = decideWorkspaceSelection("sa_x", []);
  check("An explicit request works even with zero known memberships (e.g. an agency-owner claim shortcut path)", explicitAlone.workspaceId === "sa_x" && explicitAlone.reason === "explicit");
}

// ── Identity source derivation ───────────────────────────────────────────
{
  check("No identityLinks record -> native_signup", deriveIdentitySource(false, null) === "native_signup");
  check("identityLinks record from the SSO bridge's JIT path -> sso_jit_provisioned", deriveIdentitySource(true, "sso_bridge_jit") === "sso_jit_provisioned");
  check("identityLinks record from the migration backfill tool -> migration_backfilled", deriveIdentitySource(true, "migration_backfill") === "migration_backfilled");
  check("identityLinks record with an unrecognized/future linkSource fails closed to 'unknown', never guessed", deriveIdentitySource(true, "manual_admin") === "unknown");
}

// ── Migration state derivation ───────────────────────────────────────────
{
  check("No identityLinks record -> firebase_native", deriveMigrationState(false) === "firebase_native");
  check("An identityLinks record exists -> linked_dual", deriveMigrationState(true) === "linked_dual");
}

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
