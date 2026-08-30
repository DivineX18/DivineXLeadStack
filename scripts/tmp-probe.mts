import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("="); if (i > 0 && !line.startsWith("#")) process.env[line.slice(0,i).trim()] ??= line.slice(i+1).trim().replace(/^["']|["']$/g,"");
}
const A = "https://ascend-bi-growth-scan-staging.onrender.com";
const SECRET = process.env.ASCEND_SSO_SHARED_SECRET ?? "";
const H = { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` };
const stamp = Date.now();
const probeWorkspace = `e2e-probe-${stamp}`;

const r = await fetch(`${A}/api/divinex/resolve`, {
  method: "POST", headers: H,
  body: JSON.stringify({ flowSubAccountId: probeWorkspace, businessName: `[E2E PROBE ${stamp}] safe to delete` }),
});
const raw = await r.text();
console.log("resolve status:", r.status, "content-type:", r.headers.get("content-type"));
console.log("body (first 300):", raw.slice(0, 300));
let j: { ok?: boolean; businessProfileId?: number; error?: string } = {};
try { j = JSON.parse(raw); } catch { console.log("(not JSON)"); }
if (!j.businessProfileId) process.exit(1);
console.log("PROBE_PROFILE_ID=" + j.businessProfileId);
console.log("PROBE_WORKSPACE=" + probeWorkspace);
