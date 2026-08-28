// A/B/C certification screenshots — full-page captures of the live site.
// A = [v6] baselines (pre-BRE), B/C from .bre-certify.json.
// Run: node scripts/bre-shoot.mjs <outDir>
import puppeteer from "puppeteer-core";
import { readFileSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] || "./bre-shots";
mkdirSync(OUT, { recursive: true });

const BASELINES = {
  "spending-reset-a": "MUWNMXIxvJhFjWnWvjqw",
  "skincare-a": "suKyXznh4SXT9fn51JgZ",
  "dentist-a": "i8YaXC6kjEbMAwLvtS93",
  "enterprise-security-a": "HIsPy6iTij1kANrcfAvK",
};
const bc = JSON.parse(readFileSync(new URL("../.bre-certify.json", import.meta.url), "utf8"));
const only = process.argv[3]; // e.g. "-d" -> only keys ending in -d
const targets = [
  ...Object.entries(BASELINES).map(([k, id]) => ({ k, id })),
  ...Object.entries(bc).map(([k, id]) => ({ k, id })),
].filter((t) => !only || t.k.endsWith(only));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
for (const t of targets) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  try {
    const resp = await page.goto(`https://crm.divinex.io/lp/${t.id}`, { waitUntil: "networkidle0", timeout: 90_000 });
    // Scroll through so IntersectionObserver entrance animations fire.
    await page.evaluate(async () => {
      const step = 500;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 110));
      }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 400));
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 1100));
    await page.screenshot({ path: `${OUT}/${t.k}.png`, fullPage: true });
    // Above-the-fold judgment: realistic desktop viewport crop.
    await page.screenshot({ path: `${OUT}/${t.k}--fold.png`, fullPage: false });
    // Mobile.
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.reload({ waitUntil: "networkidle0", timeout: 90_000 });
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: `${OUT}/${t.k}--mobile.png`, fullPage: true });
    console.log(`${t.k}: ${resp?.status()} -> full + fold + mobile`);
  } catch (e) {
    console.log(`${t.k}: FAILED ${e.message}`);
  }
  await page.close();
}
await browser.close();
console.log("done");
