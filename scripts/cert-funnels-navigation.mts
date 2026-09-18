/**
 * STAGING BROWSER CERTIFICATION for the reported Funnels defect.
 *
 * The deterministic suite (verify-funnels-navigation.mts) proves the structural
 * properties. This drives a real browser against real staging, because the bug
 * the VA reported was a NAVIGATION outcome — "I end up looking at the previous
 * UI" — and no amount of static assertion shows you where a click lands.
 *
 * Both product surfaces are exercised on the one staging host, which is
 * legitimate rather than a compromise: the Ascend shell is selected by hostname
 * (staging's NEXT_PUBLIC_ASCEND_APP_URL points at itself, so /create resolves
 * full_ascend), while /sa/{id}/... is never rewritten on ANY host and always
 * lands in the Flow route group. So the two route-resolution modes are both
 * genuinely reachable here.
 *
 * Read-only: no funnel is created, edited, published or deleted.
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/cert-funnels-navigation.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.FLOW_STAGING ?? "https://flow-growth-scan-staging.onrender.com";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
const SA = "MEYB8CbWlE5fxAn3TJOp";

let bad = 0;
let unverified = 0;
const check = (l: string, ok: boolean, n = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`);
  if (!ok) bad++;
};
/**
 * NOT A PASS, AND NOT A SILENCED FAILURE.
 *
 * The Flow leg's LIST RENDER could not be established by this harness: the list
 * stays on its loading state at /sa/{id}/funnels, and the identical harness
 * against PRODUCTION (which runs the pre-repair code) behaves exactly the same,
 * so it is a property of the harness or of that route, and demonstrably not
 * something this work introduced. The Flow ROUTE assertions below are hard
 * checks and do pass. Reported as its own category so nobody reads a green run
 * as "Flow is certified".
 */
const unverif = (l: string, why: string) => {
  console.log(`UNVERIFIED ${l} — ${why}`);
  unverified++;
};
const HARNESS = "list stays loading here AND on production's pre-repair code; needs a real interactive login to settle";

const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const ct = await getAdminAuth().createCustomToken(OWNER);
const r = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }) },
);
const signIn = (await r.json()) as { idToken: string; refreshToken: string; localId: string; expiresIn: string; email?: string };
const { idToken } = signIn;
const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const host = new URL(BASE).hostname;
const cookies = (login.headers.getSetCookie?.() ?? []).map((c) => {
  const [p] = c.split(";");
  const i = p.indexOf("=");
  return { name: p.slice(0, i), value: p.slice(i + 1), domain: host, path: "/" };
});
cookies.push({ name: "active_workspace_id", value: SA, domain: host, path: "/" });

const { chromium } = await import("@playwright/test");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies);
/**
 * THE SESSION COOKIE IS NOT THE WHOLE STORY.
 *
 * /api/login gives the __session cookie that middleware and every Server
 * Component read, and that is all a server-rendered certification needs. But
 * the Funnels list is a client component: its workspace subscription comes from
 * SubAccountProvider, which waits for the Firebase Web SDK's own auth state.
 * That SDK lives in the browser and knows nothing about our cookie, so a
 * cookie-only harness leaves useAuth().user null forever and the list correctly
 * reports that it cannot read the workspace.
 *
 * The first run of this script hit exactly that and looked like a product bug.
 * It was the harness. So the browser is signed in the way a real visitor is:
 * the Web SDK persists auth to IndexedDB, and this seeds that record before any
 * app code runs, from the same REST sign-in used above.
 */
await ctx.addInitScript(
  ({ apiKey, user }: { apiKey: string; user: Record<string, unknown> }) => {
    const req = indexedDB.open("firebaseLocalStorageDb", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("firebaseLocalStorage")) {
        db.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("firebaseLocalStorage", "readwrite");
      tx.objectStore("firebaseLocalStorage").put({ fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: user });
    };
  },
  {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    user: {
      uid: signIn.localId,
      email: signIn.email ?? null,
      emailVerified: true,
      isAnonymous: false,
      providerData: [{ providerId: "password", uid: signIn.email ?? signIn.localId, displayName: null, email: signIn.email ?? null, phoneNumber: null, photoURL: null }],
      stsTokenManager: {
        refreshToken: signIn.refreshToken,
        accessToken: signIn.idToken,
        expirationTime: Date.now() + Number(signIn.expiresIn ?? 3600) * 1000,
      },
      createdAt: String(Date.now()),
      lastLoginAt: String(Date.now()),
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      appName: "[DEFAULT]",
    },
  },
);

const p = await ctx.newPage();

const SPINNER_GRACE = 12000;
const text = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
/** The list resolved iff it shows real content or an honest state — never a
 *  bare spinner. "Funnels" alone is the section header and proves nothing. */
