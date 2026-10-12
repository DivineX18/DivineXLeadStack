/**
 * Remove a member, then invite them back.
 *
 * The reported bug: removing a member's LAST membership disables their auth
 * account, and re-inviting them was refused with "Reactivate it before adding
 * them to a workspace" — while NOTHING in this codebase could reactivate it.
 * No code path anywhere set `disabled: false`, so the only escape was the
 * Firebase console. A one-way door.
 *
 * INTEGRATION test: it creates a throwaway Firebase user, drives the real
 * invite entry point, and deletes everything afterwards. It therefore needs
 * live Firebase admin credentials in .env.local and is not part of the pure
 * verifier suite.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-member-reactivation.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync("/Users/boss/DivineXLeadStack/.env.local","utf8").split("\n")) {
  const i=l.indexOf("="); if(i>0&&!l.startsWith("#")) process.env[l.slice(0,i).trim()] ??= l.slice(i+1).trim().replace(/^["']|["']$/g,"");
}
const AG="U5SBAHsB0nZ7ce552H9h", SA="MEYB8CbWlE5fxAn3TJOp", OWNER="irkY5HKIzxb64l5qCyHroTrudJa2";
const { getAdminAuth, getAdminDb } = await import("@/lib/firebase/admin");
const svc = await import("@/lib/server/members-service.ts");
const auth=getAdminAuth(), db=getAdminDb();
let pass=0; const fails:string[]=[];
const ck=(n:string,ok:boolean,d="")=>{ if(ok){pass++;console.log(`  ok   ${n}`);} else {fails.push(n);console.log(`  FAIL ${n}${d?` | ${d}`:""}`);} };

const email=`zz-reactivate-${Date.now()%1e7}@example.invalid`;
const user=await auth.createUser({ email, password:`Aa1!${Math.random().toString(36).slice(2)}`, displayName:"ZZ Reactivate Test" });
console.log(`test user ${user.uid} (${email})\n`);

// The real entry point the Send-invite button uses.
const add=async()=>svc.createInviteServerSide({
  subAccountId: SA, invitedByUid: OWNER, email, role: "collaborator",
} as never);

try {
  console.log("1. ADD, then SIMULATE THE REMOVAL THAT CAUSED THE BUG");
  await add();
  ck("first add succeeds", (await db.doc(`subAccounts/${SA}/subAccountMembers/${user.uid}`).get()).exists);

  // exactly what the members DELETE route does on a last-membership removal
  await db.doc(`subAccounts/${SA}/subAccountMembers/${user.uid}`).set({status:"removed"},{merge:true});
  await db.doc(`userMemberships/${user.uid}/subAccounts/${SA}`).delete().catch(()=>{});
  await db.doc(`users/${user.uid}`).set({status:"removed"},{merge:true});
  const c=(await auth.getUser(user.uid)).customClaims ?? {};
  await auth.setCustomUserClaims(user.uid,{...c,status:"removed"});
  await auth.updateUser(user.uid,{disabled:true});
  ck("the account is now disabled, as after a real removal", (await auth.getUser(user.uid)).disabled);

  console.log("\n2. RE-ADD (this is what failed for you)");
  let threw: string | null = null;
  try { await add(); } catch (e) { threw = (e as Error).message; }
  ck("re-adding no longer refuses", threw === null, threw ?? "");

  const after=await auth.getUser(user.uid);
  ck("the auth account is re-enabled", after.disabled === false);
  ck("claims say active again", (after.customClaims as {status?:string})?.status === "active");
  ck("claims keep the agency", (after.customClaims as {agencyId?:string})?.agencyId === AG);
  ck("the users profile says active", (await db.doc(`users/${user.uid}`).get()).data()?.status === "active");
  const mem=(await db.doc(`subAccounts/${SA}/subAccountMembers/${user.uid}`).get()).data();
  ck("the membership is active again", mem?.status === "active");
  ck("the switcher index is restored", (await db.doc(`userMemberships/${user.uid}/subAccounts/${SA}`).get()).exists);

  console.log("\n3. AN OUT-OF-BAND DISABLE IS STILL REFUSED");
  // disabled, but WITHOUT our "removed" marker: a console action we must not undo
  const c2=(await auth.getUser(user.uid)).customClaims ?? {};
  await auth.setCustomUserClaims(user.uid,{...c2,status:"active"});
  await auth.updateUser(user.uid,{disabled:true});
  let threw2: string | null = null;
  try { await add(); } catch (e) { threw2 = (e as Error).message; }
  ck("still refuses an account disabled outside the app", threw2 !== null);
  ck("and says where to re-enable it", /Firebase Authentication/.test(threw2 ?? ""), threw2 ?? "");
  ck("and did NOT silently re-enable it", (await auth.getUser(user.uid)).disabled === true);
} finally {
  console.log("\n4. CLEANUP");
  await db.doc(`subAccounts/${SA}/subAccountMembers/${user.uid}`).delete().catch(()=>{});
  await db.doc(`userMemberships/${user.uid}/subAccounts/${SA}`).delete().catch(()=>{});
  await db.doc(`users/${user.uid}`).delete().catch(()=>{});
  await auth.deleteUser(user.uid).catch(()=>{});
  console.log("  test user and records removed");
}
console.log(`\n${pass} passed, ${fails.length} failed`);
for(const f of fails) console.log(`  - ${f}`);
console.log(fails.length?"FAILED":"ALL PASS");
process.exit(fails.length?1:0);
