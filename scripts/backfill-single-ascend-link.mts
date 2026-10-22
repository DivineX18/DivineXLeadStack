/**
 * One-off repair for a single existing workspace that was created before
 * (or outside of) the createSubAccountForAgency path that now auto-links
 * Ascend on create — reuses ensureAscendWorkspaceLink() exactly as-is, not
 * a parallel implementation.
 *
 * Usage: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/backfill-single-ascend-link.mts <subAccountId> <agencyId> <ownerUid> <businessName> [email]
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";

const [subAccountId, agencyId, ownerUid, businessName, email] = process.argv.slice(2);
if (!subAccountId || !agencyId || !ownerUid || !businessName) {
  console.error("Usage: ... <subAccountId> <agencyId> <ownerUid> <businessName> [email]");
  process.exit(1);
}

const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2]!.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[m[1]!] = v;
  if (!process.env[m[1]!]) process.env[m[1]!] = v;
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
  }),
});

const { ensureAscendWorkspaceLink } = await import("../src/lib/workspace/ensure-ascend-link.ts");

async function main() {
  console.log(`Linking subAccount=${subAccountId} agency=${agencyId} owner=${ownerUid} name="${businessName}"`);
  const result = await ensureAscendWorkspaceLink({
    subAccountId,
    agencyId,
    ownerFirebaseUid: ownerUid,
    actingAsUid: ownerUid,
    businessName,
    email: email ?? null,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
