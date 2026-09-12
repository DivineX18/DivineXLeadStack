/**
 * Is the Ascend acquisition funnel actually collecting, in production?
 *
 * The events shipped before a GTM container existed, so they pushed into a
 * dataLayer nothing read. This proves the other half end to end: the container
 * loads, and every instrumented stage lands in the queue it consumes.
 *
 * Driven in a real browser deliberately. The tags are build-time inlined and
 * the pushes happen on mount, on click and on submit, so inspecting markup
 * proves nothing — the page has to actually run.
 *
 * WHAT IT SPENDS. One real Growth Scan (the only way to observe scan-completed
 * and results-viewed), against a site we own, from a dedicated address. The
 * trial-signup request is ABORTED in the browser after the event fires, so
 * checkout_started is observed without creating a Stripe session, a customer,
 * or a charge.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-gtm-collection.mts
 *   SKIP_SCAN=1 ... to run everything except the scan.
 */
const ASCEND = process.env.ASCEND_BASE ?? "https://app.divinex.io";
const FLOW = process.env.FLOW_BASE ?? "https://crm.divinex.io";
const SCAN_SITE = process.env.SCAN_SITE ?? "https://ascend.divinex.io";
const SCAN_EMAIL = process.env.SCAN_EMAIL ?? "hello+gtm-verify@divinex.io";
const SKIP_SCAN = process.env.SKIP_SCAN === "1";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

type DL = Array<Record<string, unknown>>;

/**
 * GTM pushes its own entries (`gtm.click`, `gtm.linkClick`) carrying live DOM
 * nodes, and a React-rendered node closes a cycle through its fiber — so
 * stringifying the whole dataLayer throws once GTM is actually installed. Only
 * scalar properties are ever read, so they are flattened inside the page and
 * nothing structural crosses the boundary.
 */
const readDataLayer = (page: import("@playwright/test").Page): Promise<DL> =>
  page.evaluate(() => {
    const raw = ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []) as Array<Record<string, unknown>>;
    return raw.map((entry) => {
      const flat: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(entry ?? {})) {
        if (v === null || ["string", "number", "boolean"].includes(typeof v)) flat[k] = v;
      }
      return flat;
    });
  });
const eventsIn = (dl: DL) => dl.map((e) => String(e.event ?? "")).filter(Boolean);
const countOf = (dl: DL, name: string) => eventsIn(dl).filter((e) => e === name).length;
const propsOf = (dl: DL, name: string) => {
  const { event: _e, ...rest } = dl.find((d) => d.event === name) ?? {};
  void _e;
  return rest;
};
/** Nothing identifying may ever ride an event. Asserted on the whole queue. */
const assertClean = (dl: DL, where: string) => {
  const blob = JSON.stringify(dl);
  for (const forbidden of ["@", SCAN_SITE, "overallScore", "primaryConstraint", "websiteUrl", "scoreLabel"]) {
    check(`${where}: no "${forbidden}" in the payload`, !blob.includes(forbidden));
  }
};

const { chromium } = await import("@playwright/test");
const browser = await chromium.launch();

/** A transient ERR_NETWORK_CHANGED once cost a full run (and a real scan), so
 *  navigation retries rather than aborting the battery. */
async function goto(page: import("@playwright/test").Page, url: string) {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
    } catch (e) {
      last = e;
      await page.waitForTimeout(3000);
    }
  }
  throw last;
}

/**
 * Poll for an event on an interval rather than with waitForFunction.
 *
 * waitForFunction polls on requestAnimationFrame, which the browser throttles
 * hard on a backgrounded tab — a 9-minute budget gave up after 30 seconds on a
 * scan that completed fine at 260. An explicit interval is immune to that, and
 * a timeout here returns rather than throwing so the check that follows is the
 * thing that reports the failure.
 */
