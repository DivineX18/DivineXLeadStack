/**
 * ZENO EDIT LOOP — customer intent to a changed page, end to end.
 *
 *   select a section -> ask Zeno -> proposal shows the real new text
 *   -> human confirms -> the page changes -> plan fields survive
 *
 * This is the loop that unit tests missed: revise_funnel_copy passed in
 * isolation while the real path failed, because the model had no way to learn
 * the ids it was told to use.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n")){const i=l.indexOf("=");if(i>0&&!l.startsWith("#"))process.env[l.slice(0,i).trim()]??=l.slice(i+1).trim().replace(/^["']|["']$/g,"");}
const FLOW=process.env.FLOW_STAGING??"https://flow-growth-scan-staging.onrender.com";
const SA=process.env.EDIT_SA??"gXQ6oH73xtvv7LsV1sQT", OWNER="irkY5HKIzxb64l5qCyHroTrudJa2";
const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db=getAdminDb(); let bad=0;
const check=(l:string,ok:boolean,n="")=>{console.log(`${ok?"PASS":"FAIL"} ${l}${n?` — ${n}`:""}`);if(!ok)bad++;};
const ver=await (await fetch(`${FLOW}/api/version`)).json() as {commit?:string};
console.log(`\nZENO EDIT LOOP — staging @${ver.commit}\n${"─".repeat(68)}`);
const snap=await db.collection("funnels").where("subAccountId","==",SA).limit(20).get();
const f=snap.docs.map(d=>({id:d.id,...(d.data() as Record<string,unknown>)})).find(x=>((x.sections??[]) as unknown[]).length>=5);
if(!f){console.log("no funnel");process.exit(1);}
const secs=f.sections as {id:string;type:string;config:Record<string,unknown>;argumentRole?:string;canvas?:string}[];
const hero=secs.find(s=>s.type==="hero")??secs[0];
const before=String(hero.config.headline??"");
const ct=await getAdminAuth().createCustomToken(OWNER);
const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:ct,returnSecureToken:true})});
const {idToken}=await r.json() as {idToken:string};
const login=await fetch(`${FLOW}/api/login`,{headers:{Authorization:`Bearer ${idToken}`},redirect:"manual"});
const cookie=(login.headers.getSetCookie?.()??[]).map(c=>c.split(";")[0]).join("; ");
console.log(`BEFORE: "${before}"\n`);
const chat=await fetch(`${FLOW}/api/ai-suite/chat`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},
 body:JSON.stringify({level:"sub-account",subAccountId:SA,
  messages:[{role:"user",content:"Make this headline more specific about the outcome for the school."}],
  pageContext:{route:`/create/funnel/${f.id}`,artifactRef:{kind:"funnel",id:f.id,sectionId:hero.id}}})});
const c=await chat.json() as {type?:string;text?:string;proposal?:{capability?:string;args?:Record<string,unknown>;summary?:string}};
check("Zeno proposes an edit to the real page", c.type==="proposal"&&c.proposal?.capability==="revise_funnel_copy",
  `type=${c.type} cap=${c.proposal?.capability} ${(c.text??"").slice(0,90)}`);
if(c.proposal?.capability!=="revise_funnel_copy"){process.exit(1);}
check("it targets the funnel and section the customer selected",
  c.proposal.args?.funnelId===f.id && c.proposal.args?.sectionId===hero.id,
  `funnel=${c.proposal.args?.funnelId===f.id} section=${c.proposal.args?.sectionId===hero.id}`);
const summary=c.proposal.summary??"";
console.log(`PROPOSAL: ${summary.slice(0,220)}\n`);
check("the confirm card shows the real replacement text", summary.length>60 && /headline/i.test(summary));
check("Zeno does not speak internal ids to the customer", !summary.includes(f.id) && !summary.includes(hero.id));
const conf=await fetch(`${FLOW}/api/ai-suite/confirm`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},
 body:JSON.stringify({level:"sub-account",subAccountId:SA,capability:"revise_funnel_copy",args:c.proposal.args})});
check("the human's confirmation applies it", conf.ok, conf.ok?"":`${conf.status} ${(await conf.text()).slice(0,140)}`);
const after=((await db.doc(`funnels/${f.id}`).get()).data() as {sections:typeof secs}).sections;
const h2=after.find(s=>s.id===hero.id)!;
console.log(`AFTER:  "${String(h2.config.headline)}"\n`);
check("the page actually changed", String(h2.config.headline)!==before);
check("section count unchanged", after.length===secs.length);
check("argumentRole preserved", after.filter(s=>s.argumentRole).length===secs.filter(s=>s.argumentRole).length);
check("canvas preserved", after.filter(s=>s.canvas).length===secs.filter(s=>s.canvas).length);
const others=Object.keys(hero.config).filter(k=>k!=="headline");
check("other copy on that section untouched",
  others.every(k=>JSON.stringify(h2.config[k])===JSON.stringify(hero.config[k])));
const restored=after.map(s=>s.id===hero.id?{...s,config:{...s.config,headline:before}}:s);
await fetch(`${FLOW}/api/sub-accounts/${SA}/funnels/${f.id}`,{method:"PATCH",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({sections:restored})});
console.log(`${bad===0?"ZENO EDIT LOOP: PASS":`ZENO EDIT LOOP: ${bad} FAILURE(S)`}`);
process.exit(bad?1:0);
