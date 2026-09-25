/**
 * IMAGE DIRECTOR — P0.5.
 *
 * Produces a PAGE-LEVEL visual plan BEFORE any placement happens. This is the
 * architectural form of the Apostille lesson: that page failed not because
 * individual images were bad — several were the business's own — but because
 * nothing governed the collection of decisions. Section-by-section scoring
 * yields individually reasonable choices that add up to a bad page.
 *
 * Ordering, in priority: authenticity -> relevance -> quality ->
 * composition need -> placement.
 *
 * First-party status is a strong POSITIVE SIGNAL, never a placement
 * entitlement. There is deliberately no `mustUseFirstParty` anywhere in here:
 * a page is not required to use the business's own photography, and forcing
 * it is exactly how the Apostille page filled up with their own generic
 * stock-style imagery.
 *
 * Pure and synchronous: no Firestore, no network, no model call. That makes
 * the whole strategy testable against an adversarial asset library.
 */

import { assetKey } from "@/lib/funnels/asset-identity";

/** What a slot is FOR — decided before we know what will fill it. */
export type VisualRole = "hero" | "story_portrait" | "benefit" | "gallery" | "proof";

/**
 * Quality judgment. First-party is necessary context, not sufficient grounds:
 * an asset does not earn placement by living under /uploads/.
 */
export type AssetGrade =
  | "first_party_high"
  | "first_party_generic"
  | "first_party_poor"
  | "unusable";

export interface CandidateAsset {
  url: string;
  /** Classification from discovery: hero | photo | partner | logo | graphic … */
  classification: string;
  width: number | null;
  height: number | null;
  /** True photographs only. Marks, wordmarks and seals are not photography. */
  isPhotograph: boolean;
  /** Approved by the customer. Unapproved assets never reach a page. */
  approved: boolean;
  alt?: string | null;
}

/** How one slot resolves. Note that "none" and "photo needed" are real,
 *  first-class outcomes — not failures to fill a hole. */
export type SlotResolution =
  | { kind: "asset"; role: VisualRole; url: string; grade: AssetGrade }
  | { kind: "authentic_photo_required"; role: VisualRole; brief: string }
  | { kind: "intentionally_none"; role: VisualRole; reason: string };

export interface VisualPlan {
  hero: SlotResolution;
  /** One entry per section the plan gives imagery to. Sections absent from
   *  this list are intentionally text-only. */
  slots: { sectionType: string; resolution: SlotResolution }[];
  density: "sparse" | "balanced" | "rich";
  /** Why the plan looks the way it does — surfaced to the operator, and the
   *  thing that makes a "no image" decision legible rather than a bug. */
  notes: string[];
}

/** A page can carry only so much imagery before hierarchy collapses. */
const MAX_IMAGES_PER_PAGE = 6;
/** Below this, a gallery reads as a stub rather than a body of work. */
const MIN_GALLERY_IMAGES = 3;
/** A hero needs a normal landscape frame; wider is a banner strip. */
const HERO_MIN_WIDTH = 900;
const HERO_MIN_RATIO = 1.25;
const HERO_MAX_RATIO = 2.6;

function ratio(a: CandidateAsset): number {
  return a.width && a.height ? a.width / a.height : 0;
}

/**
 * IS THIS ACTUALLY A PHOTOGRAPH, OR HAVE WE ONLY BEEN TOLD SO?
 *
 * `isPhotograph` arrives from discovery's classification, and discovery can be
 * wrong in a way that no amount of downstream grading notices. The RWAR page
 * shipped a Hague-Convention COUNTRY MAP as its hero, its first gallery tile
 * and its problem beat, because discovery had filed that diagram under
 * "customer" — a photographic class — so every consumer downstream treated the
 * claim as fact.
 *
 * The repair is not to guess harder at what the file depicts. It is to stop
 * treating an unsubstantiated claim as a substantiated one, and to let each
 * pool decide how much substantiation it needs:
 *
 *   "not_photo"   discovery says drawn, or says nothing we recognise.
 *   "unverified"  a photographic class, but no dimensions to corroborate it.
 *                 Real photographs land here constantly (discovery often
 *                 cannot measure a remote file), so this is NOT a rejection —
 *                 it is "usable where shape does not have to be trusted".
 *   "confirmed"   a photographic class AND dimensions consistent with a real
 *                 photograph rather than an icon or a banner strip.
 *
 * Deliberately no filename, domain or extension heuristics: those would be the
 * special-casing this repair exists to avoid, and they break the moment a
 * business serves photographs from a CDN path that looks like anything else.
 */
