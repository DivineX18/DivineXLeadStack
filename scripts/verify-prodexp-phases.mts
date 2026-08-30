/**
 * PRODUCTION EXPERIENCE 2.0 — Phase C-G smoke.
 *
 * Every customer-facing surface renders, Zeno is native to the shell, the
 * contextual entry point resolves tenant-safely, and no page still paints
 * hard-coded colours instead of the design tokens.
 *
 * Run: ASCEND_SHELL_MODE_OVERRIDE=full_ascend pnpm dev -p 3112, then
 *      NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-prodexp-phases.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.E2E_BASE ?? "http://localhost:3112";
const WORKSPACE = process.env.E2E_WORKSPACE ?? "MEYB8CbWlE5fxAn3TJOp";
const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
let failures = 0;
const check = (l: string, ok: boolean, note = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${note ? ` — ${note}` : ""}`); if (!ok) failures++; };

const ct = await getAdminAuth().createCustomToken(UID);
const tk = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }) });
const { idToken } = (await tk.json()) as { idToken: string };
const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = `${(login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ")}; active_workspace_id=${WORKSPACE}`;

const PAGES: [string, string][] = [
  ["Home", "/app/home"], ["Campaigns", "/app/campaigns"], ["CRM", "/app/crm"],
  ["Intelligence", "/app/intelligence"], ["Brand & Assets", "/app/brand"],
  ["Zeno", "/app/zeno"], ["Settings", "/app/settings"],
];
const bodies = new Map<string, string>();
for (const [label, path] of PAGES) {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
  const html = r.ok ? await r.text() : "";
  bodies.set(path, html);
  check(`1. ${label} renders`, r.ok && html.length > 2000, `status ${r.status}`);
}

// Zeno is native to the shell, not a bounce out of it.
const home = bodies.get("/app/home") ?? "";
check("2. Home links to Zeno inside the shell", home.includes('href="/app/zeno"'));
check("2b. Nothing links out to the legacy /sa/*/ai-suite from the shell", !home.includes("/ai-suite"));

// Contextual entry resolves the real campaign, tenant-checked.
const funnels = await getAdminDb().collection("funnels").where("subAccountId", "==", WORKSPACE).limit(1).get();
const mine = funnels.docs[0]?.id;
if (mine) {
  const r = await fetch(`${BASE}/app/zeno?funnel=${mine}`, { headers: { cookie } });
  const html = await r.text();
  check("3. Zeno names the campaign you arrived from", r.ok && html.includes("Working on"), `status ${r.status}`);
}
const foreign = await getAdminDb().collection("funnels").where("subAccountId", "==", "x4NOJFn8bTyav7OeJc1v").limit(1).get();
const other = foreign.docs[0]?.id;
if (other) {
  const r = await fetch(`${BASE}/app/zeno?funnel=${other}`, { headers: { cookie } });
  const html = await r.text();
  check("3b. TENANT ISOLATION: another workspace's campaign is never named", r.ok && !html.includes("Working on"), `status ${r.status}`);
}

// Design-system consistency: no page paints raw white over the tokens.
for (const [path, html] of bodies) {
  const raw = /class="[^"]*(?:text-white\/|border-white\/|bg-white\/)/.test(html);
  check(`4. ${path} uses design tokens, not hard-coded colours`, !raw);
}
check("5. Reduced motion honoured globally", readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8").includes("prefers-reduced-motion"));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
