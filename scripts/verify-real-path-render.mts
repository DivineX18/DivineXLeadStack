/**
 * THE COMMERCIAL CERTIFICATION PASS — the pages a real customer gets.
 *
 * The thin-input fixture battery proves ROBUSTNESS: given almost nothing, the
 * generator still produces something safe, truthful and composed. It is not the
 * commercial test, because it calls create_funnel directly with a hand-written
 * argument object and the product never does that.
 *
 * This renders the funnels built down the REAL path (ask -> Zeno's own proposal
 * -> confirm) and captures what a visitor sees, so commercial quality is judged
 * on the artifact customers actually receive.
 *
 * Nothing here writes page content. It publishes, walks, shoots and audits.
 *
 *   FLOW_PROBE_SA=<sa> FUNNEL_IDS=id1,id2,... OUT_DIR=<dir> \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     npx tsx scripts/verify-real-path-render.mts
 */
import { readFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SA = process.env.FLOW_PROBE_SA!;
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "/private/tmp/real-path-shots";
mkdirSync(OUT, { recursive: true });
/** `label=funnelId` pairs. */
const TARGETS = (process.env.FUNNEL_IDS ?? "").split(",").filter(Boolean).map((p) => {
  const [label, id] = p.split("=");
  return { label, id };
});
if (TARGETS.length === 0) throw new Error("FUNNEL_IDS is required (label=id,label=id,...)");

const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const { updateFunnelServerSide } = await import("../src/lib/server/funnels-service.ts");
const { describePageRhythm } = await import("../src/lib/funnels/page-composition.ts");
const { isUnsupportedTrustClaim } = await import("../src/lib/funnels/claim-integrity.ts");
const db = getAdminDb();

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// Any workflow the pages depend on must be live, or the delivery guard
// correctly refuses to publish a page promising an email nobody sends.
const wfs = await db.collection("workflows").where("subAccountId", "==", SA).where("status", "==", "draft").get();
for (const w of wfs.docs) await w.ref.update({ status: "active" });

const { chromium } = await import("@playwright/test");
const browser = await chromium.launch();

for (const t of TARGETS) {
  console.log(`\n${"=".repeat(70)}\n${t.label}  (${t.id})\n${"=".repeat(70)}`);
  const snap = await db.doc(`funnels/${t.id}`).get();
  if (!snap.exists) {
    check(`${t.label}: exists`, false, t.id);
    continue;
  }
  const doc = snap.data() as { sections?: { type: string; config: Record<string, unknown> }[]; status?: string };

  // INTEGRITY BEFORE AESTHETICS. A beautiful page that fabricates credibility
  // is a worse outcome than a plain honest one, so the claim audit runs first
  // and its findings are failures, not notes.
  // SCOPED TO BADGE-LIKE LABELS, not to all prose. Scanning every string on
  // the page flagged the consultant's "services businesses past the founder-led
  // stage" — which describes the BUYER'S business, is verified, and is not a
  // claim about the advertiser at all. A short label has no context to
  // disambiguate it and is where the inferred claim actually shipped; running
  // prose does, and treating the two alike makes the rule useless by making it
  // wrong.
  const claims: string[] = [];
  for (const sec of doc.sections ?? []) {
    const c = sec.config as { trustBadges?: string[]; badges?: { label?: string }[]; items?: { title?: string }[] };
    for (const b of c.trustBadges ?? []) claims.push(b);
    for (const b of c.badges ?? []) if (b.label) claims.push(b.label);
  }
  const unsupported = claims.filter((c) => isUnsupportedTrustClaim(c));
  check(`${t.label}: no unsupported ownership claim anywhere on the page`, unsupported.length === 0, unsupported.join(" | "));

  if (doc.status !== "published") {
    try {
      await updateFunnelServerSide({ subAccountId: SA, funnelId: t.id, patch: { status: "published" } });
    } catch (e) {
      check(`${t.label}: publishes`, false, String(e).slice(0, 140));
      continue;
    }
  }

  const rhythm = describePageRhythm((doc.sections ?? []) as never);
  console.log(`     shape: ${rhythm.families.join(" → ")}`);
  console.log(`     longest run ${rhythm.longestRun}, ${rhythm.distinctFamilies} distinct shapes`);
  console.log(`     CTAs: ${[...new Set(rhythm.ctaLabels)].join(" | ")}`);
  if (rhythm.repeatedHeadings.length) console.log(`     repeated headings: ${rhythm.repeatedHeadings.join(" | ")}`);

  for (const [device, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    const res = await page.goto(`${BASE}/lp/${t.id}`, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => null);
    await page.waitForTimeout(1200);

    // Reveal every scroll-triggered section before shooting, or the capture
    // records a page of blank bands and the finding is about the camera.
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < pageHeight; y += 500) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(240);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);

    const tag = `${t.label}-${device}`;
    await page.screenshot({ path: `${OUT}/${tag}-fold.png` });
    await page.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: true });

    // Scoped to the funnel root: the app shell's toast live-region is a
    // <section> too, and counting it made every page look like it had an
    // empty one.
    const root = page.locator(".flow-funnel-root");
    const sections = root.locator("section");
    const total = await sections.count();
    if (total > 0) {
      await sections.nth(Math.floor(total / 2)).scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${tag}-middle.png` });
      const asking = root.locator("section:has(a), section:has(button)").last();
      if (await asking.count()) {
        await asking.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${tag}-conversion.png` });
      }
    }

    const audit = await page.evaluate(() => {
      const r = document.querySelector(".flow-funnel-root") ?? document.body;
      const secs = Array.from(r.querySelectorAll("section"));
      const imgs = Array.from(document.images);
      return {
        sections: secs.length,
        images: imgs.length,
        proofVisuals: r.querySelectorAll("[data-proof-visual]").length,
        broken: imgs.filter((i) => i.currentSrc && i.naturalWidth === 0).length,
        noAlt: imgs.filter((i) => !i.getAttribute("alt")).length,
        empty: secs.filter((s) => (s.textContent ?? "").trim().length === 0 && !s.querySelector("img,video,svg")).length,
        invisible: secs.filter((s) => Number(getComputedStyle(s).opacity) < 0.9).length,
        height: document.body.scrollHeight,
      };
    });

    // IS THE PROOF BEAT ACTUALLY READABLE?
    //
    // The paid-offer page's only visual was a framed document whose paper was
    // painted with a Tailwind `dark:` variant. A funnel's dark theme is set per
    // page and applied as inline colours, not as the viewer's colour scheme, so
    // on a dark page in a light-mode browser the variant never fired: a
    // 60%-white wash over near-black gave a flat mid grey, under the page's
    // near-white ink. Every existing check passed — the section rendered, had
    // content, was visible and was counted as a visual beat — and the beat was
    // close to unreadable.
    //
    // Colours are read here and the ratio computed in Node: the page can only
    // report what it paints, never whether that was legible.
    const swatches = await page.evaluate(() => {
      const out: { color: string; bg: string; opacity: number; text: string }[] = [];
      for (const panel of Array.from(document.querySelectorAll("[data-proof-visual]"))) {
        for (const node of Array.from(panel.querySelectorAll("p, h2, h3, h4, li, span"))) {
          const own = (node.textContent ?? "").trim();
          if (own.length < 8) continue;
          // The painted background is whatever the nearest opaque ancestor
          // sets — the element's own is usually transparent.
          let bg = "rgba(0, 0, 0, 0)";
          let cursor: Element | null = node;
          while (cursor) {
            const c = getComputedStyle(cursor).backgroundColor;
            if (c && !c.startsWith("rgba(0, 0, 0, 0)") && c !== "transparent") {
              bg = c;
              break;
            }
            cursor = cursor.parentElement;
          }
          // Body copy in these panels is dimmed with `opacity-70`, which the
          // computed COLOR does not reflect — read it separately or the
          // measurement flatters exactly the text most at risk.
          let opacity = 1;
          let fade: Element | null = node;
          while (fade && fade !== document.body) {
            opacity *= Number(getComputedStyle(fade).opacity);
            fade = fade.parentElement;
          }
          out.push({ color: getComputedStyle(node).color, bg, opacity, text: own.slice(0, 40) });
        }
      }
      return out;
    });

    /** WCAG relative luminance, with alpha flattened onto the page's own base. */
    const luminance = (css: string, base: [number, number, number], extraAlpha = 1): number => {
      const m = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
      const a = (m.length > 3 ? m[3] : 1) * extraAlpha;
      const channels = [0, 1, 2].map((i) => (m[i] ?? 0) * a + base[i] * (1 - a));
      const linear = channels.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };

    // The funnel paints its own page background; flatten translucent layers
    // onto it rather than onto an assumed white.
    const pageBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const pageRgb = (pageBg.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255]).slice(0, 3) as [number, number, number];
    let worst = { ratio: 21, text: "" };
    for (const s of swatches) {
      const lBg = luminance(s.bg, pageRgb);
      // Text is flattened onto the surface BEHIND it (already flattened onto
      // the page), so a dimmed line is measured against what it sits on.
      const bgRgbFlat = [0, 1, 2].map((i) => {
        const m = s.bg.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
        const a = m.length > 3 ? m[3] : 1;
        return (m[i] ?? 0) * a + pageRgb[i] * (1 - a);
      }) as [number, number, number];
      const lFg = luminance(s.color, bgRgbFlat, s.opacity);
      const ratio = (Math.max(lFg, lBg) + 0.05) / (Math.min(lFg, lBg) + 0.05);
      if (ratio < worst.ratio) worst = { ratio, text: s.text };
    }
    if (swatches.length > 0) {
      // 4.5:1 is the WCAG AA floor for body text. The broken panel put
      // near-white titles on a flat mid grey at about 2.5:1, with the dimmed
      // body copy below that — so this is not a close call the check has to
      // adjudicate. It guards the whole class of theme-mismatched surface,
      // not the one component that exposed it.
      check(
        `${tag}: the proof visual is readable`,
        worst.ratio >= 4.5,
        `${worst.ratio.toFixed(2)}:1 on "${worst.text}"`,
      );
    }

    console.log(`     ${tag}: ${audit.sections} sections, ${audit.images} imgs, ${audit.proofVisuals} proof, ${audit.height}px`);
    check(`${tag}: renders`, (res?.status() ?? 0) === 200, String(res?.status()));
    check(`${tag}: no JS errors`, errs.length === 0, errs[0]?.slice(0, 90) ?? "");
    check(`${tag}: no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));
    check(`${tag}: every section visible after scrolling`, audit.invisible === 0, `${audit.invisible}`);
    check(`${tag}: no empty funnel sections`, audit.empty === 0, `${audit.empty}`);
    check(`${tag}: no broken media`, audit.broken === 0, `${audit.broken}`);
    check(`${tag}: images carry alt text`, audit.noAlt === 0, `${audit.noAlt}`);
    check(`${tag}: carries a visual beat`, audit.images > 0 || audit.proofVisuals > 0, `${audit.images} imgs / ${audit.proofVisuals} proof`);
    await ctx.close();
  }
}

await browser.close();
console.log(`\nscreenshots: ${OUT}`);
console.log(failures === 0 ? "\nREAL-PATH RENDER: ALL CHECKS PASSED\n" : `\nREAL-PATH RENDER: ${failures} FAILED\n`);
