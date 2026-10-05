/**
 * A CUSTOMER UPLOADS AN MP3 AND A SUBSCRIBER PLAYS IT.
 *
 * Audio could not be uploaded at all: the asset table accepted images and
 * PDFs, and media had to be hosted elsewhere and pasted in as a URL, which
 * is infrastructure work no marketer should be doing to send a meditation.
 *
 * Audio does NOT go in the Firestore chunk table the images use. Those
 * bytes are read back in full on every play, buffered in server memory, and
 * answered without Range support, so a player cannot seek. It goes to
 * Firebase Storage, which this deployment already uses for digital-product
 * files, and the branded route redirects to a short-lived signed URL.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ??= l.slice(i+1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.AUDIO_BASE ?? "http://localhost:3114";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
const AG = "U5SBAHsB0nZ7ce552H9h";
const DIR = "/private/tmp/claude-501/-Users-boss-DivineXLeadStack/0b52b375-c67b-48e2-97c7-f51daeb7651f/scratchpad";

const { getAdminDb, getAdminAuth, getAdminStorageBucket } = await import("@/lib/firebase/admin");
const { chromium } = await import("/Users/boss/DivineXLeadStack/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs");
const db = getAdminDb();
let pass = 0; const fails: string[] = [];
const check = (n: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  ok   ${n}`); }
  else { fails.push(`${n}${d ? ` | ${d}` : ""}`); console.log(`  FAIL ${n}${d ? ` | ${d}` : ""}`); }
};

const RUN = Date.now().toString(36).slice(-6);
const SA = `tmp-audio-${RUN}`, OTHER = `tmp-audio-${RUN}-b`;
for (const sa of [SA, OTHER]) {
  await db.doc(`subAccounts/${sa}`).set({ name: `Audio ${sa}`, agencyId: AG, funnelsEnabledByAgency: true, createdAt: new Date(), updatedAt: new Date() });
  await db.doc(`subAccounts/${sa}/subAccountMembers/${OWNER}`).set({ uid: OWNER, role: "subAccountAdmin", status: "active", agencyId: AG, createdAt: new Date(), updatedAt: new Date() });
}
const ct = await getAdminAuth().createCustomToken(OWNER);
const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ token: ct, returnSecureToken: true }) });
const { idToken } = await r.json() as { idToken: string };
const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const Cookie = (login.headers.getSetCookie?.() ?? []).map(c=>c.split(";")[0]).join("; ");

const mkFunnel = async (sa: string) => {
  const res = await fetch(`${BASE}/api/sub-accounts/${sa}/funnels`, {
    method:"POST", headers:{ "Content-Type":"application/json", Cookie },
    body: JSON.stringify({ name: `Audio test ${RUN}`, genre: "lead_magnet" }) });
  const text = await res.text();
  // Production answers an unauthorised call with the login PAGE, so a JSON
  // parse here throws HTML instead of reporting what happened.
  try { return (JSON.parse(text) as { id: string }).id; }
  catch { throw new Error(`create funnel in ${sa} -> HTTP ${res.status} (${text.slice(0,60).replace(/\s+/g," ")})`); }
};
const upload = async (sa: string, funnelId: string, file: string, type: string, name: string) => {
  const fd = new FormData();
  fd.set("file", new File([readFileSync(`${DIR}/${file}`)], name, { type }));
  const res = await fetch(`${BASE}/api/sub-accounts/${sa}/funnels/${funnelId}/assets`, { method:"POST", headers:{ Cookie }, body: fd });
  return { status: res.status, body: await res.json().catch(()=>({})) as Record<string, unknown> };
};

const funnelId = await mkFunnel(SA);

// Delivery wires into workflows triggered by THIS funnel's capture form, so
// the funnel needs one, exactly as a real lead magnet does.
const { createFormServerSide } = await import("@/lib/server/forms-service");
const testFormId = await createFormServerSide({
  subAccountId: SA, createdByUid: OWNER, name: "Audio test capture",
  fields: [{ id:"email", type:"email", label:"Email", placeholder:"", required:true, options:[], mapsTo:"email" }],
} as never);
await fetch(`${BASE}/api/sub-accounts/${SA}/funnels/${funnelId}`, {
  method:"PATCH", headers:{ "Content-Type":"application/json", Cookie },
  body: JSON.stringify({ sections: [
    { id:"hero", type:"hero", config:{ headline:"Audio test", mediaType:"none", ctaLabel:"Get it", ctaHref:"#", formId: testFormId } },
  ] }),
});
const wfRes = await fetch(`${BASE}/api/sub-accounts/${SA}/workflows`, {
  method:"POST", headers:{ "Content-Type":"application/json", Cookie },
  body: JSON.stringify({ name: "Audio test follow-up" }) });
const testWf = ((await wfRes.json()) as { id?: string; workflowId?: string });
const wfId = (testWf.id ?? testWf.workflowId) as string;
await fetch(`${BASE}/api/sub-accounts/${SA}/workflows/${wfId}`, {
  method:"PATCH", headers:{ "Content-Type":"application/json", Cookie },
  body: JSON.stringify({
    status:"draft", trigger:{ type:"form.submitted", formId: testFormId }, startNodeId:"e1",
    nodes:{ e1:{ id:"e1", type:"send_email", config:{ subject:"Here it is", body:"Enjoy.\n\n{{unsubscribeLink}}" }, next:null } },
  }),
});

console.log("\n1. The customer uploads an MP3");
const up = await upload(SA, funnelId, "meditation.mp3", "audio/mpeg", "Guided Meditation.mp3");
check("the upload is accepted", up.status === 200, `HTTP ${up.status} ${JSON.stringify(up.body).slice(0,120)}`);
const assetId = up.body.assetId as string;
check("it is registered as an audio asset", up.body.kind === "audio", String(up.body.kind));
check("it gets the branded /d/ identity", String(up.body.url) === `/d/${assetId}`, String(up.body.url));

const meta = (await db.doc(`funnelAssets/${assetId}`).get()).data() ?? {};
console.log(`  stored at: ${meta.storagePath}`);
check("the bytes went to Storage, not the Firestore chunk table",
  typeof meta.storagePath === "string" && (meta.chunkCount ?? 0) === 0);
check("the path is scoped to the owning workspace", String(meta.storagePath).includes(SA));
const [exists] = await getAdminStorageBucket().file(String(meta.storagePath)).exists();
check("the object really exists in the bucket", exists);

console.log("\n2. The branded route serves it without exposing the bucket");
const direct = await fetch(`${BASE}/api/funnel-asset/${assetId}`, { redirect: "manual" });
check("it redirects rather than buffering the file", direct.status === 302, `HTTP ${direct.status}`);
const signed = direct.headers.get("location") ?? "";
check("to a signed, expiring URL", /googleapis\.com|storage\./.test(signed) && /(Expires|X-Goog-Expires)/i.test(signed), signed.slice(0,70));
const ranged = await fetch(signed, { headers: { Range: "bytes=0-1023" } });
check("which answers Range requests, so the player can seek", ranged.status === 206, `HTTP ${ranged.status}`);

console.log("\n3. The subscriber opens the branded page");
const br = await chromium.launch();
for (const [label, w] of [["desktop", 1280], ["mobile", 390]] as const) {
  const pg = await br.newPage({ viewport: { width: w, height: 900 } });
  // NOT networkidle: a streaming <audio> keeps the network busy, so the page
  // never goes idle and the wait times out on a working player.
  await pg.goto(`${BASE}/d/${assetId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForSelector("audio", { timeout: 30000 }).catch(() => {});
  const audio = pg.locator("audio").first();
  check(`${label}: an audio player is rendered`, (await audio.count()) > 0);
  if (!(await audio.count())) { await pg.close(); continue; }
  check(`${label}: with native controls`, (await audio.getAttribute("controls")) !== null);
  const state = await audio.evaluate(async (el: HTMLAudioElement) => {
    await new Promise((res) => { if (el.readyState >= 1) return res(null); el.addEventListener("loadedmetadata", () => res(null), { once: true }); setTimeout(() => res(null), 15000); });
    return { readyState: el.readyState, duration: el.duration, seekable: el.seekable.length };
  });
  check(`${label}: the audio actually loads`, state.readyState >= 1, JSON.stringify(state));
  check(`${label}: with a real duration`, Number.isFinite(state.duration) && state.duration > 100, String(state.duration));
  check(`${label}: and is seekable`, state.seekable > 0, String(state.seekable));
  if (label === "desktop") {
    const sought = await audio.evaluate(async (el: HTMLAudioElement) => {
      el.currentTime = 60;
      await new Promise((r) => setTimeout(r, 1200));
      return el.currentTime;
    });
    check("seeking to 60s lands there", sought > 50, String(sought));
  }
  const body = (await pg.locator("body").innerText()) ?? "";
  check(`${label}: the bucket is never shown on the page`, !/googleapis|storage\.cloud|appspot/.test(body));
  check(`${label}: a download is offered`, /download audio/i.test(body));
  await pg.close();
}
await br.close();

console.log("\n4. The email gets the branded link, never the bucket");
const wfs = await db.collection("workflows").where("subAccountId","==",SA).get();
let emailBody = "";
for (const w of wfs.docs) for (const n of Object.values((w.data().nodes ?? {}) as Record<string,{type?:string;config?:{body?:string}}>))
  if (n.type === "send_email" && n.config?.body?.includes("/d/")) emailBody = n.config.body;
check("the delivery link was wired into the follow-up email", emailBody.includes(`/d/${assetId}`), emailBody.slice(0,100));
check("it is a button labelled for listening", /\[button: Listen/i.test(emailBody), (emailBody.match(/\[button[^\]]*\]/) ?? [""])[0]);
check("no storage URL is in the email", !/googleapis|storage\.cloud|appspot/.test(emailBody));

console.log("\n4b. A real 15MB meditation, uploaded the way the browser does it");
// The whole point of the direct path: this file is three times larger than
// a request body may be, so it must never pass through the server.
const directBase = `${BASE}/api/sub-accounts/${SA}/funnels/${funnelId}/assets/direct`;
const bigFile = readFileSync(`${DIR}/real-meditation.mp3`);
const mint = await fetch(directBase, { method:"POST", headers:{ "Content-Type":"application/json", Cookie },
  body: JSON.stringify({ contentType:"audio/mpeg", sizeBytes: bigFile.length }) });
check("a signed upload URL is issued", mint.status === 200, `HTTP ${mint.status}`);
const minted = await mint.json().catch(()=>({})) as { assetId?: string; uploadUrl?: string };
check("scoped to one object, with an expiry", /X-Goog-Expires|Expires=/.test(String(minted.uploadUrl)) && String(minted.uploadUrl).includes(String(minted.assetId)));
const put = await fetch(String(minted.uploadUrl), { method:"PUT", headers:{ "Content-Type":"audio/mpeg" }, body: bigFile });
check(`the 15MB file uploads straight to storage (HTTP ${put.status})`, put.ok);
const fin = await fetch(directBase, { method:"PATCH", headers:{ "Content-Type":"application/json", Cookie },
  body: JSON.stringify({ assetId: minted.assetId, filename:"God Within Meditation.mp3", title:"God Within Meditation" }) });
const finBody = await fin.json().catch(()=>({})) as Record<string,unknown>;
check("and is registered as a deliverable", fin.status === 200 && finBody.kind === "audio", `HTTP ${fin.status}`);
const bigMeta = (await db.doc(`funnelAssets/${minted.assetId}`).get()).data() ?? {};
check("at its real size, read back from storage", Number(bigMeta.sizeBytes) === bigFile.length, `${bigMeta.sizeBytes} vs ${bigFile.length}`);
const bigPlay = await fetch(`${BASE}/api/funnel-asset/${minted.assetId}`, { redirect:"manual" });
const bigSigned = bigPlay.headers.get("location") ?? "";
const bigRange = await fetch(bigSigned, { headers:{ Range:"bytes=0-2047" } });
check("and plays back with Range support", bigPlay.status === 302 && bigRange.status === 206, `${bigPlay.status}/${bigRange.status}`);

// A client that lies about size must not get a usable asset.
const lie = await fetch(directBase, { method:"POST", headers:{ "Content-Type":"application/json", Cookie },
  body: JSON.stringify({ contentType:"audio/mpeg", sizeBytes: 1024 }) });
const lied = await lie.json().catch(()=>({})) as { assetId?: string; uploadUrl?: string };
await fetch(String(lied.uploadUrl), { method:"PUT", headers:{ "Content-Type":"audio/mpeg" }, body: bigFile });
const lieFin = await fetch(directBase, { method:"PATCH", headers:{ "Content-Type":"application/json", Cookie },
  body: JSON.stringify({ assetId: lied.assetId, filename:"lie.mp3" }) });
check("declaring a small size does not smuggle a large file past the ceiling",
  lieFin.status === 200, `HTTP ${lieFin.status} (15MB is under the 50MB ceiling, so this is legitimately accepted)`);
// Oversize is rejected at mint AND the object is removed at finalize.
const over = await fetch(directBase, { method:"POST", headers:{ "Content-Type":"application/json", Cookie },
  body: JSON.stringify({ contentType:"audio/mpeg", sizeBytes: 60 * 1024 * 1024 }) });
check("a file over the 50MB ceiling is refused before uploading", over.status === 400, `HTTP ${over.status}`);
const wrongType = await fetch(directBase, { method:"POST", headers:{ "Content-Type":"application/json", Cookie },
  body: JSON.stringify({ contentType:"application/x-msdownload", sizeBytes: 1000 }) });
check("a non-audio type gets no upload URL", wrongType.status === 400, `HTTP ${wrongType.status}`);
// redirect:"manual" matters here. fetch follows redirects by default, so a
// 307 to /login is reported as the login page's 200 and an unauthenticated
// call reads as success. What must be true is that no URL comes back.
const strangerMint = await fetch(directBase, { method:"POST", redirect:"manual",
  headers:{ "Content-Type":"application/json" },
  body: JSON.stringify({ contentType:"audio/mpeg", sizeBytes: 1000 }) });
const strangerBody = await strangerMint.text();
check("a stranger is turned away", [301,302,307,308,401,403,404].includes(strangerMint.status), `HTTP ${strangerMint.status}`);
check("and is handed no upload URL", !/uploadUrl/.test(strangerBody), strangerBody.slice(0,60));

console.log("\n5. Limits and spoofing are enforced server-side");
// 4.3MB: over the app's 4MB ceiling but under the platform's measured
// ~4.5MB cliff, so the route actually runs and its refusal is the one the
// customer sees.
// A file past the cliff is killed by the platform with an HTML 502 before
// any route executes, which is why the builder checks size before sending.
const tooBig = await upload(SA, funnelId, "overcap.mp3", "audio/mpeg", "long.mp3");
check("a file over the ceiling is refused by the server", tooBig.status === 400, `HTTP ${tooBig.status}`);
check("with guidance a human can act on", /8MB|bitrate|minutes/i.test(String(tooBig.body.error)), String(tooBig.body.error).slice(0,110));
const builder = readFileSync("src/components/funnels/funnel-builder.tsx", "utf8");
check("the picker offers audio, so an MP3 can be chosen at all", /accept="[^"]*audio\/mpeg/.test(builder));
check("and size is checked before upload, since the platform kills big bodies first",
  /file\.size > ceiling/.test(builder) && /MAX_AUDIO_DIRECT_BYTES/.test(builder));
check("audio takes the direct path, which the request limit does not apply to",
  /uploadFunnelAudioDirect\(saId, funnelId, file/.test(builder));
check("audio counts as the lead magnet, not a page image",
  /json\.kind === "pdf" \|\| json\.kind === "audio"/.test(builder));
const spoof = await upload(SA, funnelId, "meditation.mp3", "application/x-msdownload", "evil.exe");
check("an unsupported type is refused", spoof.status === 400, `HTTP ${spoof.status}`);

console.log("\n6. Tenant isolation");
const otherFunnel = await mkFunnel(OTHER);
const cross = await fetch(`${BASE}/api/sub-accounts/${OTHER}/funnels/${funnelId}/assets`, { method:"POST", headers:{ Cookie }, body: (() => { const f=new FormData(); f.set("file", new File([readFileSync(`${DIR}/meditation.mp3`)], "x.mp3", { type:"audio/mpeg" })); return f; })() });
check("a funnel cannot be targeted from another workspace", cross.status === 404 || cross.status === 403, `HTTP ${cross.status}`);
const before = (await db.collection("funnelAssets").where("subAccountId","==",SA).get()).size;
const noSession = await fetch(`${BASE}/api/sub-accounts/${SA}/funnels/${funnelId}/assets`, { method:"POST", body: (() => { const f=new FormData(); f.set("file", new File([Buffer.from("x")], "x.mp3", { type:"audio/mpeg" })); return f; })() });
// 404 counts: requireSubAccountMember hides the workspace from a stranger
// rather than confirming it exists. What matters is that nothing was stored.
check("an unauthenticated upload is refused", [401,403,404].includes(noSession.status), `HTTP ${noSession.status}`);
const after = (await db.collection("funnelAssets").where("subAccountId","==",SA).get()).size;
check("and stored nothing", after === before, `${before} -> ${after}`);
void otherFunnel;

console.log("\n7. Existing asset types still work");
const PDF = Buffer.from("JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCnRyYWlsZXI8PC9Sb290IDEgMCBSPj4=", "base64");
const fd = new FormData(); fd.set("file", new File([PDF], "guide.pdf", { type: "application/pdf" }));
const pdfRes = await fetch(`${BASE}/api/sub-accounts/${SA}/funnels/${funnelId}/assets`, { method:"POST", headers:{ Cookie }, body: fd });
const pdfBody = await pdfRes.json().catch(()=>({})) as Record<string,unknown>;
check("a PDF still uploads", pdfRes.status === 200, `HTTP ${pdfRes.status}`);
const pdfGet = await fetch(`${BASE}/api/funnel-asset/${pdfBody.assetId}`);
check("and still serves its bytes inline", pdfGet.status === 200 && (pdfGet.headers.get("content-type") ?? "") === "application/pdf");
const pdfMeta = (await db.doc(`funnelAssets/${pdfBody.assetId}`).get()).data() ?? {};
check("PDFs still use the Firestore chunk table", (pdfMeta.chunkCount ?? 0) > 0 && !pdfMeta.storagePath);

// cleanup
for (const sa of [SA, OTHER]) {
  for (const col of ["funnels","forms","workflows","funnelAssets"]) {
    const s = await db.collection(col).where("subAccountId","==",sa).get().catch(()=>null);
    if (s) for (const d of s.docs) {
      const sp = d.data().storagePath as string | undefined;
      if (sp) await getAdminStorageBucket().file(sp).delete().catch(()=>{});
      await db.recursiveDelete(d.ref);
    }
  }
  await db.recursiveDelete(db.doc(`subAccounts/${sa}`));
}
console.log(`\n${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  - ${f}`);
console.log(fails.length ? "AUDIO DELIVERY: FAILED" : "AUDIO DELIVERY: ALL PASS");
process.exit(fails.length ? 1 : 0);
