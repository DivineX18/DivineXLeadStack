import { chromium } from "@playwright/test";
const B="https://app.divinex.io"; let f=0;
const ck=(l:string,ok:boolean,d="")=>{console.log(`${ok?"PASS":"FAIL"} ${l}${d?` — ${d}`:""}`);if(!ok)f++;};
const br=await chromium.launch();
for(const [dev,w,h] of [["desktop",1440,900],["mobile",390,844]] as const){
  const p=await (await br.newContext({viewport:{width:w,height:h}})).newPage();
  await p.goto(`${B}/growth-scanner`,{waitUntil:"networkidle",timeout:90000});
  await p.locator('input[placeholder="yourbusiness.com"]').fill("https://ascend.divinex.io");
  await p.locator('input[type="email"]').fill(`res-${dev}-${Date.now()}@divinex.io`);
  await p.locator("button",{hasText:"Run My Free Growth Scan"}).first().click();
  await p.waitForSelector("text=/Your #1 constraint/i",{timeout:420000}).catch(()=>{});
  const t=(await p.locator("body").innerText()).replace(/\s+/g," ");
  ck(`${dev}: Growth Score renders`, /\/ 100/.test(t), (t.match(/(\d+) \/ 100/)??[])[0]??"none");
  ck(`${dev}: primary constraint renders`, /Your #1 constraint/i.test(t));
  ck(`${dev}: prioritized actions render`, /What to fix first/i.test(t));
  ck(`${dev}: category scores render`, /Every dimension scored/i.test(t));
  ck(`${dev}: trial CTA renders`, t.includes("Start My 14-Day Free Trial"));
  ck(`${dev}: disclosure is exact`, t.includes("$0 today. Card required. $197/mo after 14 days."), (t.match(/\$0 today[^A-Z]{0,80}/)??[])[0]??"none");
  ck(`${dev}: no internal diagnostics leak into the page`, !/reliabilityGate|explainability|blueprint/i.test(t));
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  ck(`${dev}: no horizontal scroll on results`, !ov);
  const href=await p.locator('a:has-text("Start My 14-Day Free Trial")').first().getAttribute("href").catch(()=>null);
  console.log(`   trial CTA href: ${href}`);
}
await br.close();
console.log(`\n${f===0?"RESULTS RENDER: ALL CHECKS PASSED":`RESULTS RENDER: ${f} FAILED`}`);
