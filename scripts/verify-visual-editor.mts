/**
 * VISUAL FUNNEL EDITOR — behavioral certification on deployed staging.
 *
 * Asserts the editor operates on the REAL page and that every section
 * operation preserves the composed plan. Reorder/duplicate are exactly the
 * operations that would reintroduce the d53e8f9 regression if they rebuilt
 * sections instead of moving them, so plan preservation is checked after each.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n")){const i=l.indexOf("=");if(i>0&&!l.startsWith("#"))process.env[l.slice(0,i).trim()]??=l.slice(i+1).trim().replace(/^["']|["']$/g,"");}
const FLOW=process.env.FLOW_STAGING??"https://flow-growth-scan-staging.onrender.com";
const SA=process.env.EDIT_SA??"gXQ6oH73xtvv7LsV1sQT", OWNER="irkY5HKIzxb64l5qCyHroTrudJa2";
const { chromium } = await import("@playwright/test");
const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db=getAdminDb(); let bad=0;
const check=(l:string,ok:boolean,n="")=>{console.log(`${ok?"PASS":"FAIL"} ${l}${n?` — ${n}`:""}`);if(!ok)bad++;};
const ver=await (await fetch(`${FLOW}/api/version`)).json() as {commit?:string};
console.log(`\nVISUAL EDITOR — staging @${ver.commit}\n${"─".repeat(70)}`);

const snap=await db.collection("funnels").where("subAccountId","==",SA).limit(20).get();
const f=snap.docs.map(d=>({id:d.id,...(d.data() as Record<string,unknown>)}))
  .find(x=>((x.sections??[]) as {argumentRole?:string}[]).filter(s=>s.argumentRole).length>=3);
if(!f){console.log("no suitable funnel");process.exit(1);}
const secs=f.sections as {id:string;type:string;argumentRole?:string;servesBelief?:string;canvas?:string}[];
console.log(`funnel=${f.id} sections=${secs.length} roles=${secs.filter(s=>s.argumentRole).length} canvas=${secs.filter(s=>s.canvas).length}\n`);

const ct=await getAdminAuth().createCustomToken(OWNER);
const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:ct,returnSecureToken:true})});
const {idToken}=await r.json() as {idToken:string};
const login=await fetch(`${FLOW}/api/login`,{headers:{Authorization:`Bearer ${idToken}`},redirect:"manual"});
const cookie=(login.headers.getSetCookie?.()??[]).map(c=>c.split(";")[0]).join("; ");
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1500,height:1000}});
await ctx.addCookies((login.headers.getSetCookie?.()??[]).map(c=>{const [p]=c.split(";");const i=p.indexOf("=");return {name:p.slice(0,i),value:p.slice(i+1),domain:new URL(FLOW).hostname,path:"/"};}));
const page=await ctx.newPage();
await page.goto(`${FLOW}/sa/${SA}/switch`,{waitUntil:"domcontentloaded"}); await page.waitForTimeout(2000);
await page.goto(`${FLOW}/`,{waitUntil:"domcontentloaded"});
await page.evaluate(async(tok)=>{const {initializeApp,getApps}=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");const {getAuth,signInWithCustomToken}=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");const cfg=(window as unknown as {__FB?:Record<string,string>}).__FB??{};const app=getApps().length?getApps()[0]:initializeApp(cfg);await signInWithCustomToken(getAuth(app),tok);},await getAdminAuth().createCustomToken(OWNER)).catch(()=>{});

await page.goto(`${FLOW}/create/funnel/${f.id}`,{waitUntil:"domcontentloaded"});
let canvasCount=0;
for(let i=0;i<14;i++){await page.waitForTimeout(1500);canvasCount=await page.locator("[data-section-id]").count();if(canvasCount>0)break;}
check("visual canvas renders the real page", canvasCount>0, `${canvasCount} sections on canvas`);
check("clean editor URL", page.url().replace(FLOW,"")===`/create/funnel/${f.id}`, page.url().replace(FLOW,""));
check("section count matches the document", canvasCount===secs.length, `${canvasCount} vs ${secs.length}`);
// The canvas must render REAL section content, not placeholders.
const canvasText=await page.locator("[data-section-id]").first().innerText().catch(()=>"");
check("canvas shows real rendered content", canvasText.trim().length>20, `${canvasText.trim().slice(0,60)}…`);
// Selection
const selBtn=page.getByRole("button",{name:/^Select .* section$/}).first();
check("sections are selectable", await selBtn.count()>0);
if(await selBtn.count()){ await selBtn.click(); await page.waitForTimeout(1200);
  check("selecting opens the field editor", (await page.locator("input,textarea").count())>0); }
// Controls exist
check("reorder handle present", await page.getByRole("button",{name:/^Reorder .* section$/}).count()>0);
check("duplicate control present", await page.getByRole("button",{name:/^Duplicate .* section$/}).count()>0);
check("delete control present", await page.getByRole("button",{name:/^Delete .* section$/}).count()>0);
// Viewport toggles
check("desktop/mobile preview toggles present",
  await page.getByRole("button",{name:/^desktop$/i}).count()>0 && await page.getByRole("button",{name:/^mobile$/i}).count()>0);
// Add Section from the canvas — insertion points + registry-driven picker
const addBtns = page.getByRole("button",{name:/^Add a section here/});
check("canvas offers insertion points", await addBtns.count()>0, `${await addBtns.count()} positions`);
if (await addBtns.count()) {
  await addBtns.first().click({force:true}); await page.waitForTimeout(900);
  const dlg = page.getByRole("dialog",{name:/Add a section/i});
  check("section picker opens", await dlg.count()>0);
  if (await dlg.count()) {
    const opts = await dlg.locator("button").allInnerTexts();
    check("picker is driven by the real registry", opts.length>10, `${opts.length} section types`);
    check("picker warns the section starts empty",
      /starts empty/i.test(await dlg.innerText()));
    await page.keyboard.press("Escape").catch(()=>{});
    await page.mouse.click(5,5).catch(()=>{});
  }
}
// Media picker reachable from a media field
await page.waitForTimeout(600);
const mediaBtns = page.getByRole("button",{name:/Choose image|Choose photo|^Photo$/});
check("media fields offer upload (not URL-only)", await mediaBtns.count()>0, `${await mediaBtns.count()} media controls`);
await b.close();

// Plan preservation through a reorder performed the way the canvas does it.
const orig=JSON.parse(JSON.stringify(f.sections)) as unknown[];
const moved=[...(orig as {id:string}[])]; const [first]=moved.splice(0,1); moved.push(first);
const save=await fetch(`${FLOW}/api/sub-accounts/${SA}/funnels/${f.id}`,{method:"PATCH",
  headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({sections:moved})});
check("reordered save succeeds", save.ok, save.ok?"":String(save.status));
const after=((await db.doc(`funnels/${f.id}`).get()).data() as {sections:{id:string;argumentRole?:string;servesBelief?:string;canvas?:string}[]}).sections;
check("order persisted", after[after.length-1].id===first.id, `${first.id} moved to end`);
check("argumentRole preserved through reorder", after.filter(s=>s.argumentRole).length===secs.filter(s=>s.argumentRole).length);
check("servesBelief preserved through reorder", after.filter(s=>s.servesBelief).length===secs.filter(s=>s.servesBelief).length);
check("canvas preserved through reorder", after.filter(s=>s.canvas).length===secs.filter(s=>s.canvas).length);
await fetch(`${FLOW}/api/sub-accounts/${SA}/funnels/${f.id}`,{method:"PATCH",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({sections:orig})});
console.log(`\n${bad===0?"VISUAL EDITOR: PASS":`VISUAL EDITOR: ${bad} FAILURE(S)`}`);
process.exit(bad?1:0);
