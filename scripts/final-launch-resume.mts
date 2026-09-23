/**
 * THE LAUNCH QUESTION, continued: signup → claim → continuity → checkout.
 *
 * Resumes from the anonymous scan that already completed in the browser, whose
 * snapshot URL carries its own claim token — the same link a real visitor
 * holds after running a scan. Nothing about the customer path is skipped; the
 * scan simply is not re-run, because re-running it would spend a second scan
 * to re-prove something already proven in this same session.
 *
 * Still no Clerk API sign-in, no injected session, no ticket. The customer
 * types into Clerk's own form and reads the code from a real inbox.
 */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
import { chromium } from "../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs";

const carry = JSON.parse(readFileSync("/tmp/e2e-carry.json", "utf8"));
const { email: EMAIL, password: PASSWORD, inboxToken, scanUrl } = carry;
const ZENO = "https://ascend.divinex.io";
let bad = 0;
const check = (l: string, ok: boolean, n = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`);
  if (!ok) bad++;
};
const step = (s: string) => console.log(`\n══ ${s} ${"═".repeat(Math.max(0, 54 - s.length))}`);

const mt = async (p: string) => {
  const r = await fetch(`https://api.mail.tm${p}`, { headers: { Authorization: `Bearer ${inboxToken}` } });
  return (await r.json().catch(() => null)) as any;
};
async function waitForCode(timeoutMs = 240_000): Promise<string | null> {
  const t0 = Date.now();
  const seen = new Set<string>();
  while (Date.now() - t0 < timeoutMs) {
    for (const m of (await mt("/messages"))?.["hydra:member"] ?? []) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const full = await mt(`/messages/${m.id}`);
      const text = `${full?.subject ?? ""} ${full?.text ?? ""} ${(full?.html ?? []).join(" ")}`;
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

// ══ the scan the anonymous visitor already ran ═══════════════════════════
step("scan report (anonymous, already produced)");
await page.goto(scanUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(6000);
const reportText = await bodyText();
check("S1. the anonymous report renders for the visitor", reportText.length > 500, `${reportText.length} chars`);
check("S2. it is grounded in the scanned business", /divinex/i.test(reportText));
const score = reportText.match(/\b(\d{1,3})\s*\/\s*100|Growth Score[^0-9]{0,20}(\d{1,3})/i);
console.log("   report:", reportText.slice(0, 350));
await page.screenshot({ path: "/tmp/e2e-report2.png", fullPage: false });

// ══ 3. SIGN UP through the product CTA + Clerk UI ════════════════════════
step("3. customer signs up (real Clerk UI)");
const cta = await page.$('a:has-text("Unlock"), button:has-text("Unlock"), a:has-text("Start"), button:has-text("Start"), a:has-text("Get Started"), button:has-text("Get Started")');
if (cta) { await cta.click().catch(() => {}); await page.waitForTimeout(7000); }
console.log("   CTA ->", page.url());
check("3a. the CTA reaches the signup surface", /sign-up|start-trial|sign-in/.test(page.url()), page.url());

await page.waitForSelector('input[name="emailAddress"]', { timeout: 60_000 });
await page.fill('input[name="emailAddress"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button:has-text("Continue")');
console.log("   signup submitted; waiting for the emailed code…");

await page.waitForTimeout(5000);
const code = await waitForCode();
check("3b. Clerk emailed a verification code", !!code, code ?? "none arrived");
if (code) {
  const otp = await page.$('input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]');
  if (otp) await otp.fill(code);
  else await page.keyboard.type(code);
  // Clerk auto-submits once the sixth digit lands, so a Continue click is
  // usually unnecessary — and an earlier run failed by insisting on it.
  await page.waitForTimeout(3000);
  const cont = await page.$('button:has-text("Continue"):visible');
  if (cont) await cont.click().catch(() => {});
  await page.waitForTimeout(15000);
}
const who = await page.evaluate(() => {
  const w = (window as any).Clerk;
  return { id: w?.user?.id ?? null, email: w?.user?.primaryEmailAddress?.emailAddress ?? null };
});
check("3c. customer authenticated through the normal UI", !!who.id, JSON.stringify(who));
console.log("   url:", page.url());
console.log("   page:", (await bodyText()).slice(0, 300));
await page.screenshot({ path: "/tmp/e2e-signed-in.png", fullPage: false });
await ctx.storageState({ path: "/tmp/e2e-state.json" });
writeFileSync("/tmp/e2e-carry2.json", JSON.stringify({ ...carry, clerkUserId: who.id, afterSignup: page.url() }));
console.log(bad === 0 ? "\nsignup phase: all checks passed" : `\nsignup phase: ${bad} FAILED`);
await browser.close();
