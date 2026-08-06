/**
 * Ascend OS Phase 2, Slice 4 — single-mapping migration.
 *
 * SCOPE, DELIBERATELY NARROW: migrates exactly ONE explicitly-supplied
 * source mapping per invocation. No loop/batch code path exists in this
 * file at all. Dry-run by default; requires --apply to write. Safe to
 * rerun (delegates to createMappingIdempotent, which no-ops on an
 * identical re-run and returns a conflict — never overwrites — on a
 * genuinely different one).
 *
 * Requires a resolved identity link for the source clerkUserId (Slice 3) —
 * refuses to guess or create one inline. Requires an explicit
 * --primary-profile-id OR --no-primary-profile flag — refuses to silently
 * proceed with an ambiguous or unstated primary profile, matching this
 * slice's explicit correction against auto-selecting one.
 *
 * Usage:
 *   npx tsx scripts/migrate-single-workspace-mapping.mts \
 *     --clerk-user-id <id> \
 *     --sub-account-id <flowSubAccountId> \
 *     (--primary-profile-id <id> | --no-primary-profile) \
 *     [--secondary-profile-id <id> ...repeatable...] \
 *     [--apply]
 */
import {
  createMappingIdempotent,
  getMappingBySubAccountId,
} from "../src/lib/workspace/workspace-mappings-service.ts";
import { getIdentityLinkByClerkId } from "../src/lib/auth/identity-links-service.ts";
import { getAdminDb } from "../src/lib/firebase/admin.ts";

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean | string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (key === "secondary-profile-id" && next) {
      out[key] = [...((out[key] as string[] | undefined) ?? []), next];
      i++;
    } else if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const clerkUserId = args["clerk-user-id"] as string | undefined;
  const subAccountId = args["sub-account-id"] as string | undefined;
  const primaryProfileId = args["primary-profile-id"] as string | undefined;
  const noPrimaryProfile = args["no-primary-profile"] === true;
  const secondaryProfileIds = (args["secondary-profile-id"] as string[] | undefined) ?? [];
  const apply = args["apply"] === true;

  if (!clerkUserId || !subAccountId) {
    console.error("Usage: --clerk-user-id <id> --sub-account-id <id> (--primary-profile-id <id> | --no-primary-profile) [--apply]");
    process.exit(1);
  }
  if (!primaryProfileId && !noPrimaryProfile) {
    console.error(
      "Must pass either --primary-profile-id <id> or --no-primary-profile explicitly. This tool never guesses a primary profile.",
    );
    process.exit(1);
  }

  console.log(`\n${apply ? "APPLY" : "DRY RUN"} — single Workspace Mapping migration`);
  console.log(`  clerkUserId: ${clerkUserId}`);
  console.log(`  flowSubAccountId: ${subAccountId}`);
  console.log(`  primaryAscendBusinessProfileId: ${primaryProfileId ?? "(none)"}`);
  console.log(`  secondary profiles: ${secondaryProfileIds.length ? secondaryProfileIds.join(", ") : "(none)"}\n`);

  const existingMapping = await getMappingBySubAccountId(subAccountId);
  if (existingMapping) {
    console.log(
      `Already mapped: subAccountId ${subAccountId} -> workspaceId ${existingMapping.workspaceId} (owner: ${existingMapping.ownerFirebaseUid}). Nothing to do — idempotent.`,
    );
    return;
  }

  const link = await getIdentityLinkByClerkId(clerkUserId);
  if (!link) {
    console.error(
      `No identityLinks record for clerkUserId ${clerkUserId}. Run scripts/backfill-identity-link.mts for this user first — this tool never creates an identity link inline.`,
    );
    process.exit(1);
  }
  console.log(`Resolved identity link: ${clerkUserId} -> firebaseUid ${link.firebaseUid}`);

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    console.error(`subAccounts/${subAccountId} does not exist — aborting, nothing written.`);
    process.exit(1);
  }
  const sub = subSnap.data() as { agencyId: string };

  if (!apply) {
    console.log("Plan: would call createMappingIdempotent() with the params above. Re-run with --apply to actually perform it.");
    return;
  }

  const result = await createMappingIdempotent({
    flowSubAccountId: subAccountId,
    agencyId: sub.agencyId,
    ownerFirebaseUid: link.firebaseUid,
    primaryAscendBusinessProfileId: primaryProfileId ?? null,
    linkedSecondaryAscendBusinessProfileIds: secondaryProfileIds,
    actingAsUid: "system:migration-tool",
  });

  if (!result.ok) {
    console.error(`Mapping creation failed: ${result.reason}`);
    process.exit(1);
  }

  console.log(
    `${result.value.created ? "Created" : "Already existed (idempotent no-op)"} workspaceMappings/${result.value.mapping.workspaceId}`,
  );
}

main().catch((err) => {
  console.error("Single-mapping migration failed:", err);
  process.exit(1);
});
