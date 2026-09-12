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

/** Words that carry no subject meaning, so they must not earn a match. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "at", "for", "with", "to", "from", "by",
  "professional", "work", "progress", "close", "up", "detail", "during", "present", "person",
  "people", "someone", "photo", "image", "picture", "view", "shot", "background", "modern",
]);

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
    // The offer line names WHAT THE BUSINESS IS ABOUT, in its own words, and a
    // photograph of this business should be of that. It sits above the
    // mechanism now because the mechanism is a sentence describing a PROCESS
    // ("a first visit that is assessment only, with no treatment on the day"),
    // which makes a poor photo brief — the dental page searched on it and got
    // nothing recognisably dental, because the sentence never says so.
    ctx.offer,
    ctx.mechanism,
  ];
  for (const candidate of ladder) {
    const t = candidate?.trim();
    if (t && t.length > 3) return asPhotoSubject(toSubject(t));
  }
  return null;
}

/**
 * A photo brief is a NOUN PHRASE, not a sentence.
 *
 * Whatever the ladder above returns may be a full line of marketing copy, and
 * both things downstream suffer for it: the provider searches on a sentence and
 * matches its least important words, and the relevance test ends up comparing a
 * short caption against a dozen terms. Keeping the first few meaningful words
 * gives a subject that a photograph can actually be OF.
 */
function asPhotoSubject(text: string): string {
  const words = text
    .split(/\s+/)
    .filter((w) => {
      const c = w.toLowerCase().replace(/[^a-z0-9]/g, "");
      return c.length > 2 && !STOPWORDS.has(c);
    })
    .slice(0, 5);
  return words.length > 0 ? words.join(" ") : text;
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
      // The hero's job on a service page is not to depict the category, it is
      // to show the work being done — an inspection happening, not a roof.
      purpose: "show_the_work",
      // Phrased so the PROVIDER is also biased toward a working photograph
      // rather than scenery, since the query is the only lever on what comes
      // back before anything can be judged.
      subject: `${core} being carried out by a specialist`,
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

/**
 * IS THIS ACTUALLY A PICTURE OF WHAT THE SLOT ASKED FOR?
 *
 * The provider returns whatever it considers a match and the resolver took the
 * first result, so a roof-inspection hero shipped a photograph of two people in
 * hard hats standing indoors next to a window. That is semantically adjacent to
 * "construction" and it is not a roof, and a visibly wrong photograph costs more
 * trust than no photograph costs interest.
 *
 * So a candidate is scored against the SLOT'S OWN SUBJECT rather than the
 * business's industry. The score is the share of the subject's meaningful words
 * that appear in the candidate's own description — deliberately crude, because
 * the decision it drives is only accept-or-reject and a crude measure that
 * rejects honestly beats a clever one that rationalises.
 *
 * Nothing here is specific to any industry: the vocabulary comes from the
 * intent, which came from the business's own facts.
 */



function meaningfulWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Do two words name the same thing? A shared four-character opening is enough:
 * it makes roof/roofer/roofing, inspect/inspection/inspecting and
 * dental/dentist the same subject without pulling in a stemmer, and it is short
 * enough to be forgiving of the tense and number differences between a query
 * and a caption.
 */
function sameSubject(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)) return true;
  return a.length > 4 && b.length > 4 && (a.includes(b) || b.includes(a));
}

/**
 * HOW MANY OF THE SLOT'S SUBJECT TERMS THIS CANDIDATE ACTUALLY DEPICTS.
 *
 * A count, not a coverage ratio, and that is a correction to a first attempt.
 * Scoring as "share of the subject's words present" sounds right and punishes
 * candidates for the length of the QUERY rather than their own relevance: a
 * genuinely good dental photograph captioned "Dentist examining a patient"
 * covers one word of a five-word brief, scores 0.2, and is thrown away. That
 * version rejected every photograph on all five fixtures, including four
 * perfectly good ones, which is a worse failure than the one it was fixing.
 *
 * Sharing two real subject words is the test. It is hard to do by accident and
 * easy to do when the photograph is actually of the thing.
 */
export function countMediaMatches(intent: Pick<MediaIntent, "subject">, candidateDescription: string): number {
  const wanted = new Set(meaningfulWords(intent.subject));
  const got = new Set(meaningfulWords(candidateDescription));
  // An unlabelled photograph is not evidence that it depicts the right thing.
  if (wanted.size === 0 || got.size === 0) return 0;
  let hits = 0;
  for (const w of wanted) {
    for (const g of got) {
      if (sameSubject(w, g)) {
        hits++;
        break;
      }
    }
  }
  return hits;
}

