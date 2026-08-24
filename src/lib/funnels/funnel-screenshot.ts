import "server-only";

/**
 * Best-effort headless screenshot of a rendered funnel page, for the visual
 * review (design-intelligence/visual-review.ts).
 *
 * Uses puppeteer-core + @sparticuz/chromium — the standard serverless-Chromium
 * pair that runs on Vercel. Both are OPTIONAL, LAZILY-loaded dependencies: if
 * they aren't installed, or Chromium can't launch, or the page fails to load,
 * this returns null and the visual review is simply skipped — the rest of the
 * pre-publish review layer (design score + copy/fabrication review) still works
 * and publish is never blocked.
 *
 * To ACTIVATE screenshots on the deploy:
 *   pnpm add puppeteer-core @sparticuz/chromium
 * and run the calling route on the Node runtime with headroom
 * (export const maxDuration = 60; ~1024MB memory). Until then this returns null
 * gracefully.
 */

export async function captureFunnelScreenshot(url: string): Promise<string | null> {
  try {
    // Optional deps resolved by NAME at runtime: the bundler never tries to
    // bundle them (build stays green whether or not they're installed), TS
    // treats them as `any` (no missing-module error, no banned @ts-comment), and
    // the try/catch turns "not installed" into a graceful null. Install on the
    // deploy to activate: `pnpm add puppeteer-core @sparticuz/chromium`.
    const optionalImport = (name: string) => import(/* webpackIgnore: true */ name);
    const chromiumMod = await optionalImport("@sparticuz/chromium");
    const puppeteerMod = await optionalImport("puppeteer-core");
    const chromium = chromiumMod.default ?? chromiumMod;
    const puppeteer = puppeteerMod.default ?? puppeteerMod;

    const browser = await puppeteer.launch({
      args: chromium.args,
      // Tall-ish viewport: captures the hero + the first few sections, where a
      // bland/flat look shows most — without a giant full-page image.
      defaultViewport: { width: 1280, height: 2000, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
      // Let fonts + entrance animations settle before the shot.
      await new Promise((r) => setTimeout(r, 1200));
      const buf = (await page.screenshot({ type: "png", fullPage: false })) as Buffer;
      return buf.toString("base64");
    } finally {
      await browser.close().catch(() => {});
    }
  } catch {
    return null;
  }
}
