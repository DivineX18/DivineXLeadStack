/** Rendered certification of R1 (intelligence) + R3 (Recommendation -> Fix with
 *  Zeno) against STAGING. Needs no local Firestore: createCustomToken signs
 *  locally and staging reads its own data. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n")){const i=l.indexOf("=");if(i>0&&!l.startsWith("#"))process.env[l.slice(0,i).trim()]??=l.slice(i+1).trim().replace(/^["']|["']$/g,"");}
const BASE="https://flow-growth-scan-staging.onrender.com", OWNER="irkY5HKIzxb64l5qCyHroTrudJa2", SA="MEYB8CbWlE5fxAn3TJOp";
let bad=0, na=0;
const check=(l:string,ok:boolean,n="")=>{console.log(`${ok?"PASS":"FAIL"} ${l}${n?` — ${n}`:""}`);if(!ok)bad++;};
const unavail=(l:string,w:string)=>{console.log(`UNAVAILABLE ${l} — ${w}`);na++;};
const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const ct=await getAdminAuth().createCustomToken(OWNER);
const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:ct,returnSecureToken:true})});
const {idToken}=await r.json() as any;
const login=await fetch(`${BASE}/api/login`,{headers:{Authorization:`Bearer ${idToken}`},redirect:"manual"});
const host=new URL(BASE).hostname;
const cookies=(login.headers.getSetCookie?.()??[]).map(c=>{const [p]=c.split(";");const i=p.indexOf("=");return{name:p.slice(0,i),value:p.slice(i+1),domain:host,path:"/"};});
cookies.push({name:"active_workspace_id",value:SA,domain:host,path:"/"});
const { chromium } = await import("@playwright/test");
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.addCookies(cookies);
const p=await ctx.newPage();
await p.goto(`${BASE}/app/intelligence`,{waitUntil:"domcontentloaded",timeout:120000});
await p.waitForTimeout(14000);
const t=(await p.locator("body").innerText()).replace(/\s+/g," ");
const ri=t.indexOf("RECOMMENDATIONS");
console.log("RECOMMENDATIONS CARD >>>", ri>=0? t.slice(ri, ri+300):"(not found)");

check("R1: a real Growth Score renders", /GROWTH SCORE[^A-Za-z]*\d/.test(t), t.slice(t.indexOf("GROWTH SCORE"), t.indexOf("GROWTH SCORE")+70));
check("R1: the primary constraint is named", /Buyer Experience|Primary constraint/i.test(t));
check("R1: intelligence is not unavailable", !/GROWTH SCORE Unavailable/.test(t));

const fix=p.getByRole("button",{name:/Fix this with Zeno/i}).first();
if(!(await fix.isVisible().catch(()=>false))){
  unavail("R3: a recommendation offers an action", /RECOMMENDATIONS Unavailable/.test(t)?"recommendations unavailable":"no recommendation rendered");
  unavail("R3: clicking opens Zeno pre-loaded","none to click");
  unavail("R3: declining changes nothing","none to decline");
} else {
  const recText=(await fix.locator("xpath=..").innerText()).replace(/\s+/g," ");
  check("R3: a recommendation renders an action", true, recText.slice(0,110));
  check("R3: it is prioritised, with impact and effort stated", /impact/i.test(recText) && /effort/i.test(recText), recText.slice(0,110));
  await fix.click(); await p.waitForTimeout(1800);
  const composer=p.locator('textarea[placeholder*="Ask a question"]').first();
  check("R3: clicking opens Zeno", await composer.isVisible().catch(()=>false));
  const seeded=await composer.inputValue().catch(()=>"");
  const words=recText.split(" ").filter(w=>w.length>6).slice(0,5);
  check("R3: Zeno receives Ascend's own words, not a summary",
    seeded.length>0 && words.some(w=>seeded.includes(w.replace(/[^A-Za-z]/g,""))), seeded.slice(0,150));
  check("R3: nothing was generated merely by opening it",
    (await p.locator("text=/Approve this|Confirm this/i").count())===0);
  // "Declining" means walking away without sending. Two valid shapes now: the
  // floating panel closes, or (fallback path) the customer is on the Zeno page
  // with the request typed and unsent. What must hold in BOTH is that nothing
  // was created — asserting the composer disappears would only describe the
  // panel, and would fail the fallback for being a page.
  const closeBtn = p.locator('button[aria-label="Close Zeno"]').first();
  if (await closeBtn.isVisible().catch(()=>false)) {
    await closeBtn.click();
    await p.waitForTimeout(900);
    check("R3: declining closes the panel",
      (await p.locator('textarea[placeholder*="Ask a question"]').count())===0);
  } else {
    check("R3: the request is waiting, typed and unsent",
      (await composer.inputValue().catch(()=>"")).length>0);
  }
  check("R3: declining created nothing",
    (await p.locator("text=/Approve this|Confirm this|Your funnel is ready|is saved/i").count())===0);
}
await b.close();
console.log(bad===0&&na===0?"\nALL PASS":`\n${bad} FAILED · ${na} UNAVAILABLE`);
process.exit(bad===0&&na===0?0:1);
