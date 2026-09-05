/**
 * revise_funnel_copy — the edit path Zeno lacked.
 *
 * Certifies the properties that protect the customer's work: only named copy
 * fields change, the composed plan survives, non-copy fields (price, form
 * wiring) are unreachable, and the confirm card shows the real replacement
 * text so approval is meaningful rather than a rubber stamp.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n")){const i=l.indexOf("=");if(i>0&&!l.startsWith("#"))process.env[l.slice(0,i).trim()]??=l.slice(i+1).trim().replace(/^["']|["']$/g,"");}
const SA=process.env.EDIT_SA??"gXQ6oH73xtvv7LsV1sQT";
const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db=getAdminDb(); let bad=0;
const check=(l:string,ok:boolean,n="")=>{console.log(`${ok?"PASS":"FAIL"} ${l}${n?` — ${n}`:""}`);if(!ok)bad++;};
const cap=getCapability("revise_funnel_copy")!;
check("capability is registered", !!cap);

// Validation: allowlist + real text required.
check("rejects a call with no funnel/section", !cap.validate({ fields:{headline:"x"} }).ok);
const noFields=cap.validate({ funnel_id:"a", section_id:"b", fields:{} });
check("rejects an empty change", !noFields.ok, noFields.ok?"":String(noFields.error).slice(0,60));
const blocked=cap.validate({ funnel_id:"a", section_id:"b", fields:{ priceCents:"1", formId:"x", stripePriceId:"y" } });
check("money/wiring fields are unreachable", !blocked.ok, "priceCents/formId/stripePriceId all filtered");
const good=cap.validate({ funnel_id:"a", section_id:"b", fields:{ headline:"A clearer headline", priceCents:"999" }, why:"clarity" });
check("valid copy passes and strips the rest",
  good.ok && Object.keys((good as {args:{fields:Record<string,string>}}).args.fields).join()==="headline");
check("confirm card shows the REAL new text",
  good.ok && cap.summarize((good as {args:Record<string,unknown>}).args).includes("A clearer headline"));

// Live: only the named field changes; plan fields survive.
const snap=await db.collection("funnels").where("subAccountId","==",SA).limit(20).get();
const f=snap.docs.map(d=>({id:d.id,...(d.data() as Record<string,unknown>)}))
  .find(x=>((x.sections??[]) as {argumentRole?:string}[]).some(s=>s.argumentRole));
if(!f){console.log("no funnel with a plan");process.exit(bad?1:0);}
const secs=f.sections as {id:string;type:string;config:Record<string,unknown>;argumentRole?:string;canvas?:string}[];
const target=secs.find(s=>typeof s.config.headline==="string")??secs[0];
const before={...target.config};
const marker=`Revised ${Date.now()}`;
const ctx={uid:"irkY5HKIzxb64l5qCyHroTrudJa2",email:"hello@divinex.io",displayName:"",agencyId:String(f.agencyId??""),subAccountId:SA,subAccountRole:"admin"};
await cap.execute(ctx as never, { funnelId:f.id, sectionId:target.id, fields:{ headline:marker }, why:"test" });
const after=((await db.doc(`funnels/${f.id}`).get()).data() as {sections:typeof secs}).sections;
const t2=after.find(s=>s.id===target.id)!;
check("the named field changed", t2.config.headline===marker);
check("other config keys untouched",
  Object.keys(before).filter(k=>k!=="headline").every(k=>JSON.stringify(t2.config[k])===JSON.stringify(before[k])));
check("argumentRole survives", after.filter(s=>s.argumentRole).length===secs.filter(s=>s.argumentRole).length);
check("canvas survives", after.filter(s=>s.canvas).length===secs.filter(s=>s.canvas).length);
check("section count unchanged", after.length===secs.length);
// restore
await cap.execute(ctx as never, { funnelId:f.id, sectionId:target.id, fields:{ headline:String(before.headline??"") }, why:"restore" });
console.log(`\n${bad===0?"REVISE FUNNEL COPY: PASS":`REVISE FUNNEL COPY: ${bad} FAILURE(S)`}`);
process.exit(bad?1:0);
