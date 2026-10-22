/**
 * One-off, READ-ONLY diagnostic for a support ticket. Looks up one user by
 * email, their agency/sub-account memberships, the feature gates on each
 * sub-account, and whether each sub-account has an Ascend business-profile
 * link. Prints a report; writes nothing.
 *
 * Usage: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/diagnose-account.mts <email>
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMappingBySubAccountId } from "../src/lib/workspace/workspace-mappings-service.ts";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/diagnose-account.mts <email>");
  process.exit(1);
}

const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2]!.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[m[1]!] = v;
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();
const auth = getAuth();

async function main() {
  const userRecord = await auth.getUserByEmail(email).catch(() => null);
  if (!userRecord) {
    console.log(`No Firebase Auth user found for ${email}`);
    return;
  }
  console.log(`=== ${email} ===`);
  console.log("uid:", userRecord.uid);
  console.log("disabled:", userRecord.disabled);
  console.log("customClaims:", JSON.stringify(userRecord.customClaims ?? {}, null, 2));

  const userDoc = await db.doc(`users/${userRecord.uid}`).get();
  console.log("\n--- users/{uid} doc ---");
  console.log(userDoc.exists ? JSON.stringify(userDoc.data(), null, 2) : "(missing)");

  const membershipsSnap = await db.collection(`userMemberships/${userRecord.uid}/subAccounts`).get();
  console.log(`\n--- userMemberships/{uid}/subAccounts (${membershipsSnap.size}) ---`);
  for (const m of membershipsSnap.docs) {
    console.log(`  ${m.id}:`, JSON.stringify(m.data(), null, 2));
  }

  for (const m of membershipsSnap.docs) {
    const subAccountId = m.id;
    const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
    console.log(`\n=== subAccounts/${subAccountId} ===`);
    if (!subSnap.exists) {
      console.log("  (missing — stale membership pointer)");
      continue;
    }
    const sub = subSnap.data()!;
    console.log("  name:", sub.name);
    console.log("  agencyId:", sub.agencyId);
    console.log("  build gates: funnelsEnabledByAgency =", sub.funnelsEnabledByAgency, "| websiteEnabledByAgency =", sub.websiteEnabledByAgency, "| aiSuiteEnabledByAgency =", sub.aiSuiteEnabledByAgency);
    console.log("  ascendIntelligenceEnabledByAgency:", sub.ascendIntelligenceEnabledByAgency);
    console.log("  ascendOperations:", JSON.stringify(sub.ascendOperations ?? null));
    console.log("  billing:", JSON.stringify(sub.billing ?? null));

    const memberSnap = await db.doc(`subAccounts/${subAccountId}/subAccountMembers/${userRecord.uid}`).get();
    console.log("  subAccountMembers/{uid}:", memberSnap.exists ? JSON.stringify(memberSnap.data()) : "(missing)");

    // NOTE: workspaceMappings is keyed by its OWN generated workspaceId, not
    // the Flow subAccountId — there's no field to .where() against. The real
    // lookup goes through the reverse index (workspaceMappingsBySubAccount),
    // which is exactly what getMappingBySubAccountId does. An earlier version
    // of this script queried workspaceMappings directly with a nonexistent
    // field and always reported "NONE" regardless of real state — fixed.
    const mapping = await getMappingBySubAccountId(subAccountId);
    console.log("  workspaceMappings:", mapping ? JSON.stringify({
      status: mapping.status,
      primaryAscendBusinessProfileId: mapping.primaryAscendBusinessProfileId,
      linkedSecondaryAscendBusinessProfileIds: mapping.linkedSecondaryAscendBusinessProfileIds,
    }, null, 2) : "NONE — no Ascend business-profile link for this sub-account");
  }

  // Agency-level check, for the "Agency Owner only" restriction question.
  const claims = userRecord.customClaims ?? {};
  if (claims.agencyId) {
    const agencySnap = await db.doc(`agencies/${claims.agencyId}`).get();
    console.log(`\n=== agencies/${claims.agencyId} ===`);
    console.log(agencySnap.exists ? JSON.stringify(agencySnap.data(), null, 2) : "(missing)");
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
