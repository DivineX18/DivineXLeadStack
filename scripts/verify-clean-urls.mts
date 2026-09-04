/**
 * CLEAN CUSTOMER URLS — behavioral.
 *
 * Asserts what the CUSTOMER's address bar shows while using Complete, not that
 * a route responds. A page can render correctly and still leak /app/* into the
 * URL, which is the whole point of this work.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n")){const i=l.indexOf("=");if(i>0&&!l.startsWith("#"))process.env[l.slice(0,i).trim()]??=l.slice(i+1).trim().replace(/^["']|["']$/g,"");}
const FLOW=process.env.FLOW_STAGING??"https://flow-growth-scan-staging.onrender.com";
const SA=process.env.NAV_SA??"MEYB8CbWlE5fxAn3TJOp", OWNER="irkY5HKIzxb64l5qCyHroTrudJa2";
const { chromium } = await import("@playwright/test");
const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
let bad=0; const check=(l:string,ok:boolean,n="")=>{console.log(`${ok?"PASS":"FAIL"} ${l}${n?` — ${n}`:""}`);if(!ok)bad++;};
const ver=await (await fetch(`${FLOW}/api/version`)).json() as {commit?:string};
console.log(`\nCLEAN URLS — staging @${ver.commit}\n${"─".repeat(68)}`);
const ct=await getAdminAuth().createCustomToken(OWNER);
const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:ct,returnSecureToken:true})});
const {idToken}=await r.json() as {idToken:string};
const login=await fetch(`${FLOW}/api/login`,{headers:{Authorization:`Bearer ${idToken}`},redirect:"manual"});
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1440,height:950}});
await ctx.addCookies((login.headers.getSetCookie?.()??[]).map(c=>{const [p]=c.split(";");const i=p.indexOf("=");return {name:p.slice(0,i),value:p.slice(i+1),domain:new URL(FLOW).hostname,path:"/"};}));
const page=await ctx.newPage();
await page.goto(`${FLOW}/sa/${SA}/switch`,{waitUntil:"domcontentloaded"}); await page.waitForTimeout(2000);
for (const [u,label] of [["/create","CREATE"],["/leads","LEADS"],["/agents","AGENTS"],["/performance","PERFORMANCE"],["/intelligence","INTELLIGENCE"],["/settings","SETTINGS"],["/create/orders","CREATE > Orders"],["/create/forms","CREATE > Forms"],["/leads/contacts","LEADS > Contacts"]] as const){
  await page.goto(`${FLOW}${u}`,{waitUntil:"domcontentloaded"}); await page.waitForTimeout(2200);
  const url=page.url().replace(FLOW,"");
  const unified=(await page.locator(".theme-ascend").count())>0;
  check(`${label.padEnd(18)} url stays clean`, url===u && unified, `${url}${unified?"":" (NOT unified)"}`);
}
// Refresh / deep link
await page.goto(`${FLOW}/create/forms`,{waitUntil:"domcontentloaded"}); await page.waitForTimeout(1500);
await page.reload({waitUntil:"domcontentloaded"}); await page.waitForTimeout(2000);
check("deep link survives refresh", page.url().replace(FLOW,"")==="/create/forms", page.url().replace(FLOW,""));
// Internal nav emits clean hrefs
await page.goto(`${FLOW}/create`,{waitUntil:"domcontentloaded"}); await page.waitForTimeout(2500);
const navHrefs=await page.evaluate(()=>Array.from(document.querySelectorAll("aside nav a")).map(a=>a.getAttribute("href")||""));
check("sidebar emits clean hrefs", navHrefs.every(h=>!h.startsWith("/app")), navHrefs.filter(h=>h.startsWith("/app")).join(", ")||navHrefs.slice(0,7).join(" "));
const leaks=await page.evaluate(()=>Array.from(document.querySelectorAll("a[href^='/app/']")).map(a=>a.getAttribute("href")||""));
check("no /app/* links anywhere on Create", leaks.length===0, leaks.slice(0,4).join(", "));
// Legacy compatibility
await page.goto(`${FLOW}/app/create`,{waitUntil:"domcontentloaded"}); await page.waitForTimeout(2200);
check("legacy /app/create lands clean", page.url().replace(FLOW,"")==="/create", page.url().replace(FLOW,""));
await b.close();
console.log(`\n${bad===0?"CLEAN URLS: PASS":`CLEAN URLS: ${bad} FAILURE(S)`}`);
process.exit(bad?1:0);
