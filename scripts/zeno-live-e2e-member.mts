/**
 * The exact conversation a human ran, replayed through the real chain.
 * QA CRM Test is changed and then put back; hello@divinex.io is never touched.
 */
import { ask, show, db, SA } from "./zeno-live-e2e.mts";

const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
const members = async () => {
  const snap = await db.collection(`subAccounts/${SA}/subAccountMembers`).get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
};
const qaUid = Object.entries(await members()).find(([, v]) =>
  String((v as { email?: string }).email ?? "").startsWith("qa"))![0];
const idx = (uid: string) => db.doc(`userMemberships/${uid}/subAccounts/${SA}`).get().then((s) => s.data()?.role);

const before = await members();
console.log(`BEFORE  QA=${before[qaUid].role}  hello=${before[OWNER].role}  (index QA=${await idx(qaUid)})`);

show("1. who are the members?", await ask("Who are the members of this workspace?"));

show("2. the original failing request, in a fresh conversation",
  await ask(["Change Renz member to collaborator.", "do the QA CRM test to collaborator"], { autoConfirm: true }));

let after = await members();
console.log(`AFTER   QA=${after[qaUid].role}  hello=${after[OWNER].role}  (index QA=${await idx(qaUid)})`);
console.log(`    QA changed to collaborator: ${after[qaUid].role === "collaborator"}`);
console.log(`    hello untouched: ${before[OWNER].role === after[OWNER].role} (${after[OWNER].role})`);
console.log(`    membership index in step: ${(await idx(qaUid)) === after[qaUid].role}`);
for (const k of ["uid", "email", "displayName", "status", "subAccountId"]) {
  console.log(`    QA ${k.padEnd(13)} ${JSON.stringify(before[qaUid][k]) === JSON.stringify(after[qaUid][k]) ? "preserved" : "CHANGED"}`);
}

show("3. re-read the members", await ask("List the members again."));

show("4. restore QA CRM Test to admin",
  await ask(["Make QA CRM Test an admin again.", "Yes, go ahead."], { autoConfirm: true }));
after = await members();
console.log(`RESTORED QA=${after[qaUid].role} (index ${await idx(qaUid)})`);
console.log(`    restored to the original role: ${after[qaUid].role === before[qaUid].role}`);
console.log(`    hello still untouched: ${after[OWNER].role === before[OWNER].role}`);

console.log("\n--- the refusal paths ---");
show("5. a person who is not here", await ask("Change Renz to collaborator.", { autoConfirm: true }));
show("6. self-demotion", await ask(["Change my own role to collaborator.", "Yes, go ahead."], { autoConfirm: true }));
const selfCheck = await members();
console.log(`    hello is still admin: ${selfCheck[OWNER].role === "admin"}`);
show("7. an invented role", await ask(["Make QA CRM Test a superadmin.", "Yes, go ahead."], { autoConfirm: true }));
const bogus = await members();
console.log(`    QA role is still a real one: ${["admin","collaborator"].includes(String(bogus[qaUid].role))} (${bogus[qaUid].role})`);
console.log(`\nFINAL   QA=${bogus[qaUid].role}  hello=${bogus[OWNER].role}`);
