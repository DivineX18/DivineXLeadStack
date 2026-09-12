/**
 * One host, one brand — asserted on every public route, not a sample.
 *
 * The bug this locks shut: the Ascend/Flow swap used to be applied by each
 * page that remembered to call `brandForProduct()`. Six did; around
 * twenty-five did not, so nine of twelve public pages on app.divinex.io
 * called themselves Flow — in body copy AND in <title>, which is what search
 * and social shares display. The swap now lives inside `resolveCustomBrand()`,
 * so this checks the OUTCOME on every route rather than trusting that.
 *
 *   ASCEND_BASE=… FLOW_BASE=… NODE_OPTIONS="--conditions=react-server" \
 *     npx tsx scripts/verify-host-branding.mts
 */
const ASCEND = process.env.ASCEND_BASE ?? "https://app.divinex.io";
const FLOW = process.env.FLOW_BASE ?? "https://crm.divinex.io";

/** Every public marketing route. Anything reachable by a logged-out visitor
 *  that renders the brand. */
const ROUTES = [
  "/",
  "/about",
  "/contact",
  "/faq",
  "/features",
  "/implementation",
  "/industries",
  "/platform",
  "/pricing",
  "/resources",
  "/start",
  "/growth-scanner",
  // "/leadstack-vs-gohighlevel" is deliberately omitted: it 404s on BOTH hosts
  // in production today, so it is a routing question, not a branding one.
  "/affiliate-program",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/responsible-ai",
  "/api-webhooks",
  "/login",
  "/signup",
];

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

/** Strip the one legitimate cross-brand mention: Ascend's pages may name Flow
 *  as the execution half of the product, and vice versa, in prose. What must
 *  never appear is the OTHER brand as this site's own identity — the logo,
 *  the title, the share metadata. So identity surfaces are checked, not prose. */
async function identityOf(base: string, route: string) {
  const res = await fetch(`${base}${route}`, { redirect: "follow" });
  const html = await res.text();
  const pick = (re: RegExp) => (html.match(re) ?? [])[1]?.trim() ?? "";
  return {
    status: res.status,
    title: pick(/<title>([^<]*)<\/title>/),
    ogSite: pick(/property="og:site_name" content="([^"]*)"/),
    ogTitle: pick(/property="og:title" content="([^"]*)"/),
    appleTitle: pick(/name="apple-mobile-web-app-title" content="([^"]*)"/),
    /** The wordmark in the navbar — the brand the visitor actually sees. */
    wordmark: pick(/<span[^>]*>(Ascend|Flow)<\/span>/),
    html,
  };
}

for (const [label, base, want, wrong] of [
  ["ASCEND", ASCEND, "Ascend", "Flow"],
  ["FLOW", FLOW, "Flow", "Ascend"],
] as const) {
  console.log(`\n══ ${label} (${base}) ══`);
  console.log("route".padEnd(30) + "status  title");
  for (const route of ROUTES) {
    const id = await identityOf(base, route).catch(() => null);
    if (!id) {
      check(`${route}: reachable`, false, "fetch failed");
      continue;
    }
    const ok200 = id.status === 200;
    // The Growth Scanner is Ascend's front door and carries Ascend identity
    // wherever it is served, including on the Flow host. That is deliberate and
    // already asserted by verify-public-growth-scanner.mts, so it is not a
    // cross-brand leak here either.
    if (route === "/growth-scanner" && label === "FLOW") {
      check(`  ${route}: loads`, ok200, String(id.status));
      console.log(`  ${route.padEnd(28)} ${String(id.status).padEnd(7)} ${id.title.slice(0, 64)}  (Ascend by design)`);
      continue;
    }
    // A title naming the WRONG product is the defect that shipped.
    const titleWrong = new RegExp(`\\b${wrong}\\b`).test(id.title);
    const ogWrong = id.ogSite === wrong || new RegExp(`\\b${wrong}\\b`).test(id.ogTitle);
    const markWrong = id.wordmark === wrong;

    console.log(`  ${route.padEnd(28)} ${String(id.status).padEnd(7)} ${id.title.slice(0, 64)}`);
    check(`  ${route}: loads`, ok200, String(id.status));
    check(`  ${route}: title is not ${wrong}`, !titleWrong, id.title.slice(0, 70));
    check(`  ${route}: share metadata is not ${wrong}`, !ogWrong, `${id.ogSite} / ${id.ogTitle}`.slice(0, 70));
    check(`  ${route}: wordmark is not ${wrong}`, !markWrong, id.wordmark);
    // And the positive: somewhere on an identity surface, the right name.
    const names = `${id.title} ${id.ogSite} ${id.ogTitle} ${id.appleTitle} ${id.wordmark}`;
    check(`  ${route}: identifies as ${want}`, new RegExp(`\\b${want}\\b`).test(names), names.slice(0, 70));
  }
}

console.log(failures === 0 ? "\nHOST BRANDING: ALL ROUTES CORRECT\n" : `\nHOST BRANDING: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
