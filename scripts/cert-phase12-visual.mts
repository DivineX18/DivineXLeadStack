/**
 * PHASE 12 — desktop + mobile capture of the generated page, as a customer
 * would actually receive it.
 *
 * Screenshots only. Nothing here decides whether the page is good; that
 * judgement belongs to a human looking at the images and at the integrity
 * findings, not to a script counting elements.
 *
 * Run: FUNNEL=<id> NODE_OPTIONS="--conditions=react-server" npx tsx scripts/cert-phase12-visual.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
import { chromium } from "../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs";

const FLOW = process.env.FLOW_BASE ?? "https://crm.divinex.io";
const HOST = new URL(FLOW).hostname;
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";
const FUNNEL = process.env.FUNNEL!;
const URL_ = `${FLOW}/preview/funnel/${FUNNEL}`;

const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");
const ct = await getAdminAuth().createCustomToken(OWNER);
const si = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }) },
);
const { idToken } = (await si.json()) as { idToken: string };
const login = await fetch(`${FLOW}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies(
  cookie.split("; ").filter(Boolean).map((c) => {
    const i = c.indexOf("=");
    return { name: c.slice(0, i), value: c.slice(i + 1), domain: HOST, path: "/" };
  }),
);

for (const [label, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(URL_, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(2000);

  // Sections reveal on scroll. A fullPage screenshot does NOT scroll, so an
  // unscrolled capture photographs a page of empty bands and looks like a
  // broken generator — the first attempt at this did exactly that. Walk the
  // page first, let the reveals fire, then return to the top.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 220));
    }
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 600));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
  });
  await page.waitForTimeout(1200);

  const out = `/tmp/p12-${label}.png`;
  await page.screenshot({ path: out, fullPage: true });
  const d = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    scrollH: document.documentElement.scrollHeight,
    imgs: [...document.images].map((i) => ({ src: i.src, w: i.naturalWidth, h: i.naturalHeight })),
  }));
  const broken = d.imgs.filter((i) => i.w === 0);
  console.log(`${label}: ${out}  ${d.scrollW}x${d.scrollH} (viewport ${width})`);
  console.log(`  horizontal overflow: ${d.scrollW > d.clientW + 1 ? `YES ${d.scrollW - d.clientW}px` : "no"}`);
  console.log(`  images: ${d.imgs.length}, broken: ${broken.length}${broken.length ? " -> " + broken.map((b) => b.src.slice(-40)).join(", ") : ""}`);

  if (label === "desktop") {
    const proof = await page.evaluate(() => {
      const el = [...document.querySelectorAll("p")].find((p) => /as seen in|trusted by|featured in/i.test(p.textContent ?? ""));
      if (!el) return null;
      const imgs = [...(el.parentElement?.querySelectorAll("img") ?? [])].map((i) => ({
        src: (i as HTMLImageElement).src.replace(/^.*uploads\//, ""),
        alt: (i as HTMLImageElement).alt,
      }));
      return { heading: el.textContent?.trim(), imgs };
    });
    console.log(`  SOCIAL-PROOF STRIP: ${JSON.stringify(proof)}`);
  }
  await page.close();
}
await browser.close();