/**
 * The bar a candidate must clear to be placed.
 *
 * Two shared subject terms, or one when the brief only has one or two to give.
 * Set here because of what the two mistakes cost: below it the page composes
 * from verified content instead, which is always defensible; above it the page
 * shows a photograph that is genuinely about its subject. Rejecting a usable
 * photo costs a little warmth. Placing a wrong one costs the visitor's belief
 * in everything around it.
 */
export function mediaIsRelevant(intent: Pick<MediaIntent, "subject">, candidateDescription: string): boolean {
  const wanted = new Set(meaningfulWords(intent.subject)).size;
  const hits = countMediaMatches(intent, candidateDescription);
  return wanted <= 2 ? hits >= 1 : hits >= 2;
}

/**
 * WORDS THAT MEAN SOMEONE IS DOING THE THING.
 *
 * Generic, never industry-specific: these describe a photograph in which work
 * is being PERFORMED or a customer is present, as opposed to a picture of the
 * category's scenery.
 */
const ACTION_CUES = [
  "inspect", "examin", "check", "repair", "install", "fix", "measur", "assess", "review",
  "work", "perform", "service", "treat", "clean", "build", "test", "survey", "consult",
  "explain", "show", "discuss", "meet", "advis", "help", "teach", "present",
];
const PERSON_CUES = [
  // Roles a caption uses for WHOEVER is doing the work or receiving it, kept
  // generic rather than per-trade: the participle test above catches the verb,
  // these catch a caption that names a person without one.
  "worker", "specialist", "professional", "staff", "team", "crew", "expert",
  "customer", "client", "patient", "homeowner", "owner", "man", "woman", "person", "people", "hands",
];

/**
 * DOES THIS PHOTOGRAPH SHOW THE JOB BEING DONE?
 *
 * Relevance alone is not persuasion. The Summit hero shipped a technically
 * relevant photograph — an actual roofline — for a page whose entire offer is
 * an INSPECTION, and a picture of a roof sells nothing that the headline has
 * not already said. A picture of someone inspecting a roof is evidence that
 * the service exists and is performed by people.
 *
 * So a relevant candidate that also depicts the action, or the person doing
 * it, outranks relevant scenery. Derived from the slot's purpose rather than
 * from any industry: every business has work being performed and a customer
 * receiving it, and these cues describe that shape in general terms.
 */
export function scoreActionFit(candidateDescription: string): number {
  const text = candidateDescription.toLowerCase();
  // A present participle is the generic signal that something is HAPPENING —
  // kneading, examining, inspecting, fitting. Listing the verbs instead would
  // mean naming every trade, which is the hardcoding this is supposed to
  // avoid; the explicit cues below only add the ones a caption might use as a
  // noun ("a roof repair", "an inspection") where no participle appears.
  const participle = /\b[a-z]{4,}ing\b/.test(text) ? 1 : 0;
  const action = participle || ACTION_CUES.some((c) => text.includes(c)) ? 1 : 0;
  const person = PERSON_CUES.some((c) => text.includes(c)) ? 1 : 0;
  return action + person;
}

/**
 * Pick the candidate that best depicts the subject BEING DONE, or nothing.
 *
 * Ordered on subject match first — a vivid photograph of the wrong thing is
 * still the wrong thing — and on action fit second, so among candidates that
 * are equally about the subject the working one wins. Purpose weights it:
 * a slot whose job is to show the work or humanise the business cares more
 * about action than one merely establishing context.
 */
export function selectRelevantMedia<T extends { alt: string }>(
  intent: Pick<MediaIntent, "subject"> & { purpose?: MediaPurpose },
  candidates: T[],
): { pick: T; matches: number; action: number } | null {
  const purposeWeight = intent.purpose === "establish_context" ? 1 : 2;
  let best: { pick: T; matches: number; action: number; rank: number } | null = null;
  for (const c of candidates) {
    if (!mediaIsRelevant(intent, c.alt)) continue;
    const matches = countMediaMatches(intent, c.alt);
    const action = scoreActionFit(c.alt);
    // Subject match dominates; action fit breaks ties and can lift a candidate
    // one subject-term behind a piece of scenery.
    const rank = matches * 3 + action * purposeWeight;
    if (!best || rank > best.rank) best = { pick: c, matches, action, rank };
  }
  return best ? { pick: best.pick, matches: best.matches, action: best.action } : null;
}