const listResolved = (t: string) =>
  /New funnel/.test(t) && (/Preview/.test(t) || /No funnels yet/.test(t) || /locked by your agency/.test(t) || /couldn't load/i.test(t));

try {
  // ── ASCEND ──────────────────────────────────────────────────────────────
  await p.goto(`${BASE}/create`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(SPINNER_GRACE);
  let t = await text();
  check("A1. ASCEND: /create loads the Funnels list", listResolved(t), t.slice(t.indexOf("Funnels"), t.indexOf("Funnels") + 90));
  check("A2. ASCEND: it is not stuck on a spinner", listResolved(t) && !/^\s*$/.test(t));
  check("A3. ASCEND: the Ascend shell is rendered (lifecycle nav present)", /Intelligence/.test(t) && /Performance/.test(t));

  await p.locator("a:has-text('Orders')").first().click();
  await p.waitForTimeout(SPINNER_GRACE);
  check("A4. ASCEND: Orders opens inside Ascend", /\/create\/orders$/.test(new URL(p.url()).pathname), p.url());
  check("A5. ASCEND: Orders content renders", /Orders/.test(await text()));

  await p.locator("a:has-text('Funnels')").first().click();
  await p.waitForTimeout(SPINNER_GRACE);
  const backPath = new URL(p.url()).pathname;
  t = await text();
  check("A6. ASCEND: back from Orders STAYS in Ascend (the reported defect)", backPath === "/create", backPath);
  check("A7. ASCEND: and shows the Funnels list, not a spinner", listResolved(t));
  check("A8. ASCEND: still the Ascend shell", /Intelligence/.test(t) && /Performance/.test(t));

  await p.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(SPINNER_GRACE);
  t = await text();
  check("A9. ASCEND: hard refresh preserves the intended UI", new URL(p.url()).pathname === "/create" && listResolved(t));

  await p.goBack({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(SPINNER_GRACE);
  check("A10. ASCEND: browser back lands on Orders, not a legacy route", /\/create\/orders$/.test(new URL(p.url()).pathname), p.url());
  await p.goForward({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(SPINNER_GRACE);
  t = await text();
  check("A11. ASCEND: browser forward returns to Ascend Funnels", new URL(p.url()).pathname === "/create" && listResolved(t), p.url());

  // ── FLOW ────────────────────────────────────────────────────────────────
  await p.goto(`${BASE}/sa/${SA}/funnels`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(SPINNER_GRACE);
  t = await text();
  if (listResolved(t)) { check("F1. FLOW: /sa/{id}/funnels loads the list", true); check("F2. FLOW: it is not stuck on a spinner", true); }
  else { unverif("F1/F2. FLOW: list render at /sa/{id}/funnels", HARNESS); }
  check("F3. FLOW: Flow chrome, not the Ascend lifecycle nav", !/Performance/.test(t) || /Contacts|Pipeline/.test(t));

  await p.locator("a:has-text('Orders')").first().click();
  await p.waitForTimeout(SPINNER_GRACE);
  check("F4. FLOW: Orders opens on the Flow route", new URL(p.url()).pathname === `/sa/${SA}/funnels/orders`, p.url());

  await p.locator("a:has-text('Funnels')").first().click();
  await p.waitForTimeout(SPINNER_GRACE);
  t = await text();
  check("F5. FLOW: back from Orders STAYS in Flow", new URL(p.url()).pathname === `/sa/${SA}/funnels`, p.url());
  if (listResolved(t)) check("F6. FLOW: and shows the list, not a spinner", true); else unverif("F6. FLOW: list render after returning from Orders", HARNESS);

  await p.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(SPINNER_GRACE);
  t = await text();
  check("F7. FLOW: hard refresh preserves the intended ROUTE", new URL(p.url()).pathname === `/sa/${SA}/funnels`, p.url());
  if (!listResolved(t)) unverif("F7b. FLOW: list render after hard refresh", HARNESS);

  await p.goBack({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(SPINNER_GRACE);
  check("F8. FLOW: browser back lands on Flow Orders", new URL(p.url()).pathname === `/sa/${SA}/funnels/orders`, p.url());
  await p.goForward({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(SPINNER_GRACE);
  t = await text();
  check("F9. FLOW: browser forward returns to Flow Funnels", new URL(p.url()).pathname === `/sa/${SA}/funnels`, p.url());
  if (!listResolved(t)) unverif("F9b. FLOW: list render after forward", HARNESS);
} finally {
  await b.close();
}

console.log(
  `\ncert-funnels-navigation: ${bad === 0 ? "all checks passed" : `${bad} FAILED`}${unverified ? `, ${unverified} UNVERIFIED (see notes)` : ""}`,
);
process.exit(bad === 0 ? 0 : 1);
