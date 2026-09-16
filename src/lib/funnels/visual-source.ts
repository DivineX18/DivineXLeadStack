import type { AuthenticityCategory } from "@/lib/funnels/authenticity";
import { matchesServiceDomain, mediaIsRelevant, selectRelevantMedia, type MediaPurpose } from "@/lib/funnels/media-intent";
import { compositionAcceptsPhoto, compositionAcceptsShape, type VisualComposition } from "@/lib/funnels/visual-placement";
import type { VisualBeat, VisualJob } from "@/lib/funnels/visual-story";

/**
 * HOW A VISUAL NEED GETS ANSWERED.
 *
 * A `VisualBeat` states a proposition the page needs to communicate. This
 * decides which MEDIUM can truthfully communicate it, by walking an ordered
 * hierarchy rather than asking one question and giving up:
 *
 *   1. verified customer-owned media
 *   2. semantically relevant contextual photography
 *   3. constructed/generated visual
 *   4. product/document representation
 *   5. composed proof/content visual
 *   6. intentional text-led
 *
 * THE CORRECTION THIS ENCODES. The previous rule was "no relevant photograph,
 * therefore text". That collapsed six answers into two and made a failed image
 * search into a verdict about the page. Northstar is the case: an operations
 * consultancy has a real visual need at its problem beat — the owner as the
 * bottleneck every decision passes through — and NO honest photograph of it
 * exists, because generic business stock is not about that business. Rung 2
 * correctly declines. Rung 3 is where that proposition can actually be drawn.
 * Text-led is rung SIX: the honest answer when a concept cannot be rendered
 * truthfully in any medium, not the answer to a photo search coming back empty.
 *
 * Each rung keeps its own truthfulness test, unchanged and unweakened:
 * approval for first-party, the existing relevance gate for photography, an
 * evidence boundary for constructed visuals (they may express an idea, never
 * assert a fact nobody stated).
 *
 * THIS IS NOW THE ONLY WAY MEDIA REACHES A PLANNED PAGE. There used to be a
 * second, independent pass that asked the BUSINESS what it does, searched once,
 * and dealt the results into whatever slots existed — which is how an
 * operations page took a stock photograph of a businessman on a video call for
 * its fold. Two authorities that could disagree have become one: every medium,
 * photography included, enters through argumentRole -> visualJob -> concept ->
 * source -> composition -> placement. Explicit customer and editor choices are
 * upstream of all of it and are never overridden.
 *
 * FOUR THINGS A VISUAL MUST SURVIVE, all enforced below:
 *   - it serves a named persuasion job (the planner; no job, no beat)
 *   - it is not redundant against what the page already renders
 *   - it does not repeat a shape the page has already drawn
 *   - it has somewhere to PARTICIPATE, not merely somewhere to sit
 */

export type VisualSourceKind =
  | "first_party"
  | "contextual_photo"
  | "constructed"
  | "document"
  | "composed_proof"
  | "text_led";

/** The shapes a constructed visual may take. Closed, and deliberately small:
 *  these are conceptual communication devices, not an illustration platform. */
export type ConstructedShape =
  | "hub_bottleneck"
  | "distributed_network"
  | "fragmented_to_connected"
  | "state_contrast"
  | "sequence";

export interface ResolvedVisual {
  beat: VisualBeat;
  source: VisualSourceKind;
  /** Set for photographic rungs. */
  url?: string;
  alt?: string;
  /** Set for rung 3. */
  shape?: ConstructedShape;
  /**
   * HOW THE HOST SECTION WILL COMPOSE THIS, when anything is placed.
   *
   * Carried on the resolution rather than decided afterwards, because a beat
   * that has nowhere to participate is a beat that resolves text-led — the
   * medium and the composition are one decision, and splitting them is what
   * produced a diagram appended in a band under its own section.
   */
  composition?: VisualComposition;
  /** Why this rung answered — recorded so a page's visual decisions are
   *  auditable from data rather than re-derived by reading the render. */
  reason: string;
}

export interface PhotoCandidate {
  url: string;
  alt: string;
  /** Provider photo id, when the provider exposes one. */
  providerId?: number;
  /** Provider photographer id, when the provider exposes one. */
  photographerId?: number;
}

