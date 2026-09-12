/**
 * LANDING PAGE DESIGN QUALITY — the permanent fixture set.
 *
 * Ascend's pitch is that it diagnoses weak marketing experiences and builds the
 * fix. That makes the visual quality of a GENERATED page a product requirement,
 * not polish: a page that converts badly is the exact defect the product exists
 * to find. So this generates representative pages through the real customer
 * path, publishes them, and captures what a visitor would actually see.
 *
 * FIVE FIXTURES, chosen to span the decisions the generator makes — genre,
 * emotional transformation, whether an opt-in exists, whether money changes
 * hands. If the generator only knows one page shape, these five will look the
 * same, and that is the finding.
 *
 * DETERMINISTIC vs JUDGEMENT. The checks below are the half a machine can
 * honestly own: overflow, broken media, distorted aspect ratios, clipped or
 * empty sections, actionless CTAs, a heading printed twice, a call to action
 * that drifts out of the page's own language, a section that is mostly empty
 * band, and whether the page is one layout repeated. Taste is not asserted
 * here — the screenshots exist so a human makes that call, which is the only
 * honest division.
 *
 * Each fixture also prints the SHAPE it composed to (the layout family of each
 * section, in order) before rendering, because a browser can see that a page
 * looks repetitive but only the stored sections say which decision made it so.
 *
 * Four captures per fixture per viewport: the fold, the whole page, a
 * representative middle, and the section that asks for the decision. The middle
 * and the close get their own viewport-sized shots because a full-page capture
 * of a 2,800px page is scaled too far down to judge spacing or crops.
 *
 * Everything is created in a throwaway workspace and deleted at the end,
 * including the published pages.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-landing-page-quality.mts
 *   BASE=https://flow-growth-scan-staging.onrender.com ... to shoot a deployment
 */
import { readFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.BASE ?? "https://flow-growth-scan-staging.onrender.com";
const OUT = process.env.SHOT_DIR ?? "/private/tmp/landing-quality";
mkdirSync(OUT, { recursive: true });

const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const { updateFunnelServerSide } = await import("../src/lib/server/funnels-service.ts");
const { describePageRhythm } = await import("../src/lib/funnels/page-composition.ts");
const db = getAdminDb();

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

/** The five fixtures — one shared definition (scripts/fixtures). */
const { FIXTURES } = await import("./fixtures/landing-page-fixtures.mts");

const RUN = `lpq${Date.now()}`;
const AGENCY = `test-agency-${RUN}`;
const SA = `test-sa-${RUN}`;
const UID = `test-uid-${RUN}`;
const ctx = { uid: UID, subAccountId: SA } as never;
const made: { funnelId: string; id: string; label: string }[] = [];

await db.doc(`agencies/${AGENCY}`).set({ name: "LPQ Verify", createdAt: new Date() });
await db.doc(`subAccounts/${SA}`).set({
  name: "LPQ Verify",
  agencyId: AGENCY,
  funnelsEnabledByAgency: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

try {
  // ── Generate + publish through the real path ────────────────────────────
  console.log("\n══ generating ══");
  const funnel = getCapability("create_funnel")!;
  for (const fx of FIXTURES) {
    const v = funnel.validate!({ ...fx.args } as never);
    if (!(v as { ok: boolean }).ok) {
      check(`${fx.label}: validates`, false, (v as { error?: string; reason?: string }).error ?? (v as { reason?: string }).reason ?? "");
      continue;
    }
    const res = await funnel.execute(ctx, (v as { args: Record<string, unknown> }).args);
    const funnelId = (res as { ref?: { id: string } }).ref?.id;
    if (!funnelId) {
      check(`${fx.label}: generated`, false);
      continue;
    }
    check(`${fx.label}: generated`, true, funnelId);
    // A customer publishes the follow-up before the page, because the page
    // promises the email the workflow sends — the delivery guard refuses
    // otherwise, correctly. Doing it here walks the same sequence rather than
    // bypassing the guard.
    const wfs = await db.collection("workflows").where("subAccountId", "==", SA).where("status", "==", "draft").get();
    for (const w of wfs.docs) await w.ref.update({ status: "active" });

    // Publishing runs the real completeness + CTA + delivery guards, so a
    // fixture that cannot publish is itself a quality finding.
    try {
      await updateFunnelServerSide({ subAccountId: SA, funnelId, patch: { status: "published" } });
      made.push({ funnelId, id: fx.id, label: fx.label });
    } catch (e) {
      check(`${fx.label}: publishes (completeness guards)`, false, String(e).slice(0, 120));
    }

    // WHAT WAS COMPOSED, before anything is rendered. The browser can see that
    // a page looks repetitive; only the stored sections say WHICH decisions
    // produced it, and reading them back is how a composition regression gets
    // diagnosed instead of just noticed. Printed, not asserted — the rendered
    // checks below are the ones that fail the run.
    const doc = await db.doc(`funnels/${funnelId}`).get();
    const stored = (doc.data() as { sections?: { type: string; config: Record<string, unknown> }[] } | undefined)?.sections ?? [];
    const rhythm = describePageRhythm(stored as never);
    console.log(`     shape: ${rhythm.families.join(" → ")}`);
    console.log(`     longest run of one shape: ${rhythm.longestRun}, distinct shapes: ${rhythm.distinctFamilies}`);
    if (rhythm.repeatedHeadings.length) console.log(`     repeated headings: ${rhythm.repeatedHeadings.join(" | ")}`);
    console.log(`     CTAs: ${[...new Set(rhythm.ctaLabels)].join(" | ")}`);
  }

  // ── Look at them ────────────────────────────────────────────────────────
  console.log("\n══ rendering ══");
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();

  for (const m of made) {
    for (const [device, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
      const c = await browser.newContext({ viewport: { width, height } });
      const page = await c.newPage();
      const errs: string[] = [];
      page.on("pageerror", (e) => errs.push(String(e)));
      const res = await page.goto(`${BASE}/lp/${m.funnelId}`, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => null);
      await page.waitForTimeout(1200);

      // WALK THE PAGE BEFORE LOOKING AT IT. Sections reveal on scroll via
      // IntersectionObserver, so a full-page screenshot taken from the top
      // captures everything below the fold still at opacity 0 — which reads as
      // a page of blank bands and is a finding about the camera, not the
      // product. Scrolling through fires every observer first.
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < pageHeight; y += 500) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page.waitForTimeout(260);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(700);

      const tag = `${m.id}-${device}`;
      await page.screenshot({ path: `${OUT}/${tag}-fold.png` });
      await page.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: true });

      // THE MIDDLE AND THE CLOSE, at reading size. A full-page capture of a
      // 2,800px page is scaled down far enough that spacing, crops and the
      // balance of a split row stop being legible — which is exactly where the
      // composition work has to be judged. So the two folds a visitor actually
      // deliberates in get their own viewport-sized shot: a representative
      // middle, and the section that asks for the decision.
      // Locators, not page.evaluate: this script is run through tsx, whose
      // esbuild transform names arrow functions and injects a `__name` helper
      // into them. That helper does not exist in the browser, so a closure
      // passed to page.evaluate throws "__name is not defined" the moment it
      // is serialised across. The locator API does the same work entirely on
      // the Node side.
      const allSections = page.locator("section");
      const total = await allSections.count();
      if (total > 0) {
        await allSections.nth(Math.floor(total / 2)).scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${tag}-middle.png` });
        // The conversion beat: the last section that asks for anything.
        const asking = page.locator("section:has(a), section:has(button)").last();
        if (await asking.count()) {
          await asking.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(400);
          await page.screenshot({ path: `${OUT}/${tag}-conversion.png` });
        }
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      check(`${tag}: renders`, (res?.status() ?? 0) === 200, String(res?.status()));
      check(`${tag}: no JS errors`, errs.length === 0, errs[0]?.slice(0, 90) ?? "");
      check(`${tag}: no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));

      // ── Deterministic quality ────────────────────────────────────────────
      const audit = await page.evaluate(() => {
        const imgs = Array.from(document.images);
        const broken = imgs.filter((i) => i.currentSrc && i.naturalWidth === 0).length;
        // A rendered box wildly off the image's own ratio is a stretch/squash.
        const distorted = imgs.filter((i) => {
          if (!i.naturalWidth || !i.naturalHeight || !i.clientWidth || !i.clientHeight) return false;
          const nat = i.naturalWidth / i.naturalHeight;
          const box = i.clientWidth / i.clientHeight;
          const style = getComputedStyle(i);
          if (style.objectFit === "cover" || style.objectFit === "contain") return false;
          return Math.abs(nat - box) / nat > 0.15;
        }).length;
        const srcs = imgs.map((i) => i.currentSrc).filter(Boolean);
        const repeated = srcs.length - new Set(srcs).size;

        // SCOPE EVERYTHING TO THE PAGE ITSELF. `document.querySelectorAll`
        // also returns the app shell's toast portal — Sonner renders an empty
        // <section aria-live="polite"> as the last element in the body — so
        // this check reported "1 empty section" on every page ever run, and
        // because the count named nothing, the false positive was never
        // investigated and a real empty section would have been invisible
        // inside it. The funnel renders inside .flow-funnel-root; nothing
        // outside it is the page under test.
        const root = document.querySelector(".flow-funnel-root") ?? document.body;
        const sections = Array.from(root.querySelectorAll("section"));
        const emptyEls = sections.filter((s) => (s.textContent ?? "").trim().length === 0 && !s.querySelector("img,video,svg"));
        const empty = emptyEls.length;
        // A COUNT IS NOT ACTIONABLE. "1 empty section" was reported on every
        // page for as long as this check has existed without ever saying which
        // one, so it was never fixed. Identify each by its position, its own
        // classes and its parent's, which is enough to find the component.
        const emptyDetail = emptyEls.map((s) => {
          const idx = sections.indexOf(s);
          const own = (s.getAttribute("class") ?? "").slice(0, 60);
          const parent = (s.parentElement?.getAttribute("class") ?? "").slice(0, 40);
          const h = Math.round(s.getBoundingClientRect().height);
          return `#${idx + 1}/${sections.length} h=${h}px class="${own}" parent="${parent}"`;
        });
        // A section still transparent after the page has been walked is a real
        // reveal bug, not a capture artifact.
        const invisible = sections.filter((s) => Number(getComputedStyle(s).opacity) < 0.9).length;

        // CTAs that go nowhere.
        const ctas = Array.from(root.querySelectorAll("a,button")) as HTMLElement[];
        const actionless = ctas.filter((el) => {
          const t = (el.textContent ?? "").trim();
          if (t.length < 3 || t.length > 40) return false;
          if (el.tagName === "A") {
            const href = (el as HTMLAnchorElement).getAttribute("href") ?? "";
            return href === "" || href === "#";
          }
          return false;
        }).length;

        // Placeholder text that escaped.
        const body = document.body.innerText;
        const placeholders = (body.match(/\[[A-Z_ ]{3,}\]|lorem ipsum|TODO|XXXX/gi) ?? []).length;

        // Line length: a measure of whether text is readable or a wall.
        const paras = Array.from(root.querySelectorAll("p")).filter((p) => (p.textContent ?? "").length > 120);
        const tooWide = paras.filter((p) => p.getBoundingClientRect().width > 900).length;

        // Section rhythm: if every section is the same height-to-content shape
        // and they all contain a grid, the page is one pattern repeated.
        const gridy = sections.filter((s) => {
          const el = s.querySelector("[class*='grid']");
          return !!el;
        }).length;

        // HEADINGS AND BUTTON LABELS, RAW. Both are analysed on the Node side
        // rather than here: this script runs through tsx, and esbuild renames
        // any function declared inside this block and injects a `__name` helper
        // into it. That helper does not exist in the page, so a normaliser
        // declared here throws "__name is not defined" the instant the function
        // is serialised into the browser. Only anonymous inline callbacks in
        // array methods are safe in this scope.
        const headings = sections
          .map((s) => (s.querySelector("h1,h2,h3")?.textContent ?? "").trim())
          .filter((t) => t.length > 8);
        const buttonLabels = (Array.from(root.querySelectorAll("a,button")) as HTMLElement[])
          .map((el) => (el.textContent ?? "").trim())
          .filter((t) => t.length >= 3 && t.length <= 40);

        // EXCESSIVE WHITESPACE / DEAD BANDS. A section far taller than the
        // content inside it renders as an empty band the reader scrolls
        // through. Measured as the section's own height against the union of
        // its visible children, so a deliberately airy section with real
        // content in it is not penalised.
        const deadBandEls = sections.filter((s) => {
          const h = s.getBoundingClientRect().height;
          if (h < 400) return false;
          const kids = Array.from(s.querySelectorAll("*")).filter((el) => {
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.width > 0;
          });
          if (kids.length === 0) return true;
          const top = Math.min(...kids.map((k) => k.getBoundingClientRect().top));
          const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
          const filled = bottom - top;
          return filled / h < 0.4;
        });
        const deadBands = deadBandEls.length;
        // Named for the same reason the empty-section check is — a bare count
        // is not something anyone can act on.
        const deadBandDetail = deadBandEls.map((s) => {
          const idx = sections.indexOf(s);
          const text = (s.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
          return `#${idx + 1}/${sections.length} h=${Math.round(s.getBoundingClientRect().height)}px "${text}"`;
        });

        return {
          images: imgs.length,
          broken,
          distorted,
          repeated,
          sections: sections.length,
          empty,
          emptyDetail,
          invisible,
          actionless,
          placeholders,
          tooWide,
          gridy,
          headings,
          buttonLabels,
          deadBands,
          deadBandDetail,
          imagesWithoutAlt: imgs.filter((i) => !i.getAttribute("alt")).length,
          height: document.body.scrollHeight,
        };
      });

      console.log(
        `     ${tag}: ${audit.sections} sections, ${audit.images} imgs, ${audit.gridy} grid-sections, ${audit.height}px`,
      );
      check(`${tag}: every section is visible after scrolling`, audit.invisible === 0, `${audit.invisible} still at opacity 0`);
      check(`${tag}: no broken media`, audit.broken === 0, `${audit.broken}`);
      check(`${tag}: no distorted media`, audit.distorted === 0, `${audit.distorted}`);
      check(`${tag}: no empty sections`, audit.empty === 0, audit.emptyDetail.join(" ;; "));
      check(`${tag}: no actionless CTA`, audit.actionless === 0, `${audit.actionless}`);
      check(`${tag}: no placeholder text`, audit.placeholders === 0, `${audit.placeholders}`);
      check(`${tag}: images carry alt text`, audit.imagesWithoutAlt === 0, `${audit.imagesWithoutAlt} without alt`);
      check(`${tag}: no photograph is used twice`, audit.repeated === 0, `${audit.repeated} repeats`);
      // Analysed here rather than in the page — see the note in the audit.
      const norm = (t: string) => t.trim().toLowerCase().replace(/[.!?,:;'"]+/g, "").replace(/\s+/g, " ");
      const seenH = new Set<string>();
      const repeatedHeadings = audit.headings.filter((h) => {
        const k = norm(h);
        if (seenH.has(k)) return true;
        seenH.add(k);
        return false;
      });
      // The page's own ask is whichever label appears most; a generic starter
      // that is not that label is the seeded default leaking through.
      const GENERIC = ["get started", "submit", "continue", "click here", "learn more"];
      const counts = new Map<string, number>();
      for (const l of audit.buttonLabels) counts.set(norm(l), (counts.get(norm(l)) ?? 0) + 1);
      const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      const genericCtas = audit.buttonLabels.filter((l) => GENERIC.includes(norm(l)) && norm(l) !== dominant);

      check(`${tag}: no heading is printed twice`, repeatedHeadings.length === 0, repeatedHeadings.map((h) => `"${h.slice(0, 44)}"`).join(", "));
      check(`${tag}: every CTA asks in the page's own words`, genericCtas.length === 0, genericCtas.map((c) => `"${c}"`).join(", "));
      check(`${tag}: no dead bands`, audit.deadBands === 0, audit.deadBandDetail.join(" ;; "));
      if (device === "desktop") {
        check(`${tag}: no wall-of-text line lengths`, audit.tooWide === 0, `${audit.tooWide} paragraphs >900px`);
        // The headline finding: is the page one pattern repeated?
        check(
          `${tag}: the page is not one layout repeated`,
          audit.sections === 0 || audit.gridy / audit.sections < 0.6,
          `${audit.gridy}/${audit.sections} sections are card grids`,
        );
        check(`${tag}: the page carries media at all`, audit.images > 0, `${audit.images} images`);
      }
      await c.close();
    }
  }
  await browser.close();
  console.log(`\nscreenshots: ${OUT}`);
} finally {
  for (const m of made) await db.doc(`funnels/${m.funnelId}`).delete().catch(() => {});
  for (const coll of ["forms", "workflows", "message_templates"]) {
    const snap = await db.collection(coll).where("subAccountId", "==", SA).get().catch(() => null);
    if (snap) for (const d of snap.docs) await d.ref.delete().catch(() => {});
  }
  await db.doc(`subAccounts/${SA}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY}`).delete().catch(() => {});
}

console.log(failures === 0 ? "\nDETERMINISTIC QUALITY: ALL CHECKS PASSED\n" : `\nDETERMINISTIC QUALITY: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
