/**
 * MEDIA IS A STORYTELLING RESOURCE, NOT A POOL TO BE FILLED.
 *
 * Locks the RWAR Star Academy regression (funnel VG5x6TZrLZtu0mIRMjbt,
 * 2026-09-18): a school's booking page shipped with four of another business's
 * photographs stacked in one grid under the hero, six sections left text-only,
 * and ONE file — a Hague-Convention country map, classified "customer" by
 * discovery and therefore believed to be a photograph — occupying the hero, the
 * first gallery tile and the problem beat at the same time.
 *
 * Three independent mechanisms produced that page, and each has a test here:
 *   - the gallery was the only pool with no quality gate, so everything that
 *     failed a gate elsewhere accumulated in it (A, B, H);
 *   - a gallery was created because an archetype said "team_photo", with
 *     nothing asking whether a collection meant anything for this offer (C, I);
 *   - a diagram was trusted as a photograph on discovery's word alone (D).
 *
 * Pure: no Firestore, no network, no model call, no generation credits.
 * Run: npx tsx scripts/verify-media-distribution.mts
 */
import {
  planPageVisuals,
  photographConfidence,
  gradeAsset,
  type CandidateAsset,
} from "../src/lib/funnels/image-director.ts";
import { compositionForSection } from "../src/lib/funnels/visual-placement.ts";
import type { FunnelSection } from "../src/types/funnels.ts";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}

/** An asset shaped exactly as discovery emits one: no dimensions measured. */
const undimensioned = (url: string, classification = "customer"): CandidateAsset => ({
  url,
  classification,
  width: null,
  height: null,
  isPhotograph: true,
  approved: true,
  alt: "brand_discovery",
});

/** A real, measured photograph. */
const photo = (url: string, width = 1600, height = 1067): CandidateAsset => ({
  url,
  classification: "photo",
  width,
  height,
  isPhotograph: true,
  approved: true,
  alt: "team at work on site",
});

/** THE EXACT LIBRARY THAT PRODUCED THE REGRESSION. */
const RWAR_LIBRARY: CandidateAsset[] = [
  undimensioned("https://apostillecorp.com/a/Lang-Hague-Members.webp"),
  undimensioned("https://apostillecorp.com/a/hero-bg02-1.webp", "event"),
  undimensioned("https://apostillecorp.com/a/apostille-documents.webp", "event"),
  undimensioned("https://apostillecorp.com/a/legalize-documents.jpg", "event"),
];

/** The section sequence that page actually shipped. */
const RWAR_SECTIONS = [
  "hero",
  "photo_gallery",
  "problem_solution",
  "benefits_grid",
  "offer",
  "included",
  "agenda",
  "faq",
  "cta_banner",
];

const galleryUrls = (plan: ReturnType<typeof planPageVisuals>) =>
  plan.slots
    .filter((s) => s.sectionType === "photo_gallery" && s.resolution.kind === "asset")
    .map((s) => (s.resolution as { url: string }).url);

// ── A. A service page does not dump all media into the gallery ────────────
{
  const plan = planPageVisuals({ sectionTypes: RWAR_SECTIONS, assets: RWAR_LIBRARY, heroBrief: null });
  check(
    "A1. the RWAR library no longer puts every asset in one gallery",
    galleryUrls(plan).length < RWAR_LIBRARY.length,
  );
  check("A2. in fact it places none there, because none is a confirmed photograph", galleryUrls(plan).length === 0);
  check(
    "A3. the gallery records WHY it is empty rather than silently vanishing",
    plan.slots.some((s) => s.sectionType === "photo_gallery" && s.resolution.kind === "intentionally_none"),
  );
}

// ── B. Compatible story slots receive media BEFORE the gallery ────────────
{
  const plan = planPageVisuals({ sectionTypes: RWAR_SECTIONS, assets: RWAR_LIBRARY, heroBrief: null });
  const beat = plan.slots.find((s) => s.sectionType === "problem_solution");
  check("B1. the problem_solution beat is given an asset", beat?.resolution.kind === "asset");
  check(
    "B2. the beat is served before the gallery, which gets nothing",
    beat?.resolution.kind === "asset" && galleryUrls(plan).length === 0,
  );
  const callout = planPageVisuals({
    sectionTypes: ["hero", "callout", "photo_gallery"],
    assets: [undimensioned("https://x.test/one.jpg")],
    heroBrief: null,
  }).slots.find((s) => s.sectionType === "callout");
  check("B3. a callout is an eligible narrative host too", callout?.resolution.kind === "asset");
}

