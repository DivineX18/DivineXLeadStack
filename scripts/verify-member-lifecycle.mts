/**
 * The whole member lifecycle, through the REAL HTTP routes: add, remove,
 * re-add, reactivate, repeat.
 *
 * Covers the two ways an account ends up disabled, which look identical but
 * are not:
 *   - removed through the app, which carries our own marker, so a later invite
 *     reactivates it automatically; and
 *   - disabled some other way (a console action, or our own removal failing
 *     between its two writes), which the invite path refuses, and an AGENCY
 *     OWNER clears with the in-app reactivate route.
 *
 * Neither path ever sends anyone to another platform.
 *
 * INTEGRATION test: creates a throwaway Firebase user and removes it
 * afterwards. Needs live Firebase admin credentials and a running target.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-member-lifecycle.mts [baseUrl]
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync("/Users/boss/DivineXLeadStack/.env.local","utf8").split("\n")) {
  const i=l.indexOf("="); if(i>0&&!l.startsWith("#")) process.env[l.slice(0,i).trim()] ??= l.slice(i+1).trim().replace(/^["']|["']$/g,"");
}
const BASE=process.argv[2] ?? "https://flow-growth-scan-staging.onrender.com";
const SA="MEYB8CbWlE5fxAn3TJOp", OWNER="irkY5HKIzxb64l5qCyHroTrudJa2";
const { getAdminAuth, getAdminDb } = await import("@/lib/firebase/admin");
const auth=getAdminAuth(), db=getAdminDb();
let pass=0; const fails:string[]=[];
const ck=(n:string,ok:boolean,d="")=>{ if(ok){pass++;console.log(`  ok   ${n}`);} else {fails.push(n);console.log(`  FAIL ${n}${d?` | ${d}`:""}`);} };

const ct=await auth.createCustomToken(OWNER);
const { idToken } = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:ct,returnSecureToken:true})})).json() as {idToken:string};
const lg=await fetch(`${BASE}/api/login`,{headers:{Authorization:`Bearer ${idToken}`},redirect:"manual"});
const Cookie=(lg.headers.getSetCookie?.()??[]).map(c=>c.split(";")[0]).join("; ");

const email=`zz-invite-${Date.now()%1e7}@example.invalid`;
const user=await auth.createUser({ email, password:`Aa1!${Math.random().toString(36).slice(2)}`, displayName:"ZZ Invite Smoke" });
console.log(`${BASE}\ntest user ${user.uid}\n`);

const invite=()=>fetch(`${BASE}/api/sub-accounts/${SA}/invite`,{method:"POST",headers:{"Content-Type":"application/json",Cookie},body:JSON.stringify({email,role:"collaborator"})});
const removeMember=()=>fetch(`${BASE}/api/sub-accounts/${SA}/members/${user.uid}`,{method:"DELETE",headers:{Cookie}});

try {
  console.log("1. ADD THROUGH THE REAL ROUTE");
  { const r=await invite(); ck("invite succeeds", r.ok, String(r.status));
    ck("membership is active", (await db.doc(`subAccounts/${SA}/subAccountMembers/${user.uid}`).get()).data()?.status==="active"); }

  console.log("\n2. REMOVE THROUGH THE REAL ROUTE");
  { const r=await removeMember(); const d=await r.json() as {globallyRemoved?:boolean};
    ck("remove succeeds", r.ok, String(r.status));
    ck("it reports a global removal", d.globallyRemoved===true, JSON.stringify(d));
    ck("the auth account is disabled, as reported", (await auth.getUser(user.uid)).disabled===true); }

  console.log("\n3. RE-ADD — THE CASE THAT FAILED FOR YOU");
  { const r=await invite(); const body=await r.text();
    ck("re-invite succeeds instead of refusing", r.ok, `${r.status} ${body.slice(0,120)}`);
    const u=await auth.getUser(user.uid);
    ck("the account is re-enabled", u.disabled===false);
    ck("claims are active again", (u.customClaims as {status?:string})?.status==="active");
    ck("the users profile is active", (await db.doc(`users/${user.uid}`).get()).data()?.status==="active");
    ck("the membership is active", (await db.doc(`subAccounts/${SA}/subAccountMembers/${user.uid}`).get()).data()?.status==="active");
    ck("the switcher index is back", (await db.doc(`userMemberships/${user.uid}/subAccounts/${SA}`).get()).exists); }

  console.log("\n4. OUT-OF-BAND DISABLE -> OWNER REACTIVATES IN-APP");
  { // disabled WITHOUT our removal marker: the case the invite path refuses
    const c=(await auth.getUser(user.uid)).customClaims ?? {};
    await auth.setCustomUserClaims(user.uid,{...c,status:"active"});
    await auth.updateUser(user.uid,{disabled:true});

    const refused=await invite();
    const rb=await refused.json() as {code?:string;uid?:string;error?:string};
    ck("invite refuses an out-of-band disable", refused.status===409, String(refused.status));
    ck("and returns a machine-readable code", rb.code==="account_disabled", JSON.stringify(rb));
    ck("and names who to reactivate", rb.uid===user.uid);
    ck("the message no longer sends anyone to Firebase", !/Firebase/i.test(rb.error ?? ""), rb.error);

    const re=await fetch(`${BASE}/api/sub-accounts/${SA}/members/${user.uid}/reactivate`,{method:"POST",headers:{Cookie}});
    ck("the owner can reactivate in-app", re.ok, String(re.status));
    ck("the account is enabled again", (await auth.getUser(user.uid)).disabled===false);

    const after=await invite();
    ck("and the invite then succeeds", after.ok, String(after.status));

    const again=await fetch(`${BASE}/api/sub-accounts/${SA}/members/${user.uid}/reactivate`,{method:"POST",headers:{Cookie}});
    const ab=await again.json() as {alreadyActive?:boolean};
    ck("reactivating an active account is idempotent", again.ok && ab.alreadyActive===true, JSON.stringify(ab));

    // redirect:"manual" matters — following the auth redirect lands on the
    // login page, whose 200 would read as the route having allowed the call.
    const anon=await fetch(`${BASE}/api/sub-accounts/${SA}/members/${user.uid}/reactivate`,{method:"POST",redirect:"manual"});
    ck("an unauthenticated caller never reaches the route", anon.status===307 || anon.status===401 || anon.status===403, String(anon.status)); }

  console.log("\n5. AND AGAIN, TO PROVE IT IS REPEATABLE");
  { await removeMember();
    const r=await invite();
    ck("remove/add cycles repeatedly", r.ok, String(r.status));
    ck("account enabled after the second cycle", (await auth.getUser(user.uid)).disabled===false); }
} finally {
  console.log("\n6. CLEANUP");
  await db.doc(`subAccounts/${SA}/subAccountMembers/${user.uid}`).delete().catch(()=>{});
  await db.doc(`userMemberships/${user.uid}/subAccounts/${SA}`).delete().catch(()=>{});
  await db.doc(`users/${user.uid}`).delete().catch(()=>{});
  for (const d of (await db.collection("invites").where("email","==",email).get()).docs) await d.ref.delete();
  await auth.deleteUser(user.uid).catch(()=>{});
  console.log("  test user, membership and invites removed");
}
console.log(`\n${pass} passed, ${fails.length} failed`);
for(const f of fails) console.log(`  - ${f}`);
console.log(fails.length?"SMOKE: FAILED":"SMOKE: ALL PASS");
process.exit(fails.length?1:0);
