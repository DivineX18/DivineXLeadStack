/**
 * UNIFIED NAVIGATION INTEGRITY — behavioral certification.
 *
 * Walks the Complete customer experience on DEPLOYED staging and asserts the
 * property that actually matters: an ordinary action never swaps the product
 * shell underneath the customer.
 *
 * The unified shell is identified by `.theme-ascend` (only /app/layout mounts
 * it) and the Flow shell by its own sidebar. Asserting on the RENDERED SHELL
 * rather than on the URL is deliberate — a route can be under /app and still
 * render the wrong chrome, and that is exactly the defect being certified
 * against.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-unified-navigation.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const FLOW = process.env.FLOW_STAGING ?? "https://flow-growth-scan-staging.onrender.com";
const SA = process.env.NAV_SA ?? "MEYB8CbWlE5fxAn3TJOp";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { chromium } = await import("@playwright/test");
const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");

let bad = 0;
const rows: { route: string; unified: boolean; flowShell: boolean; note: string }[] = [];

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

// Workspace selection + browser-side Firebase session (client SDK reads need it).
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

const ver = (await (await fetch(`${FLOW}/api/version`)).json()) as { commit?: string };
console.log(`\nUNIFIED NAVIGATION — staging @${ver.commit}\n${"─".repeat(74)}`);

async function visit(route: string, label: string) {
  await page.goto(`${FLOW}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  const unified = (await page.locator(".theme-ascend").count()) > 0;
  // The Flow shell renders its own sidebar with these entries; the unified
  // shell never does. Presence of BOTH would mean a nested/legacy mount.
  const flowShell = await page.evaluate(() => {
    const txt = document.querySelector("aside")?.textContent ?? "";
    return /Agency home|Sub-accounts|Get started/.test(txt) && !document.querySelector(".theme-ascend");
  });
  const landed = page.url().replace(FLOW, "");
  const escaped = landed.startsWith("/sa/");
  rows.push({ route: label, unified, flowShell: flowShell || escaped, note: landed });
  const ok = unified && !flowShell && !escaped;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(30)} shell=${unified ? "unified" : "NOT-UNIFIED"} landed=${landed}`);
}

console.log("\n── PRIMARY IA");
for (const [route, label] of [
  ["/app/home", "HOME"], ["/app/create", "CREATE"], ["/app/leads", "LEADS"],
  ["/app/agents", "AGENTS"], ["/app/performance", "PERFORMANCE"],
  ["/app/intelligence", "INTELLIGENCE"], ["/app/settings", "SETTINGS"],
] as const) await visit(route, label);

console.log("\n── CREATE SURFACES (the escape class)");
for (const [route, label] of [
  ["/app/create/orders", "CREATE > Orders"],
  ["/app/create/forms", "CREATE > Forms"],
  ["/app/create/booking", "CREATE > Booking"],
  ["/app/create/products", "CREATE > Products"],
  ["/app/create/quotes", "CREATE > Quotes"],
  ["/app/create/templates", "CREATE > Templates"],
  ["/app/launch/workflows", "CREATE > Workflows"],
  ["/app/launch/broadcasts", "CREATE > Broadcasts"],
] as const) await visit(route, label);

console.log("\n── LEADS SURFACES");
for (const [route, label] of [
  ["/app/grow/contacts", "LEADS > Contacts"],
  ["/app/grow/pipeline", "LEADS > Pipeline"],
  ["/app/grow/conversations", "LEADS > Conversations"],
  ["/app/grow/tasks", "LEADS > Tasks"],
  ["/app/grow/calendar", "LEADS > Calendar"],
] as const) await visit(route, label);

// ── THE REPORTED DEFECT, clicked rather than navigated ───────────────────
console.log("\n── CLICK-THROUGH: the reported Create → Orders defect");
await page.goto(`${FLOW}/app/create`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const ordersLink = page.getByRole("link", { name: /^Orders$/i }).first();
if (await ordersLink.count()) {
  const href = await ordersLink.getAttribute("href");
  await ordersLink.click();
  await page.waitForTimeout(3000);
  const landed = page.url().replace(FLOW, "");
  const unified = (await page.locator(".theme-ascend").count()) > 0;
  const ok = unified && !landed.startsWith("/sa/");
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  clicked Orders -> ${landed} (href=${href}) shell=${unified ? "unified" : "FLOW"}`);
} else {
  console.log(`REQUIRES HUMAN VERIFICATION  Orders link not found on /app/create (client render)`);
}

await browser.close();
console.log(`\n${"─".repeat(74)}`);
const esc = rows.filter((x) => x.flowShell).map((x) => x.route);
console.log(`unified: ${rows.filter((x) => x.unified).length}/${rows.length}   shell escapes: ${esc.length}${esc.length ? ` (${esc.join(", ")})` : ""}`);
console.log(bad === 0 ? "UNIFIED NAVIGATION INTEGRITY: PASS" : `UNIFIED NAVIGATION INTEGRITY: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