/**
 * TWO FRAMES OF ONE SCENE ARE ONE PHOTOGRAPH.
 *
 * A certified booking page placed Pexels 3884103 in its hero and 3884101 in
 * the very next section: the same hygienist, the same patient, the same chair,
 * a slightly wider crop. Different URLs, different ids, so the page-level URL
 * check passed, and the reader saw one picture twice.
 *
 * No vision model is needed to see why: the provider says so. Both photos have
 * photographer_id 224453, and their ids are 2 apart, because a photographer
 * uploads a session as a batch and the provider numbers it consecutively.
 * Sampled search results bear that out: frames of one session sat within a few
 * hundred ids of each other (spans of 115 to 270), while the SAME prolific
 * photographer's separate sessions sat tens of thousands apart (3946837, used
 * alongside a different photographer on another certified page, is 62,000 ids
 * from this pair).
 *
 * So a candidate is refused when it comes from a photographer already on the
 * page AND sits inside the upload window of that photograph. A different
 * photographer's shot of the same kind of scene is untouched, and so is the
 * same photographer's work from another session. The window is deliberately
 * generous: refusing a real alternative only means the next qualified
 * candidate is used, while missing a repeat ships the defect.
 */
export const SAME_SHOOT_ID_WINDOW = 3000;

export function sharesStockShoot(a: PhotoCandidate, b: PhotoCandidate): boolean {
  if (a.url === b.url) return true;
  if (typeof a.photographerId !== "number" || typeof b.photographerId !== "number") return false;
  if (a.photographerId !== b.photographerId) return false;
  if (typeof a.providerId !== "number" || typeof b.providerId !== "number") return false;
  return Math.abs(a.providerId - b.providerId) <= SAME_SHOOT_ID_WINDOW;
}

export interface SourceInventory {
  /** Customer-owned, APPROVED assets. Never anything merely uploaded. */
  firstParty?: { url: string; alt?: string; approved: boolean }[];
  /** Candidates from the stock provider for this beat, already searched. */
  photos?: PhotoCandidate[];
  /** Stock photographs already placed on this page, in any section. A
   *  candidate from the same shoot as one of these is not a second visual. */
  placedStockPhotos?: PhotoCandidate[];
  /** Why this beat wants a picture — weights the selector toward a photograph
   *  of the work being DONE over a photograph of the category's scenery. */
  photoPurpose?: MediaPurpose;
  /**
   * THE VERIFIED BUSINESS SUBJECT — what this business actually does.
   *
   * Used only by the context-establishing branch of rung 2 (see
   * `resolveVisualSource`). The BEAT still decides whether media is wanted at
   * all; this supplies the only truthful thing a photograph could be OF when
   * the beat's own proposition is an abstraction. Drawn from the operator's
   * stated subject / service / offer, never from the generator's vocabulary.
   */
  contextSubject?: string;
  /**
   * THE DECLARED SERVICE DOMAIN — the only thing that may anchor a photograph.
   *
   * "residential roof inspection", "general dentistry". Not the headline, not
   * the city, not an activity performed along the way. Every photographic rung
   * requires a candidate to match THIS, because relevance to the brief has
   * three times proved satisfiable by a word that was true of the business and
   * did not identify it. Absent means no stock photography at all.
   */
  serviceDomain?: string;
  /**
   * Has a context-establishing photograph already been placed on this page?
   *
   * One per page, hard. Context photography grounds an argument the reader
   * cannot picture; a second one is no longer grounding anything, it is filling
   * space, which is the density-chasing this whole pass removed.
   */
  contextPhotoUsedOnPage?: boolean;
  /** May ambient photography be honest evidence for this business at all? */
  category: AuthenticityCategory;
  /**
   * THE COMPOSITION THE HOST SECTION CAN GIVE THIS VISUAL, or null.
   *
   * Null is a real answer and the common one: most sections are already a
   * composed device, and a visual set beside one competes with it. A beat whose
   * host cannot compose resolves text-led, which is the planner deciding a
   * section stays text-led on structural grounds rather than on taste.
   */
  hostComposition?: VisualComposition | null;
  /** The host's section type, so placement can ask whether THIS composition can
   *  integrate a given shape (a sequence beside a list that already enumerates
   *  cannot). Type only — the resolver stays pure and never reads a section. */
  hostType?: string;
  /**
   * SHAPES THIS PAGE HAS ALREADY DRAWN.
   *
   * The page-level invariant that no constructed shape repeats — see
   * `resolveVisualSource`. Passed in because it is a property of the page, not
   * of any one beat, and a beat resolved in isolation cannot see it.
   */
  shapesUsedOnPage?: ConstructedShape[];
  /** True when the page has verified items it could present as a document. */
  hasDeliverableItems?: boolean;
  /**
   * WHAT THE PAGE ALREADY COMMUNICATES, near this beat.
   *
   * A visual is not valuable merely because it matches the argument — it has
   * to communicate something the surrounding page is not already communicating
   * BETTER. The first render of this system put a drawn 1-2-3 sequence
   * immediately above a process section that said the same thing with real
   * step labels, because the redundancy rule only ever compared beats to each
   * other and never to rendered content. That is how a sales-story planner
   * turns into a diagram generator.
   */
  nearbyContent?: string;
  /**
   * Structural devices already rendered near this beat — "sequence" when a
   * process/agenda section exists, "comparison", "showcase", "proof". A drawn
   * shape that duplicates one of these is declined even when the concept is
   * sound, and the story continues at the next beat instead.
   */
  nearbyDevices?: ConstructedShape[];
}

