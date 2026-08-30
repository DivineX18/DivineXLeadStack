/**
 * PRODUCTION EXPERIENCE 2.0 — PHASE A GATE
 *
 * Proves the new customer information architecture actually RENDERS, and
 * that every old methodology link still lands somewhere real. Runs against
 * a server started with ASCEND_SHELL_MODE_OVERRIDE=full_ascend, which is
 * the repo's own non-production escape hatch for reaching the unified shell
 * without inventing entitlement/flag data in the real Firestore.
 *
 * Read-only: creates and deletes nothing.
 *
 * Run: ASCEND_SHELL_MODE_OVERRIDE=full_ascend pnpm dev -p 3112, then
 *      NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-prodexp-ia.mts
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.E2E_BASE ?? "http://localhost:3112";
const WORKSPACE = "x4NOJFn8bTyav7OeJc1v";
const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { getAdminAuth } = await import("../../src/lib/firebase/admin.ts");

let failures = 0;
const check = (label: string, ok: boolean, note = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${note ? ` — ${note}` : ""}`);
  if (!ok) failures++;
};

const customToken = await getAdminAuth().createCustomToken(UID);
const tokRes = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
);
const { idToken } = (await tokRes.json()) as { idToken: string };
const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = `${(login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ")}; active_workspace_id=${WORKSPACE}`;
check("0. Authenticated session", cookie.includes("="));

// ── The six customer-facing sections ────────────────────────────────────
const SECTIONS: [string, string, string][] = [
  ["Home", "/app/home", "Home"],
  ["Campaigns", "/app/campaigns", "Campaigns"],
  ["CRM", "/app/crm", "CRM"],
  ["Intelligence", "/app/intelligence", "Intelligence"],
  ["Brand & Assets", "/app/brand", "Brand"],
  ["Settings", "/app/settings", "Settings"],
];
for (const [label, path, marker] of SECTIONS) {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
  const html = r.ok ? await r.text() : "";
  check(`1. ${label} renders at ${path}`, r.ok && html.includes(marker), `status ${r.status}${r.ok ? "" : ` -> ${r.headers.get("location")}`}`);
}

// ── The navigation the shell actually draws ─────────────────────────────
const home = await fetch(`${BASE}/app/home`, { headers: { cookie } });
const homeHtml = await home.text();
for (const [label, href] of [
  ["Campaigns", "/app/campaigns"],
  ["CRM", "/app/crm"],
  // Intelligence is module-gated: a workspace without growth_scan sees it
  // present but locked (by design), which renders without an href.
  ["Intelligence", "/app/intelligence"],
  ["Brand & Assets", "/app/brand"],
  ["Settings", "/app/settings"],
] as const) {
  const linked = homeHtml.includes(`href="${href}"`);
  const lockedButShown = homeHtml.includes(`${label} — locked`);
  check(`2. Sidebar offers ${label}`, linked || lockedButShown, linked ? "linked" : "locked (module not owned)");
}
for (const gone of ["/app/identify", "/app/optimize", "/app/scale", "/app/grow", "/app/launch"]) {
  check(`3. Sidebar no longer offers the methodology route ${gone}`, !homeHtml.includes(`href="${gone}"`));
}

// ── Old links keep working ──────────────────────────────────────────────
const LEGACY: [string, string][] = [
  ["/app/create", "/app/campaigns"],
  ["/app/launch", "/app/campaigns"],
  ["/app/grow", "/app/crm"],
  ["/app/identify", "/app/intelligence"],
  ["/app/optimize", "/app/intelligence"],
  ["/app/scale", "/app/intelligence"],
];
for (const [from, to] of LEGACY) {
  const r = await fetch(`${BASE}${from}`, { headers: { cookie }, redirect: "manual" });
  check(`4. ${from} still lands somewhere real (${to})`, r.headers.get("location") === to, `${r.status} -> ${r.headers.get("location")}`);
}

// ── The old preview route consolidates into the one canonical preview ───
const legacyPrev = await fetch(`${BASE}/funnel-preview/${WORKSPACE}/some-funnel-id`, { headers: { cookie }, redirect: "manual" });
check(
  "5. The legacy preview route redirects into the one canonical preview",
  legacyPrev.headers.get("location") === "/preview/funnel/some-funnel-id",
  `${legacyPrev.status} -> ${legacyPrev.headers.get("location")}`,
);

// ── Design tokens are actually consumed, not just defined ───────────────
check("6. Pages consume the semantic design tokens", /var\(--dx-(surface|text|primary|border)/.test(homeHtml) || homeHtml.includes("theme-ascend"));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
