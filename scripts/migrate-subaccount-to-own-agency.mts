/**
 * Give a sub-account admin their OWN agency, and move their workspace into it.
 *
 * WHY THIS EXISTS. A customer who resells to their own clients needs to create
 * a workspace per client. Creating one requires agency owner. A customer
 * provisioned as a sub-account INSIDE the platform owner's agency is therefore
 * permanently stuck at one workspace, and every client they take on lands in
 * the same workspace. That is not only a nuisance: the funnel image engine
 * assumes a workspace is one business, so a shared workspace will place one
 * client's photography onto another client's page. It did.
 *
 * The product already provisions a direct customer correctly, with their own
 * agency and a Main workspace. This repairs the ones created by hand before
 * that path was used.
 *
 * WHAT MOVES, AND WHY agencyId IS ON EVERY DOC. `subAccountId` is the real
 * tenancy key and is what every client query filters on. `agencyId` is
 * denormalized onto each document purely so firestore.rules can let an agency
 * owner through in zero reads. So leaving a stale agencyId behind would not
 * hide data from its new owner, who still passes on membership, but it WOULD
 * leave the previous agency's owner passing the shortcut on documents they no
 * longer own. That is the thing this migrates.
 *
 * NOT DESTRUCTIVE. Nothing is deleted. Existing members keep their membership
 * rows, so anyone explicitly added to the workspace keeps access by
 * membership rather than by agency. The previous agencyId is recorded on the
 * sub-account as `migratedFromAgencyId` so this is reversible.
 *
 * Run a dry run first. It writes nothing and prints every document it would
 * touch:
 *   npx tsx scripts/migrate-subaccount-to-own-agency.mts --email <addr> --sub-account <id>
 *   npx tsx scripts/migrate-subaccount-to-own-agency.mts --email <addr> --sub-account <id> --apply
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");
const EMAIL = arg("email");
const SUB = arg("sub-account");
const AGENCY_NAME = arg("agency-name");
if (!EMAIL || !SUB) {
  console.error("usage: --email <addr> --sub-account <id> [--agency-name <name>] [--apply]");
  process.exit(2);
}

const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const { FieldValue } = await import("firebase-admin/firestore");
const auth = getAdminAuth();
const db = getAdminDb();

/** Every top-level collection whose documents carry a denormalized agencyId.
 *  Missing one leaves the old agency's owner holding a rules shortcut on it,
 *  so this list is deliberately broad: a collection with no matching docs
 *  costs one empty query. */
const AGENCY_STAMPED = [
  "contacts", "deals", "tasks", "events", "forms", "funnels", "funnelAssets",
  "workflows", "quotes", "products", "socialPosts", "broadcasts",
  "message_templates", "automations", "automation_executions", "voiceCampaigns",
  "funnelOrders", "importJobs", "emailEvents", "usage",
];

const user = await auth.getUserByEmail(EMAIL);
const subSnap = await db.doc(`subAccounts/${SUB}`).get();
if (!subSnap.exists) { console.error(`sub-account ${SUB} not found`); process.exit(1); }
const sub = subSnap.data() as Record<string, unknown>;
const oldAgencyId = String(sub.agencyId ?? "");

console.log(`user        ${EMAIL}  uid=${user.uid}`);
console.log(`claims      ${JSON.stringify(user.customClaims ?? {})}`);
console.log(`workspace   ${SUB}  "${sub.name}"  currently in agency ${oldAgencyId}`);

// Refuse the two states where this would do harm rather than good.
if ((user.customClaims as Record<string, unknown> | undefined)?.agencyRole === "owner") {
  console.error("\nREFUSED: this user already owns an agency. Moving a workspace into a second one is a different operation.");
  process.exit(1);
}
const members = await db.collection(`subAccounts/${SUB}/subAccountMembers`).get();
const isMember = members.docs.some((d) => d.id === user.uid && (d.data() as Record<string, unknown>).status === "active");
if (!isMember) {
  console.error("\nREFUSED: that user is not an active member of that workspace. Nothing here should invent access.");
  process.exit(1);
}