/** Categories where a photograph of "the work" is honest context rather than
 *  invented evidence. Mirrors media-intent's rule — imported behaviour, not a
 *  second opinion about authenticity. */
const AMBIENT_HONEST: AuthenticityCategory[] = ["local_service_health", "local_service_trade", "b2b_services"];

/**
 * THE STOCK PHOTOGRAPHS THAT MEAN NOTHING.
 *
 * A category permitting photography is not permission for ANY photograph. This
 * is the exact set that made the first render fail: a businessman on a video
 * call took an operations fold because the business was "b2b_services" and the
 * picture was technically of business. None of these depicts a service, a
 * deliverable, an environment or a customer situation — they are the visual
 * equivalent of "solutions", and they are what a context-establishing rung
 * would otherwise wave through on every consultancy page ever generated.
 *
 * Rejected on sight, before relevance is even considered, because relevance is
 * precisely what they fake: a handshake matches "business", "meeting" and
 * "professional" for any business on earth.
 */
const GENERIC_STOCK_MARKERS = [
  "handshake", "shaking hands", "shake hands",
  "businessman", "businesswoman", "business people", "businesspeople",
  "business person", "corporate team", "colleagues",
  "team meeting", "office meeting", "business meeting", "conference room",
  "boardroom", "brainstorm", "coworking", "co-working",
  "laptop", "typing", "desk with", "office desk", "workspace",
  "video call", "conference call", "headset",
  "smiling team", "happy team", "group of people", "thumbs up",
  "lifestyle", "silhouette", "skyscraper", "city skyline",
  "sticky notes on", "whiteboard",
];

/** Would this candidate be filler on any page, for any business? */
function isGenericBusinessStock(alt: string): boolean {
  const a = alt.toLowerCase();
  return GENERIC_STOCK_MARKERS.some((m) => a.includes(m));
}

/**
 * ANOTHER BUSINESS'S NAME ON THE CUSTOMER'S PAGE.
 *
 * A certified Booking page carried two photographs of a dental reception with a
 * different practice's logo and wordmark clearly legible on the wall behind the
 * desk. Nothing was fabricated and the images were honestly on-domain, but a
 * visitor reads a branded reception as THIS practice's reception — so the page
 * implies the customer is a business they have never heard of.
 *
 * WHAT WE CAN AND CANNOT DETECT, HONESTLY. We cannot see pixels. There is no
 * OCR and no vision model in this pipeline, and provider alt text almost never
 * names the brand that happens to be on the wall — the DeKo alts described a
 * dentist and a patient, not a logo. So this does NOT detect branding.
 *
 * What it does instead is decline the SHOT TYPES where third-party branding
 * reliably appears and where the implication is worst: a reception desk, a
 * storefront, a shopfront sign, a branded vehicle, a uniform with a logo. These
 * are premises shots, and a premises shot is a claim about whose premises they
 * are. The work being performed — a dentist with a patient, a roofer on a roof
 * — carries no such implication and is unaffected.
 *
 * A proxy, and deliberately named as one. It will miss a logo on the wall of an
 * otherwise ordinary treatment-room photo. Closing that gap needs image
 * analysis, which is a real capability decision rather than something to fake
 * from a caption.
 */
