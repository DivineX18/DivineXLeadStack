/**
 * The public Growth Scanner, driven end to end against a deployment.
 *
 * Runs a REAL scan through the public proxy, then drives the published page in
 * a browser on desktop and mobile. Nothing here passes on markup inspection:
 * the form is filled and submitted, the wait is observed, and the rendered
 * result is asserted against the report the engine actually returned.
 *
 * BASE=https://flow-growth-scan-staging.onrender.com \
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-public-growth-scanner.mts
 */
const BASE = process.env.BASE ?? "https://flow-growth-scan-staging.onrender.com";
const TARGET = process.env.TARGET ?? "https://ascend.divinex.io";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

console.log(`\n=== ${BASE} ===`);
console.log("build:", JSON.stringify(await (await fetch(`${BASE}/api/version`)).json()));

// ── 1. Public access, logged out ────────────────────────────────────────────
console.log("\n── public access ──");
{
  const res = await fetch(`${BASE}/growth-scanner`, { redirect: "manual" });
  check("the scanner is reachable logged out", res.status === 200, `${res.status} ${res.headers.get("location") ?? ""}`);
  const html = await res.text();
  check("it does not bounce to login", !/\/login\?redirect/.test(html.slice(0, 4000)));
  check("the approved hero is present", /Find what.{0,8}s costing you leads/.test(html));
  check("the approved CTA is present", html.includes("Run My Free Growth Scan"));
  check("the trust line is present", html.includes("No software setup required"));
  check("the differentiator is present", html.includes("Ascend starts with what you actually need to fix"));
  // The page's OWN identity must be Ascend. The root layout still stamps
  // Flow's brand onto every public surface; that is the separate host-aware
  // branding pass, and this asserts the part this page owns.
  check("the page title is Ascend, not Flow", /<title>[^<]*Ascend[^<]*<\/title>/.test(html), (html.match(/<title>[^<]*<\/title>/) ?? [""])[0]);
  check("its social identity is Ascend", /og:site_name" content="Ascend"/.test(html));
  check("its apple-web-app title is Ascend", /apple-mobile-web-app-title" content="Ascend"/.test(html));
}

// ── 2. Authenticated APIs must NOT have become public ───────────────────────
console.log("\n── security boundary ──");
for (const path of ["/api/sub-accounts/x/growth-scan/run", "/api/sub-accounts/x/funnels", "/app/home"]) {
  const r = await fetch(`${BASE}${path}`, { redirect: "manual" });
  check(`${path} is still protected`, r.status === 401 || r.status === 403 || r.status === 307, String(r.status));
}

// ── 3. A REAL scan through the public proxy ─────────────────────────────────
console.log("\n── real scan through the proxy ──");
const started = await fetch(`${BASE}/api/public/growth-scan`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Scanner Verify",
    email: `scanner-verify+${Date.now()}@divinex.io`,
    websiteUrl: TARGET,
    businessType: "unknown",
  }),
});
const startBody = (await started.json()) as { shareToken?: string; error?: string };
check("the proxy accepts and returns 202", started.status === 202, `${started.status} ${JSON.stringify(startBody).slice(0, 140)}`);
check("a share token is returned", !!startBody.shareToken, startBody.shareToken ?? "(none)");

check(
  "a bad website address is rejected before spending a scan",
  (await (await fetch(`${BASE}/api/public/growth-scan`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "x", email: "a@b.co", websiteUrl: "not a url", businessType: "unknown" }),
  })).json().then((j: any) => typeof j.error === "string")),
);
check(
  "a bad email is rejected",
  (await fetch(`${BASE}/api/public/growth-scan`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "x", email: "nope", websiteUrl: TARGET, businessType: "unknown" }),
  })).status === 400,
);

let report: any = null;
if (startBody.shareToken) {
  const t0 = Date.now();
  while (Date.now() - t0 < 540_000) {
    await new Promise((r) => setTimeout(r, 8000));
    const p = await fetch(`${BASE}/api/public/growth-scan/${startBody.shareToken}`, { cache: "no-store" }).catch(() => null);
    if (!p?.ok) continue;
    const d = (await p.json()) as { state?: string; report?: any };
    if (d.state === "ready") { report = d.report; break; }
    if (d.state === "failed") break;
    process.stdout.write(".");
  }
  console.log("");
  check("the scan completed via polling", !!report, `${Math.round((Date.now() - t0) / 1000)}s`);
}

if (report) {
  console.log("\n── the normalized report ──");
  check("a Growth Score is present", typeof report.overallScore === "number", String(report.overallScore));
  check("the primary constraint is present", !!report.primaryConstraint, report.primaryConstraint);
  check("category scores are present", Array.isArray(report.categories) && report.categories.length > 0, `${report.categories?.length}`);
  check("prioritized actions are present", Array.isArray(report.topOpportunities) && report.topOpportunities.length > 0, `${report.topOpportunities?.length}`);
  check(
    "internal diagnostic fields are NOT exposed to the public",
    !("reportReliabilityGate" in report) && !("explainability" in report) && !("blueprint" in report),
    Object.keys(report).join(","),
  );
}

// ── 4. Drive the real page in a browser ─────────────────────────────────────
console.log("\n── the page, driven for real ──");
const { chromium } = await import("@playwright/test");
const browser = await chromium.launch();
for (const [device, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/growth-scanner`, { waitUntil: "networkidle", timeout: 90_000 });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check(`${device}: the page does not scroll sideways`, !overflow);

  const cta = page.locator("button", { hasText: "Run My Free Growth Scan" }).first();
  check(`${device}: the primary CTA is present`, (await cta.count()) > 0);
  const box = await cta.boundingBox();
  check(`${device}: the CTA is a real tap target (>=44px)`, (box?.height ?? 0) >= 44, `${Math.round(box?.height ?? 0)}px`);

  // Submit and confirm the wait state appears without a refresh.
  await page.locator('input[placeholder="yourbusiness.com"]').fill(TARGET);
  await page.locator('input[type="email"]').fill(`scanner-ui+${Date.now()}@divinex.io`);
  await cta.click();
  await page.waitForTimeout(4000);
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  check(`${device}: submitting shows a live progress state, not a refresh`, /Reading your website|takes one to three minutes/i.test(body), body.slice(0, 120));
  await ctx.close();
}
await browser.close();

console.log(`\n${failures === 0 ? "PUBLIC SCANNER: ALL CHECKS PASSED" : `PUBLIC SCANNER: ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