const agencyRef = db.collection("agencies").doc();
const agencyId = agencyRef.id;
const agencyName = AGENCY_NAME || `${user.displayName || EMAIL.split("@")[0]}'s Agency`;

// Count what moves, before moving it.
const plan: { collection: string; ids: string[] }[] = [];
for (const c of AGENCY_STAMPED) {
  const snap = await db.collection(c).where("subAccountId", "==", SUB).get();
  if (snap.size) plan.push({ collection: c, ids: snap.docs.map((d) => d.id) });
}
const total = plan.reduce((n, p) => n + p.ids.length, 0);

console.log(`\nnew agency  ${agencyId}  "${agencyName}"`);
console.log(`documents to restamp (${total}):`);
for (const p of plan) console.log(`   ${p.collection.padEnd(22)} ${p.ids.length}`);
console.log(`   ${"subAccounts/" + SUB} (the workspace doc itself)`);
console.log(`   ${members.size} membership row(s) keep their access unchanged`);

if (!APPLY) {
  console.log("\nDRY RUN. Nothing written. Re-run with --apply to perform it.");
  process.exit(0);
}

// ── apply ──────────────────────────────────────────────────────────────────
// Claims first: if a later write fails, the user holds an agency that exists
// and is empty, which is recoverable. The reverse, data pointing at an agency
// whose owner has no claim, is not.
await auth.setCustomUserClaims(user.uid, {
  ...(user.customClaims ?? {}),
  role: "admin",
  status: "active",
  agencyId,
  agencyRole: "owner",
});
console.log("\nclaims updated: agencyRole=owner");

const batch1 = db.batch();
batch1.set(agencyRef, {
  id: agencyId, name: agencyName, ownerUid: user.uid,
  stripeCustomerId: null, subscriptionStatus: "inactive", subscriptionPriceId: null,
  logoUrl: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
});
batch1.set(agencyRef.collection("agencyMembers").doc(user.uid), {
  uid: user.uid, agencyId, role: "owner", status: "active",
  email: EMAIL, displayName: user.displayName ?? null,
  addedAt: FieldValue.serverTimestamp(), addedByUid: user.uid,
});
batch1.set(db.doc(`userMemberships/${user.uid}/agencies/${agencyId}`), {
  agencyId, role: "owner", name: agencyName,
});
// Start the counter above the workspace being moved, so the next workspace
// they create cannot collide with its accountNumber.
batch1.set(db.doc(`agencies/${agencyId}/counters/subAccount`), {
  next: Math.max(1001, Number(sub.accountNumber ?? 1000) + 1),
});
batch1.update(db.doc(`subAccounts/${SUB}`), {
  agencyId,
  migratedFromAgencyId: oldAgencyId,
  migratedAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
await batch1.commit();
console.log(`agency created and workspace moved`);

// Restamp the data. Chunked well under the 500-op batch limit.
let written = 0;
for (const p of plan) {
  for (let i = 0; i < p.ids.length; i += 400) {
    const chunk = p.ids.slice(i, i + 400);
    const b = db.batch();
    for (const id of chunk) b.update(db.doc(`${p.collection}/${id}`), { agencyId });
    await b.commit();
    written += chunk.length;
  }
  console.log(`   restamped ${p.collection}: ${p.ids.length}`);
}

// Membership index rows carry agencyId too, and the switcher reads them.
const idxBatch = db.batch();
for (const m of members.docs) {
  idxBatch.update(db.doc(`subAccounts/${SUB}/subAccountMembers/${m.id}`), { agencyId });
  idxBatch.set(db.doc(`userMemberships/${m.id}/subAccounts/${SUB}`), { agencyId }, { merge: true });
}
await idxBatch.commit();
console.log(`   restamped ${members.size} membership row(s)`);

console.log(`\nDONE. ${written} document(s) restamped, workspace ${SUB} now in agency ${agencyId}.`);
console.log(`Reversible: subAccounts/${SUB}.migratedFromAgencyId = ${oldAgencyId}`);
process.exit(0);