const BRANDED_PREMISES_MARKERS = [
  "reception", "receptionist", "front desk", "help desk", "check-in counter",
  "storefront", "shopfront", "shop front", "store front", "facade", "entrance sign",
  "signage", "sign board", "signboard", "billboard", "neon sign", "logo",
  "branded", "brand name", "company name", "nameplate", "awning",
  "delivery van", "company van", "branded vehicle", "fleet vehicle", "truck with",
  "name on the wall", "wall sign",
];

/** Does this candidate depict PREMISES that belong to somebody else? */
export function depictsBrandedPremises(alt: string): boolean {
  const a = alt.toLowerCase();
  return BRANDED_PREMISES_MARKERS.some((m) => a.includes(m));
}

/**
 * WHICH CONCEPTS CAN BE DRAWN.
 *
 * Mapped from the visual JOB, not from keywords in the concept text: the job
 * is the page's own structured statement of what this beat must accomplish,
 * and matching on prose would make the diagram a function of phrasing.
 *
 * Jobs absent from this map cannot be constructed. `establish_proof` is the
 * important one: proof is evidence, and a drawing of evidence is a fabricated
 * claim — exactly what the authenticity rules exist to prevent. A page with no
 * real proof gets no proof visual, ever.
 */
const JOB_CAN_BE_DRAWN: Partial<Record<VisualJob, true>> = {
  recognise_problem: true,
  show_cost_of_current_state: true,
  make_future_tangible: true,
  explain_mechanism: true,
  show_what_happens_next: true,
  answer_objection: true,
};

/**
 * THE SHAPE FOLLOWS THE RELATIONSHIP, NOT THE JOB.
 *
 * A mechanism beat is not automatically a sequence. What a concept needs drawn
 * is whatever relationship it asserts: one point everything passes through, a
 * spread of ownership, an ordered set of steps, a contrast between two states.
 * The job is the starting guess; the concept's own language refines it, which
 * is what stops every mechanism on every page arriving as three numbered
 * circles.
 */
