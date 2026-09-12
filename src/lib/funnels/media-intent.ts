import type { AuthenticityCategory } from "@/lib/funnels/authenticity";
import type { FunnelSectionType } from "@/types/funnels";

/**
 * MEDIA AS A PLANNING DECISION, NOT A SEARCH STRING.
 *
 * What this replaces: one unstructured string — `mediaSubject || heroMediaBrief
 * || ""` — used as the Pexels query for the whole page, filling the hero and
 * then the benefit rows from the same result set by array index. Two failures
 * followed from that, both observed on real generations:
 *
 *   1. When the model supplied neither field the string was empty, and
 *      `searchSubjectImages` returns [] for an empty query. The page rendered
 *      with ZERO images and nothing reported a problem, because imagery is
 *      best-effort by design.
 *   2. When it was supplied, every slot on the page got a photo drawn from one
 *      query, so a hero and three benefit rows were four near-identical
 *      results for the same phrase. Media that repeats is media that reads as
 *      filler.
 *
 * So intent is derived HERE, per slot, from facts the generator already holds:
 * what the business does, what the section's persuasion job is, and what kind
 * of evidence is honest for this category. A slot asks for
 * "roof inspector examining damaged shingles on a residential roof" rather than
 * inheriting "roofing".
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not invent business facts, and it
 * never returns intent for a slot where a photograph would be counterfeit
 * evidence — a product shot for a business whose product we have never seen, a
 * "team" for a team we cannot picture. Those return no intent and the section
 * composes text-led, which is the honest outcome and is why `NO_MEDIA` is a
 * first-class result rather than a failure.
 */

/** Why a slot wants a picture. Drives the phrasing of the query. */
export type MediaPurpose =
  | "establish_context" // show the world the customer is in
  | "show_the_work" // the service being performed
  | "show_the_deliverable" // what the customer receives
  | "humanise" // a person, where a person is the reassurance
  | "none";

export interface MediaIntent {
  /** Which section this is for, and which slot within it. */
  sectionType: FunnelSectionType;
  slot: "hero" | "benefit_item" | "story" | "gallery";
  purpose: MediaPurpose;
  /** The actual search subject, written as a photo brief rather than a keyword. */
  subject: string;
  /** Shape the slot renders at, so a portrait is never asked for a 21:9 band. */
  aspect: "landscape" | "portrait" | "square";
  /** Alt text is written from the intent, so it survives even when the
   *  provider returns nothing useful. */
  altPrefix: string;
}

/** Business facts the planner is allowed to reason from. All optional: a
 *  thinner context yields a less specific brief, never a fabricated one. */
export interface MediaPlanningContext {
  businessName?: string | null;
  /** What the business actually does, in the operator's own words. */
  whatTheyDo?: string | null;
  /** The offer being converted on. */
  offer?: string | null;
  /** Free-text industry/vertical if known. */
  industry?: string | null;
  /** Model-supplied subject, when there is one. Still the strongest signal. */
  explicitSubject?: string | null;
  /** The sales argument's mechanism: the work this business actually performs.
   *  Always present on a generated funnel, which is what makes it a reliable
   *  floor when no explicit subject was written. */
  mechanism?: string | null;
  authenticityCategory: AuthenticityCategory;
}

/**
 * Categories where ambient/context photography is honest. A stock photo of
 * "software" is a lie about a product nobody has seen; a stock photo of a roof
 * being inspected is an honest depiction of the work a roofer does.
 */
const AMBIENT_HONEST: AuthenticityCategory[] = ["local_service_health", "local_service_trade", "b2b_services"];

/** Strip marketing scaffolding so the query is a subject, not a sentence. */
function toSubject(text: string): string {
  return text
    .replace(/\s*[·|]\s*Purpose:.*/i, "")
    .replace(/\s*[·|]\s*Recommended.*/i, "")
    .replace(/[.!?]+$/, "")
    .trim()
    .slice(0, 90);
}

/**
 * The single most specific description of the work available.
 *
 * The ladder matters: an explicit subject is the operator's own words and wins.
 * Below it are fields `create_funnel` ALWAYS has, because the previous version
 * stopped at `explicitSubject` and returned null whenever the model happened
 * not to supply one — which was most generations, and was the second half of
 * why deployed pages had no images at all.
 */
function coreSubject(ctx: MediaPlanningContext): string | null {
  const ladder = [
    ctx.explicitSubject,
    ctx.whatTheyDo,
    ctx.industry,
    // The sales argument's mechanism names the actual work being done, which is
    // exactly what a photograph of this business should show.
    ctx.mechanism,
    ctx.offer,
  ];
  for (const candidate of ladder) {
    const t = candidate?.trim();
    if (t && t.length > 3) return toSubject(t);
  }
  return null;
}

/**
 * Plan the page's media, slot by slot.
 *
 * `benefitCount` is how many benefit rows exist; each gets its OWN intent so
 * they cannot all resolve to the same photograph.
 */
export function planMediaIntents(
  ctx: MediaPlanningContext,
  slots: { hero: boolean; benefitCount: number },
): MediaIntent[] {
  const core = coreSubject(ctx);
  // No honest subject means no honest photo. Text-led is the correct page.
  if (!core) return [];
  if (!AMBIENT_HONEST.includes(ctx.authenticityCategory)) return [];

  const intents: MediaIntent[] = [];

  if (slots.hero) {
    intents.push({
      sectionType: "hero",
      slot: "hero",
      purpose: "establish_context",
      // The hero establishes that this is a real operation doing real work.
      subject: `professional ${core} work in progress`,
      aspect: "landscape",
      altPrefix: `${ctx.businessName ?? "The team"} carrying out ${core}`,
    });
  }

  // Each benefit row gets a DIFFERENT angle on the same work, so the page does
  // not repeat one photograph four times. Deliberately few: three angles is the
  // honest limit before the variations become arbitrary.
  const angles: { suffix: string; purpose: MediaPurpose; alt: string }[] = [
    { suffix: "close up detail", purpose: "show_the_work", alt: `Detail of ${core}` },
    { suffix: "specialist inspecting and documenting", purpose: "show_the_deliverable", alt: `Documenting findings during ${core}` },
    { suffix: "with a homeowner or client present", purpose: "humanise", alt: `Discussing ${core} with a customer` },
  ];
  for (let i = 0; i < Math.min(slots.benefitCount, angles.length); i++) {
    const a = angles[i];
    intents.push({
      sectionType: "benefits_grid",
      slot: "benefit_item",
      purpose: a.purpose,
      subject: `${core} ${a.suffix}`,
      aspect: "landscape",
      altPrefix: a.alt,
    });
  }

  return intents;
}
