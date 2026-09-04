/**
 * The composed plan must survive a human edit.
 *
 * argumentRole/servesBelief are how the Sales Argument Plan is structurally
 * consumed; canvas is the art-direction surface behind the page's story-fold
 * rhythm. The save sanitizer dropped all three, so the FIRST edit silently
 * reduced a fully-composed page to bare sections — invisible in the UI and
 * only detectable by reading the stored doc.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n")){const i=l.indexOf("=");if(i>0&&!l.startsWith("#"))process.env[l.slice(0,i).trim()]??=l.slice(i+1).trim().replace(/^["']|["']$/g,"");}
const FLOW=process.env.FLOW_STAGING??"https://flow-growth-scan-staging.onrender.com";
const SA=process.env.EDIT_SA??"gXQ6oH73xtvv7LsV1sQT", OWNER="irkY5HKIzxb64l5qCyHroTrudJa2";
const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db=getAdminDb(); let bad=0;
const check=(l:string,ok:boolean,n="")=>{console.log(`${ok?"PASS":"FAIL"} ${l}${n?` — ${n}`:""}`);if(!ok)bad++;};
const ver=await (await fetch(`${FLOW}/api/version`)).json() as {commit?:string};
console.log(`\nPLAN SURVIVES EDIT — staging @${ver.commit}\n${"─".repeat(66)}`);
const snap=await db.collection("funnels").where("subAccountId","==",SA).limit(20).get();
const f=snap.docs.map(d=>({id:d.id,...(d.data() as Record<string,unknown>)}))
  .find(x=>((x.sections??[]) as {argumentRole?:string}[]).some(s=>s.argumentRole));
if(!f){console.log("no funnel with a composed plan to test");process.exit(1);}
const before=(f.sections as {argumentRole?:string;servesBelief?:string;canvas?:string}[]);
const beforeRoles=before.filter(s=>s.argumentRole).length, beforeCanvas=before.filter(s=>s.canvas).length;
console.log(`funnel=${f.id} argumentRole=${beforeRoles}/${before.length} canvas=${beforeCanvas}/${before.length}\n`);
const ct=await getAdminAuth().createCustomToken(OWNER);
const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:ct,returnSecureToken:true})});
const {idToken}=await r.json() as {idToken:string};
const login=await fetch(`${FLOW}/api/login`,{headers:{Authorization:`Bearer ${idToken}`},redirect:"manual"});
const cookie=(login.headers.getSetCookie?.()??[]).map(c=>c.split(";")[0]).join("; ");
// A realistic builder save: edit copy, send the sections back.
const sections=JSON.parse(JSON.stringify(f.sections)) as {config:Record<string,unknown>}[];
const orig=sections[0].config.headline;
sections[0].config.headline=`${String(orig)} `.trim();
const save=await fetch(`${FLOW}/api/sub-accounts/${SA}/funnels/${f.id}`,{method:"PATCH",
  headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({sections})});
check("save succeeds",save.ok,save.ok?"":String(save.status));
const after=((await db.doc(`funnels/${f.id}`).get()).data() as {sections:{argumentRole?:string;servesBelief?:string;canvas?:string}[]}).sections;
const afterRoles=after.filter(s=>s.argumentRole).length, afterCanvas=after.filter(s=>s.canvas).length;
check("argumentRole survives the edit",afterRoles===beforeRoles,`${beforeRoles} -> ${afterRoles}`);
check("servesBelief survives the edit",
  after.filter(s=>s.servesBelief).length===before.filter(s=>s.servesBelief).length,
  `${before.filter(s=>s.servesBelief).length} -> ${after.filter(s=>s.servesBelief).length}`);
check("canvas (art-direction rhythm) survives the edit",afterCanvas===beforeCanvas,`${beforeCanvas} -> ${afterCanvas}`);
sections[0].config.headline=orig;
await fetch(`${FLOW}/api/sub-accounts/${SA}/funnels/${f.id}`,{method:"PATCH",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({sections})});
console.log(`\n${bad===0?"PLAN SURVIVES EDIT: PASS":`PLAN SURVIVES EDIT: ${bad} FAILURE(S)`}`);
process.exit(bad?1:0);