export type PhotographConfidence = "confirmed" | "unverified" | "not_photo";

/** Below this in either axis it is an icon or a thumbnail, not a photograph. */
const PHOTO_MIN_EDGE = 400;
/** Beyond this it is a banner strip or a tall infographic, not a photograph. */
const PHOTO_MAX_RATIO = 4;
const PHOTO_MIN_RATIO = 0.25;

export function photographConfidence(a: CandidateAsset): PhotographConfidence {
  if (!a.isPhotograph) return "not_photo";
  const w = a.width ?? 0;
  const h = a.height ?? 0;
  if (w <= 0 || h <= 0) return "unverified";
  if (w < PHOTO_MIN_EDGE || h < PHOTO_MIN_EDGE) return "not_photo";
  const r = w / h;
  if (r > PHOTO_MAX_RATIO || r < PHOTO_MIN_RATIO) return "not_photo";
  return "confirmed";
}

/**
 * Grade one candidate. Generic-looking first-party photography is graded
 * HONESTLY as generic — the whole point is that we would rather use fewer,
 * stronger images than every image the business happens to own.
 */
export function gradeAsset(a: CandidateAsset): AssetGrade {
  if (!a.approved) return "unusable";
  if (!a.isPhotograph) return "unusable"; // marks/seals are never photography
  const w = a.width ?? 0;
  const h = a.height ?? 0;
  if (w > 0 && h > 0 && (w < 400 || h < 400)) return "first_party_poor";
  // Hash-named files with no alt carry no signal about subject; they are
  // usable but unremarkable. A descriptive alt is real evidence of intent.
  const described = !!a.alt && a.alt.trim().length > 3 && !/^(img|dsc|photo)[-_ ]?\d+/i.test(a.alt.trim());
  if (w >= 1200 && described) return "first_party_high";
  if (w >= 800) return described ? "first_party_high" : "first_party_generic";
  return "first_party_generic";
}

const RANK: Record<AssetGrade, number> = {
  first_party_high: 3,
  first_party_generic: 2,
  first_party_poor: 1,
  unusable: 0,
};

/**
 * THE PLAN. Decides the whole page's visual shape before anything is placed.
 */
