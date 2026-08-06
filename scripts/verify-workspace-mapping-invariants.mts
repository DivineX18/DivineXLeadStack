/**
 * Ascend OS Phase 2, Slice 4 — GENUINE unit tests (real function calls,
 * real assertions on real return values) for the pure, dependency-free
 * Workspace Mapping v2 logic in
 * src/lib/workspace/workspace-mapping-invariants.ts. No Firebase Admin SDK
 * involved anywhere in this file, unlike the necessarily-structural tests
 * for the Firestore-backed service layer (verify-workspace-mappings-
 * service.mts) — this is exactly the "prefer dependency-injected unit
 * tests... where feasible" case.
 */
import {
  classifyMigrationRow,
  computeAddSecondary,
  computeAttachPrimary,
  computePromoteSecondaryToPrimary,
  computeRemoveSecondary,
  dedupeSecondaryProfileIds,
  nextMappingVersion,
  validateNoPrimarySecondaryOverlap,
} from "../src/lib/workspace/workspace-mapping-invariants.ts";
import type { CandidateBusinessProfile, SourceWorkspaceMappingRow } from "../src/types/workspace-mappings.ts";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── validateNoPrimarySecondaryOverlap (Invariant 3) ────────────────────────
check("No overlap when primary is null", validateNoPrimarySecondaryOverlap(null, ["a", "b"]).ok === true);
check("No overlap when primary isn't in secondaries", validateNoPrimarySecondaryOverlap("c", ["a", "b"]).ok === true);
check("Overlap detected when primary IS in secondaries", validateNoPrimarySecondaryOverlap("a", ["a", "b"]).ok === false);

// ── dedupeSecondaryProfileIds (Invariant 4) ─────────────────────────────────
check("Dedupe removes exact duplicates", deepEqual(dedupeSecondaryProfileIds(["a", "b", "a", "c", "b"]), ["a", "b", "c"]));
check("Dedupe on already-unique input is a no-op", deepEqual(dedupeSecondaryProfileIds(["a", "b"]), ["a", "b"]));
check("Dedupe on empty input returns empty", deepEqual(dedupeSecondaryProfileIds([]), []));
check("Dedupe is idempotent (running it twice gives the same result)", deepEqual(dedupeSecondaryProfileIds(dedupeSecondaryProfileIds(["a", "a", "b"])), ["a", "b"]));

// ── nextMappingVersion (Invariant 9) ────────────────────────────────────────
check("Version increments by exactly 1", nextMappingVersion(1) === 2);
check("Version increments correctly from a non-trivial starting value", nextMappingVersion(41) === 42);

// ── computeAttachPrimary ────────────────────────────────────────────────────
{
  const r1 = computeAttachPrimary({ primary: null, secondaries: [] }, "p1");
  check("Attach primary to an empty Workspace succeeds", r1.ok === true && r1.value.primary === "p1");

  const r2 = computeAttachPrimary({ primary: null, secondaries: ["p1", "p2"] }, "p1");
  check(
    "Attaching a profile that was secondary REMOVES it from secondaries (no overlap after the mutation)",
    r2.ok === true && r2.value.primary === "p1" && deepEqual(r2.value.secondaries, ["p2"]),
  );
}

// ── computeAddSecondary ─────────────────────────────────────────────────────
{
  const r1 = computeAddSecondary({ primary: "p1", secondaries: [] }, "p2");
  check("Add secondary succeeds when it isn't the primary", r1.ok === true && deepEqual((r1 as { value: { secondaries: string[] } }).value.secondaries, ["p2"]));

  const r2 = computeAddSecondary({ primary: "p1", secondaries: [] }, "p1");
  check("Add secondary REJECTS adding the current primary as a secondary", r2.ok === false);

  const r3 = computeAddSecondary({ primary: "p1", secondaries: ["p2"] }, "p2");
  check("Add secondary is idempotent — adding an already-secondary profile doesn't duplicate it", r3.ok === true && deepEqual((r3 as { value: { secondaries: string[] } }).value.secondaries, ["p2"]));
}

// ── computeRemoveSecondary ───────────────────────────────────────────────────
{
  const r1 = computeRemoveSecondary({ primary: "p1", secondaries: ["p2", "p3"] }, "p2");
  check("Remove secondary removes exactly the named profile", deepEqual(r1.secondaries, ["p3"]));

  const r2 = computeRemoveSecondary({ primary: "p1", secondaries: ["p2"] }, "does-not-exist");
  check("Removing a profile that isn't secondary is a harmless no-op", deepEqual(r2.secondaries, ["p2"]));
}

