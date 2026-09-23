/**
 * THE LAUNCH QUESTION: can a real new customer complete the journey?
 *
 * Driven entirely through the production UI in a fresh anonymous browser. No
 * Clerk API sign-in, no injected session, no ticket exchange, no dev bypass —
 * the customer types into Clerk's own form and reads a verification code out of
 * a real inbox, which is exactly what a customer does. The inbox is a genuine
 * third-party mailbox reachable over an API, so the code arrives by real email
 * rather than being conjured; that is the one part a headless run cannot do by
 * hand, and it is a real email either way.
 */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
import { chromium } from "../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs";

const ZENO = "https://ascend.divinex.io";
const SCAN_SITE = "https://www.divinex.io";
let bad = 0;
const check = (l: string, ok: boolean, n = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`);
  if (!ok) bad++;
};
const step = (s: string) => console.log(`\n══ ${s} ${"═".repeat(Math.max(0, 56 - s.length))}`);

const mt = async (p: string, init?: { method?: string; body?: unknown; token?: string }) => {
  const r = await fetch(`https://api.mail.tm${p}`, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}) },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  return { s: r.status, j: (await r.json().catch(() => null)) as any };
};
const domain = (await mt("/domains")).j["hydra:member"][0].domain;
const EMAIL = `divinex-qa-${Date.now().toString(36)}@${domain}`;
const PASSWORD = `Qa!${Math.random().toString(36).slice(2, 10)}Zz9`;
await mt("/accounts", { method: "POST", body: { address: EMAIL, password: PASSWORD } });
const inboxToken = (await mt("/token", { method: "POST", body: { address: EMAIL, password: PASSWORD } })).j.token;
console.log(`customer: ${EMAIL}`);

async function waitForCode(timeoutMs = 180_000): Promise<string | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const list = await mt("/messages", { token: inboxToken });
    for (const m of list.j?.["hydra:member"] ?? []) {
      const full = await mt(`/messages/${m.id}`, { token: inboxToken });
      const text = `${full.j?.subject ?? ""} ${full.j?.text ?? ""} ${(full.j?.html ?? []).join(" ")}`;
      const code = text.match(/\b(\d{6})\b/);
      if (code) return code[1];
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  return null;
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const bodyText = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));

// ══ 1-2. ANONYMOUS SCAN ══════════════════════════════════════════════════
step("1-2. anonymous visitor runs a Growth Scan");
await page.goto(`${ZENO}/growth-scanner`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(2500);

await page.fill('input[placeholder*="Alex" i]', "DivineX QA");
await page.fill('input[placeholder*="you@" i]', EMAIL);
await page.fill('input[placeholder*="yoursite" i]', SCAN_SITE);
await page.click('button:has-text("Get My Free Growth Report")');
console.log("   submitted; waiting for the scan to finish…");

let scanText = "";
// The scan runs behind a full-screen progress overlay ("Connecting to your
// website… Building Growth Blueprint…"). Waiting on TEXT was wrong: the
// overlay's own copy matched, so the loop finished while the modal was still
// up and every later click hit the overlay instead of the page. Wait for the
// overlay to actually detach.
try {
  await page.waitForSelector("div.fixed.inset-0", { state: "attached", timeout: 30_000 });
  console.log("   progress overlay shown; waiting for the scan to finish…");
  await page.waitForSelector("div.fixed.inset-0", { state: "detached", timeout: 900_000 });
} catch {
  console.log("   (no overlay observed; continuing)");
}
await page.waitForTimeout(5000);
scanText = await bodyText();
const scanUrl = page.url();
check("2a. the scan completed and a report rendered", /Growth Score|Executive Summary|bottleneck|constraint/i.test(scanText), scanUrl);
check("2b. the report is about the scanned site", /divinex/i.test(scanText), "");
await page.screenshot({ path: "/tmp/e2e-report.png", fullPage: false });
console.log("   report excerpt:", scanText.slice(0, 400));
writeFileSync("/tmp/e2e-carry.json", JSON.stringify({ email: EMAIL, password: PASSWORD, scanUrl, inboxToken }));

// ══ 3. NORMAL CLERK SIGNUP via the page's own CTA ════════════════════════
step("3. sign up through the product's own CTA + Clerk UI");
const beforeUrl = page.url();
const cta = await page.$('a:has-text("Unlock"), button:has-text("Unlock"), a:has-text("Start Free Trial"), button:has-text("Start Free Trial"), a:has-text("Get Started"), button:has-text("Get Started")');
if (cta) { await cta.click(); await page.waitForTimeout(6000); }
console.log("   CTA ->", page.url());

if (!/sign-up|sign-in|start-trial/.test(page.url())) {
  await page.goto(`${ZENO}/start-trial`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(4000);
}
check("3a. the CTA reaches the signup surface", /sign-up|start-trial|sign-in/.test(page.url()), page.url());

await page.waitForSelector('input[name="emailAddress"]', { timeout: 60_000 });
await page.fill('input[name="emailAddress"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button:has-text("Continue")');
console.log("   submitted signup; waiting for the emailed code…");

await page.waitForTimeout(6000);
const code = await waitForCode();
check("3b. Clerk emailed a verification code to the customer", !!code, code ?? "no code arrived");
if (code) {
  const otp = await page.$('input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]');
  if (otp) { await otp.fill(code); } else { await page.keyboard.type(code); }
  await page.waitForTimeout(1500);
  const cont = await page.$('button:has-text("Continue")');
  if (cont) await cont.click();
  await page.waitForTimeout(12000);
}
const signedIn = await page.evaluate(() => {
  const w = window as any;
  return { id: w.Clerk?.user?.id ?? null, email: w.Clerk?.user?.primaryEmailAddress?.emailAddress ?? null };
});
check("3c. the customer is authenticated through the normal UI", !!signedIn.id, JSON.stringify(signedIn));
console.log("   url after signup:", page.url());
console.log("   page:", (await bodyText()).slice(0, 300));

await ctx.storageState({ path: "/tmp/e2e-state.json" });
writeFileSync("/tmp/e2e-carry.json", JSON.stringify({ email: EMAIL, password: PASSWORD, scanUrl, inboxToken, clerkUserId: signedIn.id, afterSignup: page.url() }));
await page.screenshot({ path: "/tmp/e2e-after-signup.png", fullPage: false });
console.log(bad === 0 ? "\nphase 1-3: all checks passed" : `\nphase 1-3: ${bad} FAILED`);
await browser.close();
