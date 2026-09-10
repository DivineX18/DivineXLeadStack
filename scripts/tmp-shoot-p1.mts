import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "https://flow-growth-scan-staging.onrender.com";
const OUT = process.env.OUT ?? "/private/tmp/claude-501/-Users-boss-DivineXLeadStack/d8e4013d-3f9f-4444-a370-b982aa09e06a/scratchpad/p1-shots";
mkdirSync(OUT, { recursive: true });

const PAGES = [
  "qa-p1-A-free-assessment",
  "qa-p1-B-lead-gen",
  "qa-p1-C-paid-offer",
  "qa-p1-D-paid-chain",
  "qa-p1-D-upsell-step",
];

const browser = await chromium.launch();
for (const id of PAGES) {
  for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const res = await page.goto(`${BASE}/lp/${id}`, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => null);
    const status = res?.status() ?? 0;
    await page.waitForTimeout(2500);
    const file = `${OUT}/${id}.${name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const box = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: window.innerWidth }));
    const overflow = box.w > box.vw + 2;
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    console.log(`${id} ${name}: http=${status} page=${box.w}x${box.h} hOverflow=${overflow} chars=${text.length}`);
    if (name === "desktop") console.log(`   text: ${text.slice(0, 260)}`);
    await ctx.close();
  }
}
await browser.close();
console.log(`\nshots in ${OUT}`);
process.exit(0);