// ── C/I. A gallery requires gallery-appropriate CONTEXT ───────────────────
// The context decision lives in capabilities.ts (whether a photo_gallery
// section is created at all). Asserted structurally: a regex here is the only
// way to reach a decision embedded in a 7k-line capability without running a
// model call, and the alternative is not testing it.
{
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../src/lib/ai-suite/capabilities.ts", import.meta.url), "utf8"),
  );
  check(
    "C1. gallery creation is no longer decided by the media strategy alone",
    /wantsGallerySection\s*=\s*[\s\S]{0,400}?GALLERY_JUSTIFYING_CATEGORIES\.has\(authenticityCategory\)/.test(src),
  );
  check(
    "C2. professional/consulting/SaaS/info categories are NOT gallery-justifying",
    (() => {
      const block = src.match(/GALLERY_JUSTIFYING_CATEGORIES\s*=\s*new Set<[^>]*>\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
      return (
        !/b2b_services|enterprise_software|info_product|coaching|local_service_health/.test(block) &&
        /local_service_trade/.test(block)
      );
    })(),
  );
  check(
    "I1. portfolio-shaped businesses (trade work, physical product) still qualify",
    (() => {
      const block = src.match(/GALLERY_JUSTIFYING_CATEGORIES\s*=\s*new Set<[^>]*>\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
      return /local_service_trade/.test(block) && /physical_product/.test(block);
    })(),
  );
}

// ── I2. A genuine gallery business still gets a real gallery ──────────────
{
  const portfolio = [photo("https://t.test/1.jpg"), photo("https://t.test/2.jpg"), photo("https://t.test/3.jpg"), photo("https://t.test/4.jpg")];
  const plan = planPageVisuals({ sectionTypes: ["hero", "photo_gallery"], assets: portfolio, heroBrief: null });
  check("I2. four confirmed photographs DO fill a gallery", galleryUrls(plan).length >= 3);
}

// ── D. A non-photograph cannot enter a photograph pool ────────────────────
{
  const diagram: CandidateAsset = { ...photo("https://x.test/map.webp"), classification: "graphic", isPhotograph: false };
  check("D1. an asset discovery marked non-photographic is not a photograph", photographConfidence(diagram) === "not_photo");
  check("D2. and it is unusable for placement", gradeAsset(diagram) === "unusable");
  const icon: CandidateAsset = photo("https://x.test/icon.png", 64, 64);
  check("D3. an icon-sized file is not a photograph however it is classified", photographConfidence(icon) === "not_photo");
  const banner: CandidateAsset = photo("https://x.test/strip.jpg", 2400, 300);
  check("D4. a banner strip is not a photograph either", photographConfidence(banner) === "not_photo");
  const plan = planPageVisuals({ sectionTypes: ["hero", "photo_gallery"], assets: [diagram, icon, banner], heroBrief: null });
  check("D5. none of them reaches the gallery", galleryUrls(plan).length === 0);
}

// ── A4 fallback. Unknown dimensions do not exile an asset ─────────────────
{
  const a = undimensioned("https://x.test/unmeasured.jpg");
  check("D6. an unmeasured photograph is 'unverified', NOT rejected", photographConfidence(a) === "unverified");
  const plan = planPageVisuals({ sectionTypes: ["hero", "problem_solution", "photo_gallery"], assets: [a], heroBrief: null });
  check(
    "D7. and it is still placed — on a narrative beat, not dumped in the gallery",
    plan.slots.some((s) => s.sectionType === "problem_solution" && s.resolution.kind === "asset"),
  );
}

// ── F/G/H. Restraint is a valid outcome ───────────────────────────────────
{
  const one = photo("https://x.test/solo.jpg");
  const plan = planPageVisuals({ sectionTypes: ["hero", "benefits_grid", "offer", "faq"], assets: [one], heroBrief: null });
  check("H1. a single strong image is a valid sparse page", plan.density === "sparse");
  check("H2. it goes to the hero", plan.hero.kind === "asset");
  check(
    "F1. offer and faq are never given imagery",
    !plan.slots.some((s) => s.sectionType === "offer" || s.sectionType === "faq"),
  );
  check(
    "F2. and the composition layer still refuses those hosts outright",
    compositionForSection({ id: "x", type: "offer", config: {} } as FunnelSection) === null &&
      compositionForSection({ id: "y", type: "faq", config: {} } as FunnelSection) === null,
  );
  const textLed = planPageVisuals({ sectionTypes: ["hero", "offer"], assets: [], heroBrief: null });
  check("G1. a page with no assets is intentionally text-led, not broken", textLed.hero.kind === "authentic_photo_required");
  const prefersText = planPageVisuals({ sectionTypes: ["hero"], assets: [one], heroBrief: null, heroPrefersText: true });
  check("G2. hero diversity survives — a text-led hero is still reachable", prefersText.hero.kind === "intentionally_none");
}

// ── L. One URL cannot occupy gallery + hero + beat ────────────────────────
{
  const plan = planPageVisuals({ sectionTypes: RWAR_SECTIONS, assets: RWAR_LIBRARY, heroBrief: null });
  const used = [
    ...(plan.hero.kind === "asset" ? [plan.hero.url] : []),
    ...plan.slots.filter((s) => s.resolution.kind === "asset").map((s) => (s.resolution as { url: string }).url),
  ];
  check("L1. the plan never places one URL twice", new Set(used).size === used.length);

  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../src/lib/ai-suite/capabilities.ts", import.meta.url), "utf8"),
  );
  const block = src.match(/const placedUrls = new Set<string>\(\);[\s\S]*?\n        \}/)?.[0] ?? "";
  check("L2. page-level dedupe reads gallery images[]", /c\.images/.test(block) && /\.url/.test(block));
  check("L3. page-level dedupe reads beatVisual", /beatVisual/.test(block));
  check("L4. page-level dedupe reads grid item imageUrl", /items/.test(block) && /imageUrl/.test(block));
  check("L5. page-level dedupe reads proofShowcase", /proofShowcase/.test(block));
}

console.log(failures === 0 ? `\nverify-media-distribution: all checks passed` : `\nverify-media-distribution: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
