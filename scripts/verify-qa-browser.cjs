// Isolated Chromium component integration checks. All API/storage I/O is a
// local fixture; this does NOT certify Firestore, production or email delivery.
// QA_ESBUILD_MODULE=/path/to/esbuild/lib/main.js node scripts/verify-qa-browser.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, expect } = require('@playwright/test');
const esbuild = require(process.env.QA_ESBUILD_MODULE || 'esbuild');
const root = path.resolve(__dirname, '..');
const out = '/tmp/ascend-qa-browser';
fs.mkdirSync(out, { recursive: true });
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Toaster} from 'sonner';
import {MediaPicker} from './src/components/media/media-picker';
import FormBuilder from './src/app/(dashboard)/sa/[subAccountId]/forms/[id]/page';
import {CtaButton} from './src/components/funnels/sections/cta-button';
import {defaultFormFields,defaultFormSettings} from './src/types/forms';
window.qa = {failNext:false,delay:0,writes:0,uploads:0};
const form={id:'qa-form',name:'QA form',fields:defaultFormFields(),settings:defaultFormSettings(),enabled:true};
function App(){
 const [selected,setSelected]=React.useState('');
 if(location.pathname==='/forms') return <FormBuilder/>;
 if(location.pathname==='/capture') return <CtaButton label="Sign up" form={form} accentColor="#123456" successRedirect="/lp/qa-funnel/thanks" cta={{style:new URLSearchParams(location.search).get('style')||'inline'}}/>;
 if(location.pathname==='/lp/qa-funnel/thanks') return <h1>QA Thank-You destination</h1>;
 return <><p data-testid="selected">{selected}</p><MediaPicker saId="qa" open onClose={()=>{}} onSelect={setSelected}/></>;
}
createRoot(document.getElementById('root')).render(<><App/><Toaster/></>);
`;
const mocks = {
  'next/navigation': `export const useParams=()=>({id:'qa-form'});`,
  'next/link': `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`,
  '@/hooks/use-auth': `const user={uid:'qa'};export const useAuth=()=>({user,loading:false});`,
  '@/context/sub-account-context': `export const useSubAccount=()=>({saPath:p=>'/sa/qa'+p,subAccount:{id:'qa',name:'QA'}});`,
  '@/lib/attribution': `export const readAttributionFromBrowser=()=>null;export const trackLeadEvent=()=>{};`,
  '@/lib/firestore/forms': `
    import {defaultFormFields,defaultFormSettings} from '@/types/forms';
    let listener; const read=()=>JSON.parse(localStorage.getItem('qa-form')||'null')||{id:'qa-form',name:'QA form',fields:defaultFormFields(),settings:defaultFormSettings(),enabled:true};
    export function subscribeToForm(id,cb){listener=cb;cb(read());return ()=>{listener=null}}
    export async function updateForm(id,patch){window.qa.writes++;const fail=window.qa.failNext;window.qa.failNext=false;await new Promise(r=>setTimeout(r,window.qa.delay));if(fail)throw Error('Fixture write rejected');const next={...read(),...patch};localStorage.setItem('qa-form',JSON.stringify(next));listener?.(next)}
  `,
};
async function main() {
  await esbuild.build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true,
    outfile: path.join(out,'bundle.js'), platform:'browser', jsx:'automatic', tsconfig:path.join(root,'tsconfig.json'),
    define:{'process.env.NODE_ENV':'"development"'}, plugins:[{name:'qa-io-only',setup(build){
      build.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'qa'}:undefined);
      build.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:root}));
    }}] });
  let submissions=0;
  const server=http.createServer((req,res)=>{
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return}
    if(req.url?.startsWith('/api/')){
      res.setHeader('Content-Type','application/json');
      if(req.url.includes('/submit')){submissions++;res.end(JSON.stringify({ok:true,redirectUrl:'/deleted-page'}));return}
      if(req.method==='POST'){res.end(JSON.stringify({url:'/uploaded.png',kind:'image'}));return}
      res.end(JSON.stringify({media:[],assets:[]}));return;
    }
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try {
    browser=await chromium.launch();
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    const page=await context.newPage();
    const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    let uploadPosts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/media'))uploadPosts++});
    await page.goto(base+'/media');
    await page.locator('input[type=file]').setInputFiles({name:'guide.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF')});
    await expect(page.getByText(/guide.pdf is a/)).toBeVisible();
    if(uploadPosts)throw Error('PDF reached upload API');
    await page.screenshot({path:path.join(out,'image-rejection.png')});
    await page.locator('input[type=file]').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71])});
    await expect(page.getByTestId('selected')).toHaveText('/uploaded.png');
    if(uploadPosts!==1)throw Error('Expected exactly one image upload');
    console.log('PASS browser BUG-017 rejects PDF and accepts image');
    await page.goto(base+'/forms');
    await expect(page.getByRole('status')).toContainText('Autosave is on');
    await page.evaluate(()=>{window.qa.delay=300});
    await page.locator('input').first().fill('Persisted QA name');
    await expect(page.getByRole('status')).toContainText('Saving');
    await expect(page.getByRole('status')).toContainText('All changes saved');
    await page.reload();
    await expect(page.locator('input').first()).toHaveValue('Persisted QA name');
    await page.evaluate(()=>{window.qa.failNext=true});
    await page.locator('input').first().fill('Rejected QA name');
    await expect(page.getByRole('alert')).toContainText('A save failed');
    await expect(page.getByRole('status')).toContainText('not saved');
    await page.screenshot({path:path.join(out,'save-failure.png')});
    await page.reload();
    await expect(page.locator('input').first()).toHaveValue('Persisted QA name');
    await page.locator('input').first().fill('Recovered QA name');
    await expect(page.getByRole('status')).toContainText('All changes saved');
    console.log('PASS browser BUG-024 save/reload, failure feedback, reload/reapply recovery (fixture storage)');
    for(let i=0;i<20;i++){
      await page.goto(base+'/capture'+(i%2?'?style=popup_form':''));
      if(i%2)await page.getByRole('button',{name:'Sign up',exact:true}).click();
      await page.locator('input[type=email]').fill('qa@example.invalid');
      const names=page.locator('input[type=text]');
      for(let j=0;j<await names.count();j++)await names.nth(j).fill('QA Visitor');
      await page.getByRole('button',{name:'Submit',exact:true}).click();
      await page.waitForURL(base+'/lp/qa-funnel/thanks');
      await expect(page.getByRole('heading')).toHaveText('QA Thank-You destination');
    }
    if(submissions!==20)throw Error('Expected exactly 20 successful fixture submissions, got '+submissions);
    await page.screenshot({path:path.join(out,'thank-you.png')});
    if(pageErrors.length)throw Error('Browser exceptions: '+pageErrors.join('; '));
    console.log('PASS browser BUG-028 20/20 inline/popup submissions reach Thank-You despite stale API redirect');
    console.log('Evidence: '+out);
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
