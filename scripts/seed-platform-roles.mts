/**
 * SEED PLATFORM ROLES — P0.1.
 *
 * Writes `users/{uid}.platformRole` through the Admin SDK only. There is
 * deliberately NO client path to grant a platform role: the seed is an
 * operator action, run by whoever holds deploy access.
 *
 * Dry-run by default. Pass --apply to write.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/seed-platform-roles.mts [--apply]
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--apply");
const { BOOTSTRAP_SUPER_ADMIN_EMAIL } = await import("../src/types/platform-roles.ts");
const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");

const auth = getAdminAuth();
const db = getAdminDb();

const user = await auth.getUserByEmail(BOOTSTRAP_SUPER_ADMIN_EMAIL).catch(() => null);
if (!user) {
  console.error(`No auth user for ${BOOTSTRAP_SUPER_ADMIN_EMAIL} — cannot seed. Create the account first.`);
  process.exit(1);
}

const ref = db.doc(`users/${user.uid}`);
const before = (await ref.get()).data() as { platformRole?: string } | undefined;
console.log(`${BOOTSTRAP_SUPER_ADMIN_EMAIL} (${user.uid})`);
console.log(`  current platformRole: ${before?.platformRole ?? "(none)"}`);
console.log(`  target  platformRole: super_admin`);

if (before?.platformRole === "super_admin") {
  console.log("\nAlready seeded — nothing to do (idempotent).");
  process.exit(0);
}

if (!APPLY) {
  console.log("\nDRY RUN — re-run with --apply to write.");
  process.exit(0);
}

// merge:true so the seed cannot clobber an existing profile.
await ref.set({ platformRole: "super_admin" }, { merge: true });
const after = (await ref.get()).data() as { platformRole?: string } | undefined;
console.log(`\nWROTE platformRole=${after?.platformRole}`);