export function planPageVisuals(input: {
  sectionTypes: string[];
  assets: CandidateAsset[];
  /** Shooting brief for a photo only the business can supply. */
  heroBrief?: string | null;
  /** Some archetypes deliberately lead with a clean headline. */
  heroPrefersText?: boolean;
  /**
   * An asset ALREADY occupying the hero, decided before this plan ran — a
   * model-supplied image or an operator's own edit.
   *
   * Without it the planner chose a hero in ignorance, found none, and left the
   * real hero image sitting in the candidate pool for a later section to place
   * a second time. Treating the hero as consumed is the point: downstream
   * slots must never re-spend an image the page has already shown at its
   * largest and most prominent.
   */
  heroAlreadyUrl?: string | null;
}): VisualPlan {
  const notes: string[] = [];
  // "poor" is excluded from PLACEMENT, not merely ranked last. A weak image
  // on the page is worse than a deliberate gap: it degrades the whole
  // composition while looking like the slot is handled. Caught by the
  // adversarial suite placing a 147x147 thumbnail in a gallery.
  const usable = input.assets
    .map((a) => ({ a, grade: gradeAsset(a) }))
    .filter((x) => x.grade !== "unusable" && x.grade !== "first_party_poor")
    .sort((x, y) => RANK[y.grade] - RANK[x.grade] || (y.a.width ?? 0) - (x.a.width ?? 0));

  // Deduplicate by ASSET, not by URL. A real site serves one upload from
  // several URLs — WordPress alone emits a size variant and an edit revision
  // per image — so a string comparison sees four assets where a visitor sees
  // one picture four times. See asset-identity.ts.
  const seen = new Set<string>();
  const pool = usable.filter((x) => {
    const k = assetKey(x.a.url);
    return seen.has(k) ? false : (seen.add(k), true);
  });

  const rejected = input.assets.length - pool.length;
  if (rejected > 0) notes.push(`${rejected} asset(s) excluded: marks, seals, unapproved, low quality, too small or duplicate.`);

  // ── 1. HERO, decided separately and first ──────────────────────────────
  const heroCandidate = pool.find(
    (x) => (x.a.width ?? 0) >= HERO_MIN_WIDTH && ratio(x.a) >= HERO_MIN_RATIO && ratio(x.a) <= HERO_MAX_RATIO,
  );
  let hero: SlotResolution;
  if (input.heroAlreadyUrl) {
    // Already decided elsewhere. Reported as an asset purely so `heroUrl`
    // below marks it consumed; nothing downstream re-places it.
    hero = { kind: "asset", role: "hero", url: input.heroAlreadyUrl, grade: "first_party_high" };
    notes.push("Hero was already set before planning; treated as consumed.");
  } else if (input.heroPrefersText) {
    hero = { kind: "intentionally_none", role: "hero", reason: "This page leads with the headline and offer; imagery follows below." };
    notes.push("Hero is intentionally text-led.");
  } else if (heroCandidate) {
    hero = { kind: "asset", role: "hero", url: heroCandidate.a.url, grade: heroCandidate.grade };
  } else {
    hero = {
      kind: "authentic_photo_required",
      role: "hero",
      brief: input.heroBrief?.trim() || "A wide photograph of the business at work, suitable for the top of the page.",
    };
    notes.push("No landscape photograph is available for the hero.");
  }
  const heroUrl = hero.kind === "asset" ? hero.url : null;

  // ── 2. Which sections actually BENEFIT from imagery ────────────────────
  const heroKey = assetKey(heroUrl);
  const remaining = pool.filter((x) => heroKey === "" || assetKey(x.a.url) !== heroKey);
  let budget = MAX_IMAGES_PER_PAGE - (heroUrl ? 1 : 0);
  const slots: VisualPlan["slots"] = [];
  const take = () => (budget > 0 && remaining.length ? (budget--, remaining.shift()!) : null);

  // A story section is strengthened by one human portrait, not a landscape.
  if (input.sectionTypes.includes("story")) {
    const portrait = remaining.find((x) => ratio(x.a) > 0 && ratio(x.a) < 1.1);
    if (portrait) {
      remaining.splice(remaining.indexOf(portrait), 1);
      budget--;
      slots.push({ sectionType: "story", resolution: { kind: "asset", role: "story_portrait", url: portrait.a.url, grade: portrait.grade } });
    } else {
      slots.push({
        sectionType: "story",
        resolution: { kind: "authentic_photo_required", role: "story_portrait", brief: "A photograph of the person or team behind the business." },
      });
    }
  }

  // ── 2b. NARRATIVE BEATS GET THEIR IMAGE BEFORE ANY POOL DOES ───────────
  //
  // This ordering IS the repair. Every slot above gates on metadata (a hero
  // needs a known landscape frame; a benefit needs a high grade), and the
  // gallery below gated on nothing but a count — so on a library whose assets
  // carry no dimensions, every single asset failed every gate above and fell
  // into the gallery. The RWAR page is that arithmetic: four images, all of
  // them stacked in one grid under the hero, six sections left text-only, and
  // nothing anywhere deciding that was a bad page.
  //
  // A narrative beat composes a visual BESIDE a claim, at the section's own
  // width, so it does not need the shape guarantees a hero or a grid does.
  // That makes it the right home for an "unverified" photograph, and the right
  // claim on the budget ahead of a pool.
  //
  // Strictly bounded: these are the split-composition hosts that
  // visual-placement.ts already admits. Nothing here adds imagery to a section
  // type that is meant to stay text-led, and none of these is required to
  // receive an image — a beat with nothing left in the pool stays text-led,
  // which is a real outcome and not a shortfall.
  for (const beatType of ["problem_solution", "callout"] as const) {
    if (!input.sectionTypes.includes(beatType)) continue;
    const beatAsset = remaining.find((x) => photographConfidence(x.a) !== "not_photo");
    if (!beatAsset) continue;
    remaining.splice(remaining.indexOf(beatAsset), 1);
    budget--;
    slots.push({
      sectionType: beatType,
      resolution: { kind: "asset", role: "benefit", url: beatAsset.a.url, grade: beatAsset.grade },
    });
  }

  // Benefit items read better with one image each — but only where a
  // genuinely good asset exists. A weak image beside a strong claim
  // undermines it, so a generic-grade asset is not spent here.
  if (input.sectionTypes.includes("benefits_grid")) {
    const strong = remaining.filter((x) => x.grade === "first_party_high").slice(0, 3);
    for (const s of strong) {
      remaining.splice(remaining.indexOf(s), 1);
      budget--;
      slots.push({ sectionType: "benefits_grid", resolution: { kind: "asset", role: "benefit", url: s.a.url, grade: s.grade } });
    }
    if (strong.length === 0) {
      notes.push("Benefits are text-only: no image was strong enough to support a claim.");
    }
  }

  // ── 3. Gallery only if there is genuinely a BODY of work to show ────────
  //
  // A gallery asserts something the other slots do not: that these pictures
  // are worth looking at TOGETHER, as a body of work. That claim can only be
  // made about photographs we are actually sure are photographs — so this is
  // the one pool that demands "confirmed" rather than merely "not ruled out".
  //
  // It also stops the gallery being the place unplaceable assets accumulate.
  // Everything above accepts an unverified photograph; if the gallery did too,
  // it would keep collecting whatever the earlier gates rejected, which is
  // precisely how four country-maps-and-documents ended up in a grid on a
  // school's booking page.
  if (input.sectionTypes.includes("photo_gallery")) {
    const galleryEligible = remaining.filter((x) => photographConfidence(x.a) === "confirmed");
    const forGallery = galleryEligible.slice(0, Math.max(0, Math.min(budget, 4)));
    if (forGallery.length >= MIN_GALLERY_IMAGES) {
      for (const g of forGallery) {
        remaining.splice(remaining.indexOf(g), 1);
        budget--;
        slots.push({ sectionType: "photo_gallery", resolution: { kind: "asset", role: "gallery", url: g.a.url, grade: g.grade } });
      }
    } else {
      slots.push({
        sectionType: "photo_gallery",
        resolution: {
          kind: "intentionally_none",
          role: "gallery",
          reason: `A gallery needs at least ${MIN_GALLERY_IMAGES} strong photographs; ${forGallery.length} available.`,
        },
      });
      notes.push("Gallery omitted rather than shown thin, a two-image grid reads as a stub.");
    }
  }

  const placed = slots.filter((s) => s.resolution.kind === "asset").length + (heroUrl ? 1 : 0);
  const density: VisualPlan["density"] = placed <= 1 ? "sparse" : placed <= 4 ? "balanced" : "rich";
  if (placed === 0) notes.push("This page is intentionally text-led; no imagery met the bar.");

  return { hero, slots, density, notes };
}

/** Every unresolved slot, as an actionable request rather than a blank box. */
export function outstandingPhotoRequests(plan: VisualPlan): { role: VisualRole; brief: string }[] {
  const out: { role: VisualRole; brief: string }[] = [];
  if (plan.hero.kind === "authentic_photo_required") out.push({ role: plan.hero.role, brief: plan.hero.brief });
  for (const s of plan.slots) {
    if (s.resolution.kind === "authentic_photo_required") out.push({ role: s.resolution.role, brief: s.resolution.brief });
  }
  return out;
}
