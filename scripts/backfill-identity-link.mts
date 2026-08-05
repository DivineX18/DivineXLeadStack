/**
 * Ascend OS Phase 2, Slice 3 — identity-link backfill tool.
 *
 * SCOPE, DELIBERATELY NARROW: this script links exactly ONE explicitly-named
 * user per invocation, using the exact same reusable JIT-provisioning logic
 * the live SSO callback uses (lib/auth/sso-jit-provisioning.ts), then
 * records the link via lib/auth/identity-links-service.ts. There is no
 * batch/loop mode in this file at all -- not "batch mode disabled by a
 * flag", genuinely no code path that iterates over more than one user. A
 * real batch backfill needs a bulk "list eligible Clerk users with an
 * active entitlement" source, which lives on the Ascend Intelligence side
 * and does not exist as a callable endpoint yet -- and per this slice's
 * explicit instructions, no new Ascend-side code is being written while
 * that repo's dev/main branch divergence is unresolved. Building the
 * bulk-enumeration half is named as an open gap in
 * PHASE_2_IMPLEMENTATION_LEDGER.md, not silently skipped.
 *
 * Usage:
 *   npx tsx scripts/backfill-identity-link.mts \
 *     --clerk-user-id <id> \
 *     --email <email> \
 *     --sub-account-id <flowSubAccountId> \
 *     --role admin|collaborator \
 *     [--name "Display Name"] \
 *     [--existing-firebase-uid <uid>]   (if already mapped -- resolve, don't create)
 *     [--execute]                        (default: dry-run, prints the plan only)
 *
 * Never prints a secret, a raw token, or a Firebase custom token. Only IDs,
 * emails (already non-secret by nature of the SSO exchange payload shape),
 * and outcome status are logged.
 */
import { resolveOrProvisionFirebaseUser } from "../src/lib/auth/sso-jit-provisioning.ts";
import {
  createIdentityLinkIdempotent,
  getIdentityLinkByClerkId,
  recordIdentityLinkFailure,
} from "../src/lib/auth/identity-links-service.ts";
import { getAdminDb } from "../src/lib/firebase/admin.ts";

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
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
  const email = args["email"] as string | undefined;
  const subAccountId = args["sub-account-id"] as string | undefined;
  const role = (args["role"] as string | undefined) ?? "collaborator";
  const name = (args["name"] as string | undefined) ?? null;
  const existingFirebaseUid = (args["existing-firebase-uid"] as string | undefined) ?? null;
  const execute = args["execute"] === true;

  if (!clerkUserId || !email || !subAccountId) {
    console.error(
      "Usage: --clerk-user-id <id> --email <email> --sub-account-id <id> [--role admin|collaborator] [--name ...] [--existing-firebase-uid <uid>] [--execute]",
    );
    process.exit(1);
  }

  console.log(`\n${execute ? "EXECUTE" : "DRY RUN"} — single-user identity-link backfill`);
  console.log(`  clerkUserId: ${clerkUserId}`);
  console.log(`  email: ${email}`);
  console.log(`  subAccountId: ${subAccountId}`);
  console.log(`  role: ${role}`);
  console.log(`  existingFirebaseUid: ${existingFirebaseUid ?? "(none — will JIT-provision a new Firebase user)"}\n`);

  const existingLink = await getIdentityLinkByClerkId(clerkUserId);
  if (existingLink) {
    console.log(
      `Already linked: clerkUserId ${clerkUserId} -> firebaseUid ${existingLink.firebaseUid} (status: ${existingLink.status}, source: ${existingLink.linkSource}). Nothing to do — this tool is idempotent and will not create a second link.`,
    );
    return;
  }

  if (!execute) {
    console.log(
      "Plan: would call resolveOrProvisionFirebaseUser() with the params above (reusing the exact SSO-bridge JIT logic), then createIdentityLinkIdempotent() to record the result. Re-run with --execute to actually perform it.",
    );
    return;
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    console.error(`subAccounts/${subAccountId} does not exist — aborting, nothing written.`);
    process.exit(1);
  }
  const sub = subSnap.data() as { agencyId: string; name: string };

  const resolved = await resolveOrProvisionFirebaseUser({
    clerkUserId,
    email,
    name,
    leadstackFirebaseUid: existingFirebaseUid,
    leadstackSubAccountId: subAccountId,
    leadstackRole: role,
    provisioningAllowed: true, // this tool IS the explicit human-approved provisioning path
    subAgencyId: sub.agencyId,
    subName: sub.name,
  });

  if (!resolved.ok) {
    console.error(`resolveOrProvisionFirebaseUser failed: ${resolved.errorPage}`);
    await recordIdentityLinkFailure({
      clerkUserId,
      firebaseUid: existingFirebaseUid,
      reason: resolved.errorPage,
      linkSource: "migration_backfill",
    });
    process.exit(1);
  }

  console.log(`Resolved/provisioned Firebase uid: ${resolved.uid}`);

  const linkResult = await createIdentityLinkIdempotent({
    clerkUserId,
    firebaseUid: resolved.uid,
    emailAtLinkTime: email,
    linkSource: "migration_backfill",
    linkedByUid: "system:migration-backfill-script",
    migrationState: "complete",
  });

  if (!linkResult.ok) {
    console.error(
      `Identity link conflict (${linkResult.reason}) — existing link points elsewhere. NOT overwritten. Existing: clerkUserId=${linkResult.existingLink.clerkUserId} firebaseUid=${linkResult.existingLink.firebaseUid}`,
    );
    process.exit(1);
  }

  console.log(
    `${linkResult.created ? "Created" : "Already existed (idempotent no-op)"} identityLinks/${clerkUserId} -> ${resolved.uid}`,
  );
}

main().catch((err) => {
  console.error("Backfill script failed with an unexpected error:", err);
  process.exit(1);
});