function shapeForConcept(job: VisualJob, concept: string): ConstructedShape | undefined {
  const c = concept.toLowerCase();
  const says = (...needles: string[]) => needles.some((n) => c.includes(n));

  // One point everything must pass through.
  if (says("bottleneck", "routes back through", "goes through the", "through the owner", "depends on one", "everything goes through", "waits on one", "one person has to")) {
    return "hub_bottleneck";
  }
  // The same work, spread out. "ownership" and "responsibilit" used to appear
  // here and were far too loose — they match any sentence that merely mentions
  // responsibility, which is most of them.
  if (says("distribute", "delegat", "across the team", "no longer depends", "spread across", "shared across", "hand off", "without you")) {
    return "distributed_network";
  }
  // Scattered pieces becoming one thing.
  if (says("scatter", "fragment", "disconnect", "falls between", "gaps between", "slips through", "in one place", "all in one", "siloed", "sticky notes", "spreadsheets and")) {
    return "fragmented_to_connected";
  }
  // Ordered stages, asserted as ordered. Bare "first"/"then"/"path" used to
  // match here and appear in almost any prose.
  // An arrow chain IS an ordered relationship, written as plainly as it can be
  // — "diagnostic audit -> model design -> sales scripts -> implementation".
  // Models reach for it constantly when describing a pipeline and the matcher
  // was blind to it.
  if (/[^\s]\s*(?:\u2192|->|\u27a1)\s*[^\s]/.test(c)) return "sequence";
  if (says("step by step", "stage by stage", "end to end", "in stages", "phased", "sequence", "one stage at a time", "first, then")) {
    return "sequence";
  }
  // A genuine TWO-STATE contrast, asserted as one. "not a" and "without the"
  // used to be here and matched parentheticals like "(not an impulse signup)",
  // which asserts no contrast at all and produced a two-panel diagram about
  // nothing.
  //
  // CHECKED LAST, DELIBERATELY. These are connectives, not relationships:
  // "instead of" appears inside plenty of sentences whose actual assertion is a
  // bottleneck or a scatter, and testing it early stole those beats. A page
  // that says "scattered across spreadsheets and sticky notes INSTEAD OF in one
  // place" is making a fragmentation argument, and the specific signal has to
  // win over the grammatical one.
  if (says("instead of", "rather than", "versus", " vs ", "used to", "no longer", "where before")) return "state_contrast";

  // NO FALLBACK. THIS IS THE POINT.
  //
  // There used to be one — `JOB_TO_SHAPE[job]` — and it meant every beat with a
  // nameable job was GUARANTEED a diagram whether or not its concept asserted
  // any relationship at all. Probed across twelve real model-written arguments,
  // every single constructed visual the page would have drawn came from that
  // fallback and not one of them was the relationship its concept stated: a
  // network for "at $29 this is accessible enough to try", a hub for an
  // argument that is plainly about fragmentation, a two-state contrast for a
  // parenthetical containing the word "not".
  //
  // That is the same "a slot exists, fill it" move this whole pass removed,
  // relocated into the shape chooser. A drawing asserts a RELATIONSHIP; if the
  // page never asserted one, the honest answer is that there is nothing to
  // draw. The beat goes text-led and the story continues.
  return undefined;
}

/** Content words, for asking whether a drawing would restate rendered copy. */
function words(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 4),
  );
}

/**
 * Would this drawing tell the reader something the page is not already telling
 * them? Half the concept's substantive words already present nearby means it
 * would not.
 */
function alreadyCommunicated(concept: string, nearby: string | undefined): boolean {
  if (!nearby) return false;
  const want = words(concept);
  if (want.size === 0) return false;
  const have = words(nearby);
  let shared = 0;
  for (const w of want) if (have.has(w)) shared++;
  return shared / want.size >= 0.5;
}

/**
 * Resolve one beat down the hierarchy.
 *
 * Ordered strictly. A later rung is reached only because every earlier one
 * declined, and each declension is recorded in `reason` so the page can be
 * reviewed on why it shows what it shows.
 */
