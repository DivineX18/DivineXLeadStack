import { ask, show, db, SA } from "./zeno-live-e2e.mts";

const TEMP_UID = "zeno-e2e-test-delete-uid";
const mRef = db.doc(`subAccounts/${SA}/subAccountMembers/${TEMP_UID}`);
const iRef = db.doc(`userMemberships/${TEMP_UID}/subAccounts/${SA}`);
const snap = async () => { const s = await mRef.get(); return s.exists ? s.data()! : null; };

try {
  await mRef.set({ uid: TEMP_UID, email: "zeno-e2e-test-delete@example.com",
    displayName: "ZENO E2E TEST - DELETE member", role: "collaborator", status: "active",
    subAccountId: SA, createdAt: new Date(), updatedAt: new Date() });
  await iRef.set({ subAccountId: SA, role: "collaborator", status: "active", updatedAt: new Date() });

  const before = (await snap())!;
  console.log(`\n=== MEMBER ${TEMP_UID}\nBEFORE role=${before.role} status=${before.status} email=${before.email}`);
  show("member: promote the temporary test member",
    await ask([`Make zeno-e2e-test-delete@example.com an admin of this workspace.`, "Yes, go ahead."], { autoConfirm: true }));
  const after = (await snap())!;
  console.log(`AFTER  role=${after.role} status=${after.status}`);
  console.log(`    role changed: ${before.role !== after.role} (${before.role} -> ${after.role})`);
  for (const k of ["uid","email","displayName","status","subAccountId"]) {
    console.log(`    ${k.padEnd(13)} ${JSON.stringify(before[k]) === JSON.stringify(after[k]) ? "preserved" : "CHANGED"}`);
  }
  const idx = (await iRef.get()).data();
  console.log(`    membership index kept in step: ${idx?.role === after.role} (index role=${idx?.role})`);

  // Refusal: the caller cannot demote themselves out of their own workspace.
  const ownerBefore = (await db.doc(`subAccounts/${SA}/subAccountMembers/irkY5HKIzxb64l5qCyHroTrudJa2`).get()).data()!;
  show("member: refusal, demoting yourself",
    await ask([`Change my own role to collaborator.`, "Yes, go ahead."], { autoConfirm: true }));
  const ownerAfter = (await db.doc(`subAccounts/${SA}/subAccountMembers/irkY5HKIzxb64l5qCyHroTrudJa2`).get()).data()!;
  console.log(`    caller's own role untouched: ${ownerBefore.role === ownerAfter.role} (${ownerAfter.role})`);

  // Refusal: an invented role must not be written.
  show("member: refusal, a role that does not exist",
    await ask([`Make zeno-e2e-test-delete@example.com a superadmin.`, "Yes, go ahead."], { autoConfirm: true }));
  const afterBogus = (await snap())!;
  console.log(`    role still a real one: ${["admin","collaborator"].includes(String(afterBogus.role))} (${afterBogus.role})`);
} finally {
  await mRef.delete().catch(()=>{});
  await iRef.delete().catch(()=>{});
  console.log(`\ncleaned up the temporary member: ${!(await mRef.get()).exists}`);
}
