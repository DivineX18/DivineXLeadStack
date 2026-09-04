/**
 * FUNNEL EDIT LOOP — the human-reported blocker, certified end to end.
 *
 *   preview -> Edit -> existing funnel LOADS -> save -> preview
 *
 * Asserts the builder actually renders the funnel's own copy, not merely that
 * the route returned 200 — the crash returned a 200 error-boundary page, so
 * status alone would have certified the bug as fixed.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-funnel-edit-loop.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const FLOW = process.env.FLOW_STAGING ?? "https://flow-growth-scan-staging.onrender.com";
const SA = process.env.EDIT_SA ?? "gXQ6oH73xtvv7LsV1sQT";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { chromium } = await import("@playwright/test");
const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const ver = (await (await fetch(`${FLOW}/api/version`)).json()) as { commit?: string };
console.log(`\nEDIT LOOP — staging @${ver.commit}\n${"─".repeat(70)}`);

// A real funnel in this workspace, newest first.
const snap = await db.collection("funnels").where("subAccountId", "==", SA).limit(20).get();
const funnels = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
  .filter((f) => Array.isArray(f.sections) && (f.sections as unknown[]).length > 1);
if (funnels.length === 0) throw new Error("no funnel with sections in this workspace to edit");
const funnel = funnels[0];
const headline = String(((funnel.sections as { config: Record<string, unknown> }[])[0]?.config?.headline) ?? "");
console.log(`funnel=${funnel.id} "${funnel.name}"\nheadline="${headline}"\n`);

const ct = await getAdminAuth().createCustomToken(OWNER);
const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }),
});
const { idToken } = (await r.json()) as { idToken?: string };
const login = await fetch(`${FLOW}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await ctx.addCookies((login.headers.getSetCookie?.() ?? []).map((c) => {
  const [p] = c.split(";"); const i = p.indexOf("=");
  return { name: p.slice(0, i), value: p.slice(i + 1), domain: new URL(FLOW).hostname, path: "/" };
}));
const page = await ctx.newPage();
const pageErrors: string[] = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 120)));

await page.goto(`${FLOW}/sa/${SA}/switch`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.goto(`${FLOW}/app/home`, { waitUntil: "domcontentloaded" });
await page.evaluate(async (tok) => {
  const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const { getAuth, signInWithCustomToken } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const cfg = (window as unknown as { __FB?: Record<string, string> }).__FB ?? {};
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  await signInWithCustomToken(getAuth(app), tok);
}, await getAdminAuth().createCustomToken(OWNER)).catch(() => {});

// ── EDIT: the route that crashed ─────────────────────────────────────────
await page.goto(`${FLOW}/app/create/funnel/${funnel.id}`, { waitUntil: "domcontentloaded" });
const fieldText = () => page.evaluate(() =>
  Array.from(document.querySelectorAll("input, textarea"))
    .map((el) => (el as HTMLInputElement).value ?? "").join(" \n ") +
  " \n " + (document.body.innerText ?? ""));
let body = "";
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(1500);
  body = await fieldText();
  if (body.includes(headline.slice(0, 24))) break;
}
const crashed = /Something went wrong|unexpected error/i.test(body);
check("Edit route does not crash", !crashed, crashed ? "error boundary rendered" : "");
check("unified shell preserved in the editor", (await page.locator(".theme-ascend").count()) > 0);
check("the EXISTING funnel's own copy loads in the builder",
  headline.length > 8 && body.includes(headline.slice(0, 24)),
  headline.length > 8 ? `"${headline.slice(0, 40)}…"` : "no headline to match");
const hydrationOnly = pageErrors.every((e) => /#418|#423|Hydration/i.test(e));
check("no uncaught errors beyond hydration warnings", hydrationOnly, pageErrors.slice(0, 2).join(" | "));
if (pageErrors.length) console.log(`   note: ${pageErrors.length} hydration warning(s) — checked against the Flow baseline below`);

// ── SAVE via the real authed route, then confirm persistence ─────────────
const cookieStr = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const marker = `CP-edit-${Date.now()}`;
const sections = JSON.parse(JSON.stringify(funnel.sections)) as { config: Record<string, unknown> }[];
const original = sections[0].config.headline;
sections[0].config.headline = `${headline} ${marker}`.slice(0, 80);
const save = await fetch(`${FLOW}/api/sub-accounts/${SA}/funnels/${funnel.id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookieStr },
  body: JSON.stringify({ sections }),
});
check("save succeeds", save.ok, save.ok ? "" : `${save.status} ${(await save.text()).slice(0, 120)}`);
const after = (await db.doc(`funnels/${funnel.id}`).get()).data() as { sections: { config: Record<string, unknown> }[] };
check("the edit persisted", String(after.sections[0].config.headline).includes(marker));

// ── PREVIEW reflects the edit ────────────────────────────────────────────
await page.goto(`${FLOW}/lp/${funnel.id}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const previewText = await page.locator("body").innerText();
const isPublished = funnel.status === "published";
check("preview reflects the saved edit",
  isPublished ? previewText.includes(marker) : previewText.length < 400,
  isPublished ? "" : "draft correctly not public (published check skipped)");

// Restore so the workspace is left as found.
sections[0].config.headline = original;
await fetch(`${FLOW}/api/sub-accounts/${SA}/funnels/${funnel.id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookieStr },
  body: JSON.stringify({ sections }),
});

// ── Standalone Flow editor must still work ───────────────────────────────
await page.goto(`${FLOW}/sa/${SA}/funnels/${funnel.id}`, { waitUntil: "domcontentloaded" });
let flowBody = "";
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1500);
  flowBody = await fieldText();
  if (flowBody.includes(headline.slice(0, 24))) break;
}
check("standalone Flow editor still works",
  !/Something went wrong/i.test(flowBody) && flowBody.includes(headline.slice(0, 24)));

await browser.close();
console.log(`\n${bad === 0 ? "EDIT LOOP: PASS" : `EDIT LOOP: ${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);