// ── computePromoteSecondaryToPrimary ────────────────────────────────────────
{
  const r1 = computePromoteSecondaryToPrimary({ primary: "old-primary", secondaries: ["p2", "p3"] }, "p2");
  check(
    "Promoting a secondary makes it primary AND moves the old primary into secondaries (nothing is lost)",
    r1.ok === true && r1.value.primary === "p2" && r1.value.secondaries.includes("old-primary") && !r1.value.secondaries.includes("p2"),
  );

  const r2 = computePromoteSecondaryToPrimary({ primary: null, secondaries: ["p2"] }, "p2");
  check("Promoting when there was no prior primary just sets the new primary, no phantom entry added", r2.ok === true && r2.value.primary === "p2" && deepEqual(r2.value.secondaries, []));

  const r3 = computePromoteSecondaryToPrimary({ primary: "p1", secondaries: ["p2"] }, "not-a-secondary");
  check("Promoting a profile that ISN'T currently secondary is rejected", r3.ok === false);
}

// ── classifyMigrationRow ────────────────────────────────────────────────────
const baseRow: SourceWorkspaceMappingRow = {
  clerkUserId: "clerk_1",
  leadstackSubAccountId: "sub_1",
  leadstackRole: "admin",
  leadstackFirebaseUid: "fb_1",
  provisioningAllowed: true,
  connectionStatus: "active",
};
const oneCandidate: CandidateBusinessProfile[] = [{ id: "bp_1", businessName: "Acme", updatedAt: "2026-01-01T00:00:00Z" }];
const twoCandidates: CandidateBusinessProfile[] = [
  { id: "bp_1", businessName: "Acme", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "bp_2", businessName: "Acme Side Project", updatedAt: "2026-06-01T00:00:00Z" }, // deliberately more recent
];

{
  const r = classifyMigrationRow({ row: baseRow, flowSubAccountExists: true, identityLinkExists: true, candidateProfiles: oneCandidate, isDuplicateFlowSubAccountAcrossSourceRows: false });
  check("Clean row with exactly 1 candidate profile is eligible_for_auto_migration", r.classification === "eligible_for_auto_migration");
}
{
  const r = classifyMigrationRow({ row: baseRow, flowSubAccountExists: true, identityLinkExists: true, candidateProfiles: twoCandidates, isDuplicateFlowSubAccountAcrossSourceRows: false });
  check(
    "Row with 2 candidate profiles is ALWAYS multiple_primary_candidates — never auto-picks 'most recently active' even though bp_2 is newer",
    r.classification === "multiple_primary_candidates",
  );
  check("Both candidates are surfaced in the report for manual review", (r.candidateProfiles ?? []).length === 2);
}
{
  const r = classifyMigrationRow({ row: baseRow, flowSubAccountExists: false, identityLinkExists: true, candidateProfiles: oneCandidate, isDuplicateFlowSubAccountAcrossSourceRows: false });
  check("Missing Flow sub-account classifies as missing_flow_subaccount", r.classification === "missing_flow_subaccount");
}
{
  const r = classifyMigrationRow({ row: baseRow, flowSubAccountExists: true, identityLinkExists: false, candidateProfiles: oneCandidate, isDuplicateFlowSubAccountAcrossSourceRows: false });
  check("Missing identity link classifies as missing_identity_link", r.classification === "missing_identity_link");
}
{
  const r = classifyMigrationRow({ row: baseRow, flowSubAccountExists: true, identityLinkExists: true, candidateProfiles: oneCandidate, isDuplicateFlowSubAccountAcrossSourceRows: true });
  check("Duplicate flowSubAccountId across source rows classifies as duplicate_flow_subaccount (takes priority over other checks)", r.classification === "duplicate_flow_subaccount");
}
{
  const badRoleRow = { ...baseRow, leadstackRole: "superadmin" };
  const r = classifyMigrationRow({ row: badRoleRow, flowSubAccountExists: true, identityLinkExists: true, candidateProfiles: oneCandidate, isDuplicateFlowSubAccountAcrossSourceRows: false });
  check("Unrecognized role classifies as invalid_role_or_status", r.classification === "invalid_role_or_status");
}
{
  const inactiveRow = { ...baseRow, connectionStatus: "revoked" };
  const r = classifyMigrationRow({ row: inactiveRow, flowSubAccountExists: true, identityLinkExists: true, candidateProfiles: oneCandidate, isDuplicateFlowSubAccountAcrossSourceRows: false });
  check("Non-active connectionStatus classifies as invalid_role_or_status", r.classification === "invalid_role_or_status");
}
{
  const r = classifyMigrationRow({ row: baseRow, flowSubAccountExists: true, identityLinkExists: true, candidateProfiles: [], isDuplicateFlowSubAccountAcrossSourceRows: false });
  check("Zero candidate profiles classifies as requires_manual_review (not silently eligible)", r.classification === "requires_manual_review");
}

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
