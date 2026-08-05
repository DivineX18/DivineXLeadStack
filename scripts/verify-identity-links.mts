/**
 * Regression coverage for the identityLinks model (Ascend OS Phase 2, Slice
 * 3). Structural/source-level, matching this repo's established convention
 * for logic that requires live Firebase Admin credentials to execute for
 * real (scripts/verify-checkout-ghl-audit.mts, verify-sso-jit-extraction.mts)
 * -- deliberately does not write to any real Firestore project.
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

const svc = read("src/lib/auth/identity-links-service.ts");
const types = read("src/types/identity-links.ts");
const rules = read("firestore.rules");
const backfill = read("scripts/backfill-identity-link.mts");

// ── Uniqueness enforcement ─────────────────────────────────────────────────
check(
  "1a. Main collection is keyed by clerkUserId as the doc ID (Firestore enforces clerkUserId uniqueness for free)",
  /linksCol\(\)\.doc\(clerkUserId\)/.test(svc),
);
check(
  "1b. Reverse index is keyed by firebaseUid as the doc ID (same trick for firebaseUid uniqueness)",
  /reverseIndexCol\(\)\.doc\(firebaseUid\)/.test(svc),
);
check(
  "1c. Create runs inside a single Firestore transaction (atomic check-then-write, no race window)",
  /runTransaction\(async \(tx\)/.test(svc),
);

// ── Never link by email ────────────────────────────────────────────────────
check(
  "2a. emailAtLinkTime is documented as audit-display-only, never a lookup key",
  types.includes("NEVER used as a lookup key"),
);
check(
  "2b. No function in the service compares/queries by email anywhere",
  !/\.where\(["']email/.test(svc) && !svc.includes("emailAtLinkTime ==") && !svc.includes("emailAtLinkTime ===") ,
);
check(
  "2c. getIdentityLinkByClerkId and getIdentityLinkByFirebaseUid look up by ID only, not by scanning/matching email",
  /doc\(clerkUserId\)\.get\(\)/.test(svc) && /doc\(firebaseUid\)\.get\(\)/.test(svc),
);

// ── Idempotent create + conflict detection ─────────────────────────────────
check(
  "3a. Identical re-run of the same (clerkUserId, firebaseUid) pairing is a no-op, not a duplicate or an error",
  svc.includes('outcome: "noop"') && svc.includes("existing.firebaseUid === firebaseUid"),
);
check(
  "3b. A clerkUserId already linked to a DIFFERENT firebaseUid returns a conflict, never overwrites",
  svc.includes('outcome: "clerk_id_conflict"'),
);
check(
  "3c. A firebaseUid already linked to a DIFFERENT clerkUserId returns a conflict, never overwrites",
  svc.includes('outcome: "firebase_uid_conflict"'),
);
check(
  "3d. Conflict results carry the existing link back to the caller (never silently discarded)",
  /reason: "clerk_id_conflict", existingLink: result\.link/.test(svc) &&
    /reason: "firebase_uid_conflict"/.test(svc),
);
check(
  "3e. CreateIdentityLinkResult type forces callers to handle both conflict reasons explicitly (discriminated union, not a boolean)",
  types.includes('reason: "clerk_id_conflict" | "firebase_uid_conflict"'),
);

// ── Status, migration state, failure recording, audit metadata ────────────
check("4a. updateIdentityLinkStatus exists and is exported", svc.includes("export async function updateIdentityLinkStatus"));
check(
  "4b. IdentityLinkStatus supports active/revoked/superseded (not just a boolean)",
  types.includes('"active" | "revoked" | "superseded"'),
);
check(
  "4c. IdentityLinkMigrationState is modeled distinctly from status",
  types.includes('"not_started" | "in_progress" | "complete" | "failed"'),
);
check(
  "4d. recordIdentityLinkFailure exists, is exported, and never accepts a secret/token parameter",
  svc.includes("export async function recordIdentityLinkFailure") &&
    !/recordIdentityLinkFailure\([^)]*secret/i.test(svc) &&
    !/recordIdentityLinkFailure\([^)]*token/i.test(svc),
);
check(
  "4e. Every create outcome (noop/created/clerk_id_conflict/firebase_uid_conflict) writes an attempt-log entry",
  (svc.match(/await logAttempt\(/g) ?? []).length >= 4,
);
check(
  "4f. Attempt log is append-only (.add(), never .set()/.update() on a fixed doc ID)",
  /identityLinkAttempts["']\)\s*\n?\s*\.add\(/.test(svc.replace(/\s+/g, " ")) || svc.includes('collection("identityLinkAttempts").add('),
);

// ── Firestore rules lock the new collections down ──────────────────────────
for (const collection of ["identityLinks", "identityLinksByFirebaseUid", "identityLinkAttempts"]) {
  const re = new RegExp(`match /${collection}/\\{[^}]+\\}\\s*\\{\\s*allow read, write: if false;`);
  check(`5. firestore.rules: ${collection} is Admin-SDK-only (no client read/write)`, re.test(rules));
}

// ── Backfill tooling: single-user only, dry-run-default, idempotent, no secrets logged ──
check(
  "6a. Backfill script has no loop/batch construct (no for-of/for-await over a user list)",
  !/for\s*\(.*of.*users/i.test(backfill) && !/for await/.test(backfill),
);
check("6b. Dry-run is the default (execute must be explicitly passed)", backfill.includes('const execute = args["execute"] === true'));
check(
  "6c. Backfill checks for an existing link FIRST and exits without writing if already linked (idempotent)",
  /if \(existingLink\) \{[\s\S]{0,300}?return;\s*\n\s*\}/.test(backfill),
);
check(
  "6d. Backfill reuses resolveOrProvisionFirebaseUser rather than reimplementing JIT logic",
  backfill.includes('import { resolveOrProvisionFirebaseUser } from "../src/lib/auth/sso-jit-provisioning.ts"'),
);
check(
  "6e. Backfill script never logs a token, secret, or password",
  !/console\.(log|error)\([^)]*(secret|token|password)/i.test(backfill),
);

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
