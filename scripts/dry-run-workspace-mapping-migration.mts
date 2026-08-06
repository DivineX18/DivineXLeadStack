/**
 * Ascend OS Phase 2, Slice 4 — Workspace Mapping v2 dry-run migration.
 *
 * WRITES NOTHING. Reads source `divinex_workspace_mappings`-shaped rows
 * from an input JSON file (see below) and produces a classification report.
 *
 * Why an input file instead of querying Ascend live: this slice's
 * instructions explicitly defer touching Ascend production code/data until
 * the dev/main branch divergence (Slice 1 finding) is resolved. The
 * Flow-side checks below (does the sub-account exist, does an identity
 * link exist) ARE real, live Firestore reads against this repo's own data
 * — only the Ascend-side inputs (the source mapping rows themselves, and
 * candidate business profiles per clerkUserId) are supplied externally,
 * since there's no safe/authorized way to pull them live from Ascend's
 * Postgres within this slice's constraints.
 *
 * Input file shape:
 * {
 *   "sourceRows": [
 *     { "clerkUserId": "...", "leadstackSubAccountId": "...", "leadstackRole": "admin",
 *       "leadstackFirebaseUid": null, "provisioningAllowed": true, "connectionStatus": "active" }
 *   ],
 *   "candidateProfilesByClerkUserId": {
 *     "clerkUserId1": [{ "id": "...", "businessName": "...", "updatedAt": "2026-01-01T00:00:00Z" }]
 *   }
 * }
 *
 * Usage: npx tsx scripts/dry-run-workspace-mapping-migration.mts --source-file path/to/rows.json
 */
import { readFileSync } from "node:fs";
import { classifyMigrationRow } from "../src/lib/workspace/workspace-mapping-invariants.ts";
import { getIdentityLinkByClerkId } from "../src/lib/auth/identity-links-service.ts";
import { getAdminDb } from "../src/lib/firebase/admin.ts";
import type {
  CandidateBusinessProfile,
  MigrationRowReport,
  SourceWorkspaceMappingRow,
} from "../src/types/workspace-mappings.ts";

interface InputFile {
  sourceRows: SourceWorkspaceMappingRow[];
  candidateProfilesByClerkUserId: Record<string, CandidateBusinessProfile[]>;
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && argv[i + 1]) {
      out[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceFile = args["source-file"];
  if (!sourceFile) {
    console.error("Usage: --source-file path/to/rows.json");
    process.exit(1);
  }

  const input: InputFile = JSON.parse(readFileSync(sourceFile, "utf8"));
  const rows = input.sourceRows ?? [];
  const candidatesByUser = input.candidateProfilesByClerkUserId ?? {};

  console.log(`\nDRY RUN — Workspace Mapping v2 migration analysis (${rows.length} source rows). Nothing will be written.\n`);

  // Duplicate flowSubAccountId detection across the input set itself.
  const subAccountIdCounts = new Map<string, number>();
  for (const row of rows) {
    subAccountIdCounts.set(row.leadstackSubAccountId, (subAccountIdCounts.get(row.leadstackSubAccountId) ?? 0) + 1);
  }

  const reports: MigrationRowReport[] = [];
  const db = getAdminDb();

  for (const row of rows) {
    const isDuplicateFlowSubAccountAcrossSourceRows = (subAccountIdCounts.get(row.leadstackSubAccountId) ?? 0) > 1;

    // Real, live checks against Flow's own data.
    const subSnap = await db.doc(`subAccounts/${row.leadstackSubAccountId}`).get();
    const flowSubAccountExists = subSnap.exists;

    let identityLinkExists = false;
    if (row.leadstackFirebaseUid) {
      // A mapping row that already carries a Firebase UID pre-dates the
      // Slice 3 identityLinks model -- check whether it's since been
      // backfilled into an explicit link.
      const link = await getIdentityLinkByClerkId(row.clerkUserId);
      identityLinkExists = !!link && link.firebaseUid === row.leadstackFirebaseUid;
    } else {
      // No Firebase UID on the source row at all -- this user has never
      // completed the SSO bridge, so there is nothing to have linked yet.
      // Not itself a blocker for the mapping row, but IS a blocker for
      // setting ownerFirebaseUid on the new mapping (handled downstream by
      // the single-mapping migration tool, which requires a resolved
      // identity link before it will write anything).
      identityLinkExists = false;
    }

    const candidateProfiles = candidatesByUser[row.clerkUserId] ?? [];

    const report = classifyMigrationRow({
      row,
      flowSubAccountExists,
      identityLinkExists,
      candidateProfiles,
      isDuplicateFlowSubAccountAcrossSourceRows,
    });
    reports.push(report);
  }

  const byClassification = new Map<string, MigrationRowReport[]>();
  for (const r of reports) {
    const list = byClassification.get(r.classification) ?? [];
    list.push(r);
    byClassification.set(r.classification, list);
  }

  console.log("── Summary ──────────────────────────────────────────────");
  for (const [classification, list] of byClassification) {
    console.log(`  ${classification}: ${list.length}`);
  }

  console.log("\n── Detail ───────────────────────────────────────────────");
  for (const r of reports) {
    console.log(`\n${r.clerkUserId} -> ${r.leadstackSubAccountId}: ${r.classification}`);
    for (const reason of r.reasons) console.log(`    - ${reason}`);
    if (r.candidateProfiles) {
      for (const p of r.candidateProfiles) {
        console.log(`    candidate: ${p.id} "${p.businessName}" (updatedAt: ${p.updatedAt ?? "unknown"})`);
      }
    }
  }

  const eligible = byClassification.get("eligible_for_auto_migration")?.length ?? 0;
  console.log(
    `\n${eligible} of ${rows.length} rows are eligible for automatic single-mapping migration. The rest require the specific handling named above (manual review, missing identity link, etc.) before they can be migrated. No production batch migration is run by this or any other tool in this slice.`,
  );
}

main().catch((err) => {
  console.error("Dry-run analysis failed:", err);
  process.exit(1);
});
