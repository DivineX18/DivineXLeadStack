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

  // Deduplicate by URL. A real site serves one image from several entries.
  const seen = new Set<string>();
  const pool = usable.filter((x) => (seen.has(x.a.url) ? false : (seen.add(x.a.url), true)));

  const rejected = input.assets.length - pool.length;
  if (rejected > 0) notes.push(`${rejected} asset(s) excluded: marks, seals, unapproved, low quality, too small or duplicate.`);

  // ── 1. HERO, decided separately and first ──────────────────────────────
  const heroCandidate = pool.find(
    (x) => (x.a.width ?? 0) >= HERO_MIN_WIDTH && ratio(x.a) >= HERO_MIN_RATIO && ratio(x.a) <= HERO_MAX_RATIO,
  );
  let hero: SlotResolution;
  if (input.heroPrefersText) {
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
  const remaining = pool.filter((x) => x.a.url !== heroUrl);
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
  if (input.sectionTypes.includes("photo_gallery")) {
    const forGallery = remaining.slice(0, Math.max(0, Math.min(budget, 4)));
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
      notes.push("Gallery omitted rather than shown thin — a two-image grid reads as a stub.");
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
