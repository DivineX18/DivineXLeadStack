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
  /**
   * THE PART OF THE BRIEF A PHOTOGRAPH HAS TO BE ABOUT.
   *
   * `subject` carries an angle the planner added — "close up detail", "with a
   * homeowner or client present" — to stop four slots resolving to one
   * photograph. That phrasing steers the PROVIDER, and it must not be
   * admissible as evidence of relevance: judged against the whole brief, a
   * real-estate handshake captioned "greeting a client at the entrance of a new
   * home" scored two matches on "client" and "home" and shipped onto a B2B
   * operations page, having matched nothing about the business at all.
   *
   * So relevance is judged against the business's own subject alone. Same
   * reasoning as the STOPWORDS list, one level up: words the generator supplied
   * cannot be used to prove the generator picked correctly.
   */
  subjectCore: string;
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
  /** Free-text industry/vertical if known. */
  industry?: string | null;
  /** Model-supplied subject, when there is one. Still the strongest signal. */
  explicitSubject?: string | null;
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
 * WHAT THE BUSINESS ACTUALLY DOES, IN DESCRIPTIVE TERMS — or nothing.
 *
 * PERSUASION LANGUAGE ESTABLISHES THE VISUAL JOB. DESCRIPTIVE BUSINESS TRUTH
 * ESTABLISHES THE PHOTOGRAPHIC DOMAIN. That split is the whole rule here, and
 * every entry removed from this ladder was removed for violating it.
 *
 * `objective` went first: read as a description of the business, the schema
 * token "application" produced the brief "application close up detail" and
 * matched a stock photograph of someone applying green FACE PAINT, which
 * shipped on a consultant page.
 *
 * `offer` — the hero HEADLINE — went next, for exactly the same reason one
 * round later. An operations page headlined "Find Out Where Delivery Breaks
 * Before You Double Volume" searched on "Find Out Where Delivery Breaks" and
 * took a photograph of two takeaway coffee cups, captioned "perfect for takeout
 * or delivery". Nothing downstream could catch it: the photograph genuinely IS
 * about delivery, in the other sense of the word. To this business delivery
 * means order fulfilment; to a stock library it means parcels and coffee.
 *
 * `mechanism` went with it. It is a sentence about a PROCESS ("a first visit
 * that is assessment only, with no treatment on the day") and the dental page
 * searching on it got back nothing recognisably dental, because the sentence
 * never says so.
 *
 * The survivors all NAME THE WORK rather than argue for it. This is not a
 * blacklist of ambiguous words — pipeline, traffic, conversion, engagement,
 * lead and close are all equally dangerous and there is no end to that list.
 * It is a rule about which FIELDS may speak: a headline is written to persuade,
 * so whatever domain its words happen to belong to is an accident.
 *
 * Returning null is a first-class outcome. A business that never described its
 * work gets no photograph, and text-led beats wrong-domain every time.
 */
function coreSubject(ctx: MediaPlanningContext): string | null {
  const ladder = [
    ctx.explicitSubject, // the operator's own media_subject
    ctx.whatTheyDo, //     a description of the work
    ctx.industry, //       the verified vertical
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
/**
 * THE PHOTOGRAPHIC BRIEF FOR ONE VISUAL BEAT.
 *
 * The visual story states a beat's need as a PROPOSITION — "a new person
 * inherits the same unclear handoffs" — which is the right thing to judge a
 * candidate against and a hopeless thing to search on: a stock provider has no
 * index for an argument. So the query and the test are separated exactly as
 * `subject`/`subjectCore` already separates them one level up.
 *
 * The QUERY is the business's own work, angled by what the beat is for. The
 * TEST stays the beat's concept, applied by the resolver — so a photograph that
 * the provider returned for "roof inspection" still has to be about THIS BEAT
 * to be placed, and generic business imagery still cannot be.
 *
 * Returns null where a photograph could not honestly answer the beat at all:
 * proof is evidence and a stock photograph of evidence is a fabrication, and a
 * call to action is not a thing that can be photographed.
 */
export function photoBriefForVisualJob(
  job: string,
  ctx: MediaPlanningContext,
): { subject: string; purpose: MediaPurpose } | null {
  const core = coreSubject(ctx);
  if (!core) return null;
  if (!AMBIENT_HONEST.includes(ctx.authenticityCategory)) return null;
  switch (job) {
    // The world the reader is in, and the state they are in it. Plain: an angle
    // added here would be the generator's vocabulary, not the business's.
    case "recognise_problem":
    case "show_cost_of_current_state":
      return { subject: core, purpose: "establish_context" };
    // The work being performed — the single most useful photograph any service
    // business has, because it is evidence the service exists and is done by
    // people.
    case "explain_mechanism":
    case "show_what_happens_next":
      return { subject: `${core} being carried out by a specialist`, purpose: "show_the_work" };
    case "make_future_tangible":
    case "show_deliverable":
      return { subject: `${core} completed`, purpose: "show_the_deliverable" };
    // Reassurance is a person, where a person is the reassurance.
    case "answer_objection":
    case "reduce_uncertainty":
      return { subject: `${core} with a client present`, purpose: "humanise" };
    // establish_proof and direct_to_action deliberately absent — see above.
    default:
      return null;
  }
}

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
      subjectCore: core,
      aspect: "landscape",
      // ILLUSTRATIVE, NEVER ATTRIBUTED. This read "<Business> carrying out
      // <work>", which tells a screen reader that the people in a stock
      // photograph are that company's staff — an identity claim the business
      // never made, in the one place nobody proof-reads. A contextual image
      // may show the KIND of work; it may not say whose hands these are.
      altPrefix: `${core}`,
    });
  }

  // Each benefit row gets a DIFFERENT angle on the same work, so the page does
  // not repeat one photograph four times. Deliberately few: three angles is the
  // honest limit before the variations become arbitrary.
  const angles: { suffix: string; purpose: MediaPurpose; alt: string }[] = [
    // Alt text describes what the picture SHOWS, not who is in it — see the
    // hero's altPrefix. "…with a customer" named a customer nobody has.
    { suffix: "close up detail", purpose: "show_the_work", alt: `Detail of ${core}` },
    { suffix: "specialist inspecting and documenting", purpose: "show_the_deliverable", alt: `Documenting findings during ${core}` },
    { suffix: "with a homeowner or client present", purpose: "humanise", alt: `${core}, discussed in person` },
  ];
  for (let i = 0; i < Math.min(slots.benefitCount, angles.length); i++) {
    const a = angles[i];
    intents.push({
      sectionType: "benefits_grid",
      slot: "benefit_item",
      purpose: a.purpose,
      subject: `${core} ${a.suffix}`,
      subjectCore: core,
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
/**
 * WORDS EVERY BUSINESS SHARES, WHICH THEREFORE IDENTIFY NONE OF THEM.
 *
 * A Summit page shipped a photograph of a hi-vis courier kneeling in a doorway
 * holding a parcel, on a roofing fold. It was not a bug in the counting: the
 * candidate genuinely matched two terms of "residential roof inspection" —
 * "residential" and a worker cue — and two matches is the bar. Generic trade
 * vocabulary simply outvoted the only word that meant roofing.
 *
 * This is NOT an industry blacklist; there is no "delivery" or "roofing" here,
 * and there never can be, because the next miss will be a word nobody listed.
 * It is the same closed, structural idea as STOPWORDS one level up: these words
 * describe the SETTING that every service business shares, so none of them can
 * establish WHICH business a photograph is of.
 */
const GENERIC_CONTEXT = new Set([
  "worker", "workers", "professional", "professionals", "specialist", "specialists",
  "staff", "team", "crew", "employee", "employees", "person", "people", "man", "woman",
  "customer", "customers", "client", "clients", "homeowner", "homeowners", "patient",
  "residential", "commercial", "domestic", "industrial", "local",
  "home", "house", "building", "property", "office", "business", "company",
  "service", "services", "work", "working", "job", "visit", "appointment",
  "quality", "expert", "experts", "trusted", "modern", "indoor", "outdoor",
]);

/**
 * THE DOMAIN ANCHOR, BUILT FROM IDENTITY RATHER THAN FROM PROSE.
 *
 * Three times now a photograph qualified on a word that was TRUE of the
 * business and did not identify it:
 *
 *   "delivery"    -> takeaway coffee cups, on an operations consultancy
 *   "residential" -> a hi-vis courier at a front door, on a roofing page
 *   "Houston" + "photograph" -> a street photographer, on a roofing page
 *
 * Each time the fix was to extract better words from the same descriptive
 * prose, and each time the prose contained something else that happened to
 * match. The prose was never the problem. We were asking one blob of text to
 * answer two different questions: "why should this visitor buy?" and "what
 * kind of business is this?". Only the second can anchor a photograph.
 *
 * So the anchor now comes from `service_domain` — a dedicated field whose whole
 * job is to name the trade, as you would brief a photographer. Four categories
 * of language, one of which qualifies:
 *
 *   DOMAIN IDENTITY   roof inspection, dentistry, operations consulting  <- this
 *   SERVICE ACTIVITY  photographing, inspecting, mapping, reviewing
 *   CONTEXT           Houston, homeowners, residential, after a storm
 *   GENERIC           professional, service, business, customer
 *
 * The other three may still contribute to relevance SCORING once identity has
 * matched; none may establish it.
 */

/** Tokens in a domain phrase that do not name the trade. Proper nouns are
 *  places; generic context is shared by every business. Both are stripped so a
 *  model that writes "roof inspection in Houston" still anchors on roofing. */
function domainAnchors(serviceDomain: string): string[] {
  return serviceDomain
    .split(/[\s,/&-]+/)
    .filter(Boolean)
    .filter((raw) => {
      // A capitalised token mid-phrase is a place or a brand, not a trade.
      if (/^[A-Z][a-z]{2,}$/.test(raw)) return false;
      const w = raw.toLowerCase().replace(/[^a-z]/g, "");
      return w.length > 2 && !STOPWORDS.has(w) && !GENERIC_CONTEXT.has(w);
    })
    .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""));
}

/**
 * Does this candidate depict the BUSINESS, not merely something true about it?
 *
 * Matches against the declared service domain only. Returns false when no
 * domain was declared — safe failure: a business that never named its trade
 * gets no stock photography, which is the correct outcome rather than a guess.
 */
export function matchesServiceDomain(serviceDomain: string | null | undefined, candidateDescription: string): boolean {
  if (!serviceDomain?.trim()) return false;
  const anchors = domainAnchors(serviceDomain);
  if (anchors.length === 0) return false;
  const got = meaningfulWords(candidateDescription);
  return anchors.some((a) => got.some((g) => sameSubject(a, g)));
}

export function mediaIsRelevant(intent: Pick<MediaIntent, "subject">, candidateDescription: string): boolean {
  const wanted = new Set(meaningfulWords(intent.subject)).size;
  const hits = countMediaMatches(intent, candidateDescription);
  // TERM COUNT ONLY. Identity is a separate question with a separate answer —
  // see `matchesServiceDomain`, enforced by the resolver. Folding it in here
  // conflated "is this about the brief?" with "is this the right business?".
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
