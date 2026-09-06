/**
 * CAMPAIGN CONTEXT PROPAGATION — the outcome assertion.
 *
 * Field presence proves nothing. The property is that an approved campaign
 * CHANGES what downstream generation produces: the same workspace, asked the
 * same thing, must inherit the campaign's CTA and audience rather than
 * inventing new ones. Both arms hit the real chat route with the real model;
 * only the persisted campaign differs.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n")){const i=l.indexOf("=");if(i>0&&!l.startsWith("#"))process.env[l.slice(0,i).trim()]??=l.slice(i+1).trim().replace(/^["']|["']$/g,"");}
const FLOW=process.env.FLOW_STAGING??"https://flow-growth-scan-staging.onrender.com";
const SA=process.env.EDIT_SA??"gXQ6oH73xtvv7LsV1sQT", OWNER="irkY5HKIzxb64l5qCyHroTrudJa2";
const svc=await import("../src/lib/server/campaigns-service.ts");
const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db=getAdminDb(); let bad=0;
const check=(l:string,ok:boolean,n="")=>{console.log(`${ok?"PASS":"FAIL"} ${l}${n?` — ${n}`:""}`);if(!ok)bad++;};
const ver=await (await fetch(`${FLOW}/api/version`)).json() as {commit?:string};
console.log(`\nCAMPAIGN INHERITANCE — staging @${ver.commit}\n${"─".repeat(68)}`);
const ct=await getAdminAuth().createCustomToken(OWNER);
const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:ct,returnSecureToken:true})});
const {idToken}=await r.json() as {idToken:string};
const login=await fetch(`${FLOW}/api/login`,{headers:{Authorization:`Bearer ${idToken}`},redirect:"manual"});
const cookie=(login.headers.getSetCookie?.()??[]).map(c=>c.split(";")[0]).join("; ");
async function ask(q:string){
  const res=await fetch(`${FLOW}/api/ai-suite/chat`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},
    body:JSON.stringify({level:"sub-account",subAccountId:SA,messages:[{role:"user",content:q}],pageContext:{route:"/create"}})});
  const d=await res.json().catch(()=>({})) as {type?:string;text?:string;error?:string;proposal?:{summary?:string;args?:Record<string,unknown>}};
  if(!res.ok||d.error) throw new Error(`MODEL_UNAVAILABLE ${res.status} ${d.error??""}`);
  return { text: d.type==="proposal"?(d.proposal?.summary??""):(d.text??""), args: d.proposal?.args ?? null };
}
// A CTA the model would never invent on its own.
const CTA="Claim my free reading-gap audit";
const AUD="Elementary school principals in rural districts";
let id="";
try {
  const Q="Write a short follow-up email for people who enquire. What call to action should it use?";
  const before=await ask(Q);
  console.log(`WITHOUT campaign:\n  ${before.text.slice(0,220).replace(/\n/g," ")}\n`);
  check("without a campaign, that CTA is not present", !before.text.includes(CTA));

  id=await svc.createCampaign({ subAccountId:SA, createdByUid:OWNER, name:"Reading-gap audit campaign",
    plan:{ planVersion:1, status:"approved",
      intent:{ businessProfileId:42, subAccountId:SA, objective:"leads", audience:AUD, offerState:"create_campaign_offer" },
      funnelStrategy:{}, formRequirements:{fields:[]}, segmentationRules:[],
      followUpStrategy:{ goalTag:"audited", goalState:"audited", handoffDays:10, messages:[] },
      crmRequirements:{}, assetSelections:[], brandProfileVersion:null,
      approved:{ centralPromise:"See exactly where your readers are falling behind", primaryCta:CTA, audience:AUD },
      steps:[{id:"page",label:"Landing page",status:"planned"}] } as never });
  console.log(`(campaign ${id} created)\n`);
  await new Promise(r=>setTimeout(r,1500));
  const after=await ask(Q);
  console.log(`WITH campaign:\n  ${after.text.slice(0,260).replace(/\n/g," ")}\n`);
  check("the approved CTA is inherited", after.text.includes(CTA) || /reading-gap audit/i.test(after.text),
    after.text.includes(CTA)?"verbatim":"referenced");
  check("the answers differ materially", before.text.trim()!==after.text.trim());
  check("the campaign audience reaches generation",
    /principal|rural|district/i.test(after.text), "audience terms present");
} catch(err){
  if(String(err).includes("MODEL_UNAVAILABLE")){
    console.log(`\nCAMPAIGN INHERITANCE: UNAVAILABLE — ${String(err).slice(0,90)}`);
    if(id) await db.doc(`campaigns/${id}`).delete();
    process.exit(2);
  }
  throw err;
} finally { if(id) await db.doc(`campaigns/${id}`).delete().catch(()=>{}); }
console.log(`${bad===0?"CAMPAIGN INHERITANCE: PASS":`CAMPAIGN INHERITANCE: ${bad} FAILURE(S)`}`);
process.exit(bad?1:0);
