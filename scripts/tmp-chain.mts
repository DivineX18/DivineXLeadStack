import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.BASE ?? "https://flow-growth-scan-staging.onrender.com";
const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const uid = process.env.UID ?? "irkY5HKIzxb64l5qCyHroTrudJa2";
const ct = await getAdminAuth().createCustomToken(uid);
const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }) });
const { idToken } = (await r.json()) as { idToken: string };
const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
let cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

const start = process.env.START ?? "/dashboard";
console.log(`FOLLOWING CHAIN from ${start} on ${BASE} (uid ${uid}, NO active_workspace_id)\n`);
let path = start;
const seen: string[] = [];
for (let hop = 0; hop < 12; hop++) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
  // Mirror the browser: adopt any cookie the server sets (middleware sets
  // active_workspace_id on a /sa/... visit).
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const name = pair.slice(0, pair.indexOf("="));
    cookie = cookie.split("; ").filter((x) => !x.startsWith(`${name}=`)).concat(pair).join("; ");
  }
  const loc = res.headers.get("location");
  console.log(`  hop ${hop}: ${path} -> ${res.status}${loc ? ` Location: ${loc}` : " (rendered)"}`);
  if (seen.includes(path)) { console.log("  !! LOOP DETECTED"); break; }
  seen.push(path);
  if (!loc) {
    const html = await res.text();
    const flow = ["Getting Started", "Pipeline snapshot", "New deal"].some((m) => html.includes(m));
    const ascend = ["ascend-main", "theme-ascend"].some((m) => html.includes(m));
    console.log(`  FINAL: ${path} | flowChrome=${flow} ascendChrome=${ascend}`);
    break;
  }
  path = loc.startsWith("http") ? new URL(loc).pathname + new URL(loc).search : loc;
}
process.exit(0);