export function resolveVisualSource(beat: VisualBeat, inv: SourceInventory): ResolvedVisual {
  // 0. CAN THE HOST COMPOSE ANYTHING AT ALL?
  //
  //    Checked before the hierarchy rather than after it, because a visual with
  //    nowhere to participate is not a visual — it is an attachment, and the
  //    band-under-the-section is exactly what this pass replaced. When the
  //    answer is no the beat is text-led ON PURPOSE and the story continues.
  const composition = inv.hostComposition;
  const placeable = !!composition;
  // The anchor position is earned by depicting a transition, which no
  // photograph does — see compositionAcceptsPhoto.
  const photoOk = placeable && compositionAcceptsPhoto(composition!);

  // 1. VERIFIED CUSTOMER-OWNED MEDIA. Approval is the whole test: an asset
  //    does not earn placement by having been uploaded.
  const owned = (inv.firstParty ?? []).find((a) => a.approved && a.url);
  if (owned && photoOk) {
    return {
      beat,
      source: "first_party",
      url: owned.url,
      alt: owned.alt ?? beat.concept,
      composition,
      reason: "approved customer asset",
    };
  }

  // 2. SEMANTICALLY RELEVANT CONTEXTUAL PHOTOGRAPHY. The existing gate, at
  //    full strength. A photograph that is merely industry-adjacent is
  //    rejected here exactly as it was before.
  //    JUDGED AGAINST THE BEAT, NOT THE BUSINESS. The first render took a
  //    stock businessman on a video call for an operations page, because the
  //    query was a business-level subject someone wrote and the photograph
  //    genuinely matched it. Photography and a drawing must answer the same
  //    persuasion question; only the medium differs. So a candidate has to be
  //    about THIS BEAT'S CONCEPT to be placed, which is what generic business
  //    imagery can never be.
  if (photoOk && AMBIENT_HONEST.includes(inv.category) && (inv.photos ?? []).length > 0) {
    // Generic stock is refused before anything is judged — see
    // GENERIC_STOCK_MARKERS for why relevance cannot be trusted to catch it.
    // Generic filler and somebody else's premises are both refused before
    // relevance is considered — relevance is exactly what they fake.
    // THREE GATES BEFORE RELEVANCE IS EVEN CONSIDERED. Generic filler and
    // somebody else's premises fake relevance; a candidate that does not depict
    // this trade cannot be made relevant by any amount of term overlap.
    const candidates = inv.photos!.filter(
      (p) =>
        !isGenericBusinessStock(p.alt) &&
        !depictsBrandedPremises(p.alt) &&
        matchesServiceDomain(inv.serviceDomain, p.alt) &&
        // Not another frame of a photograph this page already shows. Filtered
        // here, before selection, so the next qualified candidate wins rather
        // than the beat losing its visual.
        !(inv.placedStockPhotos ?? []).some((placed) => sharesStockShoot(p, placed)),
    );

    // 2a. ARGUMENT-DEPICTING. The photograph shows the proposition itself.
    //     Strongest, and unchanged: judged against THIS BEAT'S CONCEPT, which
    //     is what a business-level query could never guarantee.
    const direct = selectRelevantMedia(
      { subject: beat.concept, purpose: inv.photoPurpose ?? "show_the_work" },
      candidates,
    );
    if (direct && mediaIsRelevant({ subject: beat.concept }, direct.pick.alt)) {
      return {
        beat,
        source: "contextual_photo",
        url: direct.pick.url,
        alt: direct.pick.alt,
        composition,
        reason: `photograph depicts this beat (${direct.matches} concept terms)`,
      };
    }

    // 2b. CONTEXT-ESTABLISHING. Reached only because 2a found nothing, which is
    //     the evidence that this beat's proposition is not photographable.
    //
    //     A roofing page argued "when the person inspecting is also the person
    //     selling, you cannot tell whose interest the recommendation serves".
    //     That is a conflict of interest: true, central, and impossible to
    //     photograph. Judged against it, every honest roof photograph scored
    //     one term and was refused, so a trade business whose work is entirely
    //     photographable composed with no image anywhere.
    //
    //     So the BEAT still decides that media is wanted here, and the verified
    //     BUSINESS SUBJECT supplies what a truthful photograph can be OF. The
    //     picture grounds the section the argument lives in; it does not claim
    //     to depict the argument, and it asserts nothing about results,
    //     credentials or customers.
    //
    //     Deliberately narrow: one per page, generic stock already excluded,
    //     and it must clear the SAME relevance bar against the business's own
    //     subject. A page that cannot produce a photograph of its own service
    //     still gets nothing, which is why Northstar stays text-led.
    const contextSubject = (inv.contextSubject ?? "").trim();
    if (!inv.contextPhotoUsedOnPage && contextSubject.length > 3) {
      const grounding = selectRelevantMedia({ subject: contextSubject, purpose: "show_the_work" }, candidates);
      if (grounding && mediaIsRelevant({ subject: contextSubject }, grounding.pick.alt)) {
        return {
          beat,
          source: "contextual_photo",
          url: grounding.pick.url,
          alt: grounding.pick.alt,
          composition,
          reason: `concept is abstract; photograph grounds it in the real service (${grounding.matches} subject terms)`,
        };
      }
    }
  }

  // 3. CONSTRUCTED VISUAL. Where the proposition is CONCEPTUAL — a
  //    relationship, a sequence, a before and after — photography is a poor
  //    medium even when one is available, and a drawing is the honest one.
  // The job gates WHETHER this beat may be drawn at all (proof never can — a
  // drawing of evidence is a fabricated claim); the concept's own language then
  // decides WHICH relationship is drawn, and may decide that none is.
  // Matched against the FULL proposition — see VisualBeat.concept. The
  // relationship a page asserts is frequently in its last clause.
  const shape = JOB_CAN_BE_DRAWN[beat.visualJob] ? shapeForConcept(beat.visualJob, beat.concept) : undefined;
  if (shape) {
    if (!composition) {
      return { beat, source: "text_led", reason: "the host section composes without one" };
    }
    // CAN THIS HOST INTEGRATE THIS SHAPE NATURALLY?
    //
    // Delegated to the placement module, which owns the reasoning: no diagram
    // at the fold (a diagram is studied, a fold is recognised), only a
    // transition may LEAD a section, and no sequence beside a list that already
    // enumerates. Declining here is deliberate — reaching for a shape that
    // would fit is how a drawing stops being about the concept.
    if (!compositionAcceptsShape(inv.hostType ?? "", composition, shape)) {
      return {
        beat,
        source: "text_led",
        reason:
          composition === "fold_media"
            ? "a diagram must be studied; the fold must be recognised"
            : `a ${shape} does not integrate into this section's composition`,
      };
    }
    // SHAPE PROGRESSION. A page may not draw the same shape twice.
    //
    // Two distinct concepts are NOT sufficient justification: a reader does not
    // see two propositions, they see the same picture again, and the second one
    // teaches nothing the first did not. Note what is deliberately not done
    // here — reaching for a different shape to get around the rule. A shape is
    // chosen because it is the relationship the concept asserts, so substituting
    // one communicates the concept less accurately; declining the visual is the
    // honest move and the story continues at the next beat.
    if ((inv.shapesUsedOnPage ?? []).includes(shape)) {
      return { beat, source: "text_led", reason: `this page already draws a ${shape}` };
    }
    if ((inv.nearbyDevices ?? []).includes(shape)) {
      return { beat, source: "text_led", reason: `the page already renders a ${shape} here` };
    }
    if (alreadyCommunicated(beat.concept, inv.nearbyContent)) {
      return { beat, source: "text_led", reason: "the surrounding copy already communicates this" };
    }
    return { beat, source: "constructed", shape, composition, reason: `concept is structural; drawn as ${shape}` };
  }

  // 4. PRODUCT / DOCUMENT REPRESENTATION — what the buyer actually receives,
  //    presented as a labelled example of itself.
  if (beat.visualJob === "show_deliverable" && inv.hasDeliverableItems) {
    return { beat, source: "document", reason: "the deliverable's own contents, shown as an example" };
  }

  // 5. COMPOSED PROOF / CONTENT VISUAL — the page's verified content given a
  //    shape. This is where `establish_proof` lands when real evidence exists.
  if (beat.visualJob === "establish_proof" || beat.visualJob === "reduce_uncertainty") {
    return { beat, source: "composed_proof", reason: "verified page content, composed" };
  }

  // 6. TEXT-LED. Reached only after every medium declined — the honest
  //    outcome for a proposition nothing can truthfully render.
  return { beat, source: "text_led", reason: "no medium can carry this concept truthfully" };
}

/**
 * Resolve the whole story, in page order.
 *
 * Shapes accumulate as the walk proceeds, so the progression invariant is
 * enforced by construction rather than by every caller remembering to pass the
 * right list. A beat resolved in isolation cannot see what the page has already
 * drawn; resolved here, it always can.
 */
export function resolveVisualStory(
  beats: VisualBeat[],
  inventoryFor: (beat: VisualBeat) => SourceInventory,
): ResolvedVisual[] {
  const shapesUsedOnPage: ConstructedShape[] = [];
  const out: ResolvedVisual[] = [];
  for (const beat of beats) {
    const resolved = resolveVisualSource(beat, { ...inventoryFor(beat), shapesUsedOnPage: [...shapesUsedOnPage] });
    if (resolved.source === "constructed" && resolved.shape) shapesUsedOnPage.push(resolved.shape);
    out.push(resolved);
  }
  return out;
}

/** Did any photograph actually clear the relevance bar for this concept? Kept
 *  exported so the harness can assert the gate was not quietly loosened to let
 *  a page obtain a picture. */
export function photoWouldQualify(concept: string, candidateAlt: string): boolean {
  return mediaIsRelevant({ subject: concept }, candidateAlt);
}
