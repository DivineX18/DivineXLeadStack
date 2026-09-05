/**
 * CONTEXTUAL ZENO IN THE EDITOR — behavioral.
 *
 * The property that matters is not "a chat panel exists". It is that Zeno
 * reasons about the customer's ACTUAL current draft and respects the selected
 * section's scope. Both are asserted against a real model reply, and the
 * negative direction is checked too: a foreign funnel id must resolve to
 * nothing rather than leaking another workspace's page.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n")){const i=l.indexOf("=");if(i>0&&!l.startsWith("#"))process.env[l.slice(0,i).trim()]??=l.slice(i+1).trim().replace(/^["']|["']$/g,"");}
const FLOW=process.env.FLOW_STAGING??"https://flow-growth-scan-staging.onrender.com";
const SA=process.env.EDIT_SA??"gXQ6oH73xtvv7LsV1sQT", OWNER="irkY5HKIzxb64l5qCyHroTrudJa2";
const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db=getAdminDb(); let bad=0;
const check=(l:string,ok:boolean,n="")=>{console.log(`${ok?"PASS":"FAIL"} ${l}${n?` — ${n}`:""}`);if(!ok)bad++;};
const ver=await (await fetch(`${FLOW}/api/version`)).json() as {commit?:string};
console.log(`\nEDITOR ZENO — staging @${ver.commit}\n${"─".repeat(68)}`);

const snap=await db.collection("funnels").where("subAccountId","==",SA).limit(20).get();
const f=snap.docs.map(d=>({id:d.id,...(d.data() as Record<string,unknown>)}))
  .find(x=>((x.sections??[]) as unknown[]).length>=5);
if(!f){console.log("no suitable funnel");process.exit(1);}
const secs=f.sections as {id:string;type:string;config:Record<string,unknown>}[];
const target=secs.find(s=>s.type==="faq")??secs[2];
console.log(`funnel=${f.id} sections=${secs.map(s=>s.type).join(" > ")}`);
console.log(`selected=${target.type} (${target.id})\n`);

const ct=await getAdminAuth().createCustomToken(OWNER);
const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:ct,returnSecureToken:true})});
const {idToken}=await r.json() as {idToken:string};
const login=await fetch(`${FLOW}/api/login`,{headers:{Authorization:`Bearer ${idToken}`},redirect:"manual"});
const cookie=(login.headers.getSetCookie?.()??[]).map(c=>c.split(";")[0]).join("; ");

async function ask(prompt:string, artifactRef?:Record<string,unknown>){
  const res=await fetch(`${FLOW}/api/ai-suite/chat`,{method:"POST",
    headers:{"Content-Type":"application/json",Cookie:cookie},
    body:JSON.stringify({level:"sub-account",subAccountId:SA,
      messages:[{role:"user",content:prompt}],
      pageContext:{route:`/create/funnel/${f.id}`,...(artifactRef?{artifactRef}:{})}})});
  const d=await res.json().catch(()=>({})) as {type?:string;text?:string;proposal?:{summary?:string}};
  return d.type==="proposal"?(d.proposal?.summary??""):(d.text??"");
}

// PAGE SCOPE: does Zeno know what is actually on the page?
const pageAnswer=await ask("What sections does my page have right now, in order? Just list them.",
  {kind:"funnel",id:f.id});
console.log(`PAGE:\n  ${pageAnswer.slice(0,400).replace(/\n/g," ")}\n`);
const typesSeen=secs.filter(s=>new RegExp(s.type.replace("_","[ _-]?"),"i").test(pageAnswer)).length;
check("Zeno sees the ACTUAL current draft", typesSeen>=3, `${typesSeen}/${secs.length} section types recognised`);

// SECTION SCOPE: does selection constrain the change?
const secAnswer=await ask("Improve this.", {kind:"funnel",id:f.id,sectionId:target.id});
console.log(`SECTION (${target.type} selected):\n  ${secAnswer.slice(0,320).replace(/\n/g," ")}\n`);
check("selection scopes Zeno to that section",
  new RegExp(target.type.replace("_","[ _-]?"),"i").test(secAnswer) || /that section|this section|selected/i.test(secAnswer),
  `mentions ${target.type} or scope`);

// NEGATIVE: a foreign funnel must resolve to nothing.
const foreign=await db.collection("funnels").where("subAccountId","==","dx-loop-test").limit(1).get();
if(!foreign.empty){
  const other=foreign.docs[0];
  const otherName=String((other.data() as {name?:string}).name??"");
  const leak=await ask("What sections does my page have right now?",{kind:"funnel",id:other.id});
  check("a foreign funnel id leaks nothing",
    !otherName || !leak.toLowerCase().includes(otherName.toLowerCase().slice(0,18)),
    `foreign funnel "${otherName.slice(0,30)}" not disclosed`);
}
console.log(`\n${bad===0?"EDITOR ZENO: PASS":`EDITOR ZENO: ${bad} FAILURE(S)`}`);
process.exit(bad?1:0);