async function waitForEvent(page: import("@playwright/test").Page, event: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const seen = await page
      .evaluate(
        (name) =>
          (((window as unknown as { dataLayer?: Array<{ event?: string }> }).dataLayer ?? []) as Array<{ event?: string }>)
            .some((e) => e.event === name),
        event,
      )
      .catch(() => false);
    if (seen) return true;
    await page.waitForTimeout(5000);
  }
  return false;
}

try {
  // ── 1. The container is installed on both brands ─────────────────────────
  console.log("\n── GTM is installed ──");
  for (const [name, base] of [["ascend", ASCEND], ["flow", FLOW]] as const) {
    const html = await (await fetch(base)).text();
    const ids = [...new Set(html.match(/GTM-[A-Z0-9]+/g) ?? [])];
    check(`${name}: a GTM container is present`, ids.length === 1, ids.join(",") || "none");
    check(`${name}: the noscript fallback ships too`, html.includes("googletagmanager.com/ns.html"));
  }

  // ── 2. It boots, on both viewports ───────────────────────────────────────
  console.log("\n── it boots in a real browser ──");
  for (const [device, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    const jsErrors: string[] = [];
    page.on("pageerror", (e) => jsErrors.push(String(e)));
    await goto(page, ASCEND);

    check(`${device}: GTM initialised`, await page.evaluate(() => typeof (window as unknown as { google_tag_manager?: unknown }).google_tag_manager !== "undefined"));
    check(`${device}: the dataLayer exists`, (await readDataLayer(page)).length > 0);
    check(`${device}: no JS errors on load`, jsErrors.length === 0, jsErrors[0] ?? "");
    await ctx.close();
  }

  // ── 3. A + B: homepage view, and the scan CTA ────────────────────────────
  console.log("\n── A. homepage viewed / B. scan CTA clicked ──");
  {
    const page = await browser.newPage();
    await goto(page, ASCEND);
    let dl = await readDataLayer(page);
    check("A. ascend_home_viewed fired", countOf(dl, "ascend_home_viewed") === 1, `x${countOf(dl, "ascend_home_viewed")}`);
    console.log(`     A props: ${JSON.stringify(propsOf(dl, "ascend_home_viewed"))}`);

    // The push is synchronous in the handler, but the navigation that follows
    // tears the dataLayer down before it can be read. Preventing the default
    // keeps the page; the handler still runs.
    await page.evaluate(() => document.addEventListener("click", (e) => e.preventDefault(), true));
    await page.locator("a", { hasText: "Run My Free Growth Scan" }).first().click({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(600);
    dl = await readDataLayer(page);
    check("B. growth_scan_cta_clicked fired once", countOf(dl, "growth_scan_cta_clicked") === 1, `x${countOf(dl, "growth_scan_cta_clicked")}`);
    console.log(`     B props: ${JSON.stringify(propsOf(dl, "growth_scan_cta_clicked"))}`);

    // F: the trial link in the same hero.
    await page.locator("a", { hasText: "Or start your 14-day free trial" }).first().click({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(600);
    dl = await readDataLayer(page);
    check("F. trial_cta_clicked fired once", countOf(dl, "trial_cta_clicked") === 1, `x${countOf(dl, "trial_cta_clicked")}`);
    console.log(`     F props: ${JSON.stringify(propsOf(dl, "trial_cta_clicked"))}`);
    assertClean(dl, "home");
    await page.close();
  }

  // ── 4. G + H: /start, and checkout — WITHOUT creating anything ───────────
  console.log("\n── G. /start reached / H. checkout started ──");
  for (const [name, base, expected] of [["ascend", ASCEND, "ascend"], ["flow", FLOW, "flow"]] as const) {
    const page = await browser.newPage();
    await goto(page, `${base}/start`);
    const dl = await readDataLayer(page);
    check(`${name}: G. start_page_viewed fired once`, countOf(dl, "start_page_viewed") === 1, `x${countOf(dl, "start_page_viewed")}`);
    check(`${name}: attributed to the right product`, propsOf(dl, "start_page_viewed").product === expected, String(propsOf(dl, "start_page_viewed").product));
    if (name === "ascend") console.log(`     G props: ${JSON.stringify(propsOf(dl, "start_page_viewed"))}`);
    await page.close();
  }
  {
    const page = await browser.newPage();
    await goto(page, `${ASCEND}/start`);
    // The event fires BEFORE the request. Aborting it means no Stripe session,
    // no customer, no charge — while still observing the push.
    await page.route("**/api/public/trial-signup", (r) => r.abort());
    await page.fill('input[name="firstName"]', "GTM");
    await page.fill('input[name="lastName"]', "Verify");
    await page.fill('input[name="email"]', SCAN_EMAIL);
    await page.locator('button[type="submit"]').first().click({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const dl = await readDataLayer(page);
    check("H. checkout_started fired once", countOf(dl, "checkout_started") === 1, `x${countOf(dl, "checkout_started")}`);
    console.log(`     H props: ${JSON.stringify(propsOf(dl, "checkout_started"))}`);
    assertClean(dl, "start");
    await page.close();
  }

  // ── 5. C + D + E: one real scan ──────────────────────────────────────────
  if (SKIP_SCAN) {
    console.log("\n── C/D/E skipped (SKIP_SCAN=1) ──");
  } else {
    console.log("\n── C. scan started / D. scan completed / E. results viewed ──");
    const page = await browser.newPage();
    await goto(page, `${ASCEND}/growth-scanner`);
    await page.fill('input[placeholder="yourbusiness.com"]', SCAN_SITE);
    await page.fill('input[type="email"]', SCAN_EMAIL);
    await page.fill('input[placeholder="Jane"]', "GTM Verify");
    await page.locator("button", { hasText: "Run My Free Growth Scan" }).first().click({ timeout: 20_000 });

    await waitForEvent(page, "growth_scan_started", 60_000);
    let dl = await readDataLayer(page);
    check("C. growth_scan_started fired once", countOf(dl, "growth_scan_started") === 1, `x${countOf(dl, "growth_scan_started")}`);
    console.log(`     C props: ${JSON.stringify(propsOf(dl, "growth_scan_started"))}`);

    const began = Date.now();
    await waitForEvent(page, "growth_scan_completed", 9 * 60_000);
    dl = await readDataLayer(page);
    const secs = Math.round((Date.now() - began) / 1000);
    check("D. growth_scan_completed fired once", countOf(dl, "growth_scan_completed") === 1, `x${countOf(dl, "growth_scan_completed")} after ${secs}s`);
    check("D. it reports the lifecycle, not a result", propsOf(dl, "growth_scan_completed").scan_status === "completed", String(propsOf(dl, "growth_scan_completed").scan_status));
    console.log(`     D props: ${JSON.stringify(propsOf(dl, "growth_scan_completed"))}`);
    check("E. growth_scan_results_viewed fired once", countOf(dl, "growth_scan_results_viewed") === 1, `x${countOf(dl, "growth_scan_results_viewed")}`);
    console.log(`     E props: ${JSON.stringify(propsOf(dl, "growth_scan_results_viewed"))}`);
    check("the report actually rendered", (await page.locator("text=Your #1 constraint").count()) > 0);
    assertClean(dl, "scan");
    await page.close();
  }

  // ── 6. Smoke: nothing analytics-related broke the page ───────────────────
  console.log("\n── regression smoke ──");
  for (const [name, url] of [["ascend home", ASCEND], ["ascend scanner", `${ASCEND}/growth-scanner`], ["flow home", FLOW]] as const) {
    const page = await browser.newPage();
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    const res = await goto(page, url);
    check(`${name}: loads`, (res?.status() ?? 0) === 200, String(res?.status()));
    check(`${name}: no JS errors`, errs.length === 0, errs[0] ?? "");
    check(`${name}: no sideways scroll`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nGTM COLLECTION: ALL CHECKS PASSED\n" : `\nGTM COLLECTION: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
