import type { AuthenticityCategory } from "@/lib/funnels/authenticity";
import { mediaIsRelevant, selectRelevantMedia } from "@/lib/funnels/media-intent";
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
  /** Why this rung answered — recorded so a page's visual decisions are
   *  auditable from data rather than re-derived by reading the render. */
  reason: string;
}

export interface PhotoCandidate {
  url: string;
  alt: string;
}

export interface SourceInventory {
  /** Customer-owned, APPROVED assets. Never anything merely uploaded. */
  firstParty?: { url: string; alt?: string; approved: boolean }[];
  /** Candidates from the stock provider for this beat, already searched. */
  photos?: PhotoCandidate[];
  /** May ambient photography be honest evidence for this business at all? */
  category: AuthenticityCategory;
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
const JOB_TO_SHAPE: Partial<Record<VisualJob, ConstructedShape>> = {
  recognise_problem: "fragmented_to_connected",
  show_cost_of_current_state: "hub_bottleneck",
  make_future_tangible: "distributed_network",
  explain_mechanism: "sequence",
  show_what_happens_next: "sequence",
  answer_objection: "state_contrast",
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
  if (says("bottleneck", "routes back through", "through the owner", "depends on one", "everything goes through")) {
    return "hub_bottleneck";
  }
  if (says("distribute", "delegat", "ownership", "responsibilit", "across the team", "no longer depends")) {
    return "distributed_network";
  }
  if (says("instead of", "rather than", "not a", "without the", "versus")) return "state_contrast";
  if (says("step", "first", "then", "end to end", "path", "stage")) return "sequence";
  if (says("scatter", "fragment", "disconnect", "falls between", "gaps between", "slips")) {
    return "fragmented_to_connected";
  }
  return JOB_TO_SHAPE[job];
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
  // 1. VERIFIED CUSTOMER-OWNED MEDIA. Approval is the whole test: an asset
  //    does not earn placement by having been uploaded.
  const owned = (inv.firstParty ?? []).find((a) => a.approved && a.url);
  if (owned) {
    return { beat, source: "first_party", url: owned.url, alt: owned.alt ?? beat.concept, reason: "approved customer asset" };
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
  if (AMBIENT_HONEST.includes(inv.category) && (inv.photos ?? []).length > 0) {
    const chosen = selectRelevantMedia({ subject: beat.concept, purpose: "show_the_work" }, inv.photos!);
    if (chosen && mediaIsRelevant({ subject: beat.concept }, chosen.pick.alt)) {
      return { beat, source: "contextual_photo", url: chosen.pick.url, alt: chosen.pick.alt, reason: `photograph is about this beat (${chosen.matches} terms)` };
    }
  }

  // 3. CONSTRUCTED VISUAL. Where the proposition is CONCEPTUAL — a
  //    relationship, a sequence, a before and after — photography is a poor
  //    medium even when one is available, and a drawing is the honest one.
  const shape = shapeForConcept(beat.visualJob, beat.concept);
  if (shape && !(inv.nearbyDevices ?? []).includes(shape) && !alreadyCommunicated(beat.concept, inv.nearbyContent)) {
    return { beat, source: "constructed", shape, reason: `concept is structural; drawn as ${shape}` };
  }
  if (shape) {
    // DECLINED, and the story continues elsewhere. Redrawing what the page
    // already says is how this becomes decoration.
    return {
      beat,
      source: "text_led",
      reason: (inv.nearbyDevices ?? []).includes(shape)
        ? `the page already renders a ${shape} here`
        : "the surrounding copy already communicates this",
    };
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

/** Resolve the whole story, preserving order. */
export function resolveVisualStory(
  beats: VisualBeat[],
  inventoryFor: (beat: VisualBeat) => SourceInventory,
): ResolvedVisual[] {
  return beats.map((b) => resolveVisualSource(b, inventoryFor(b)));
}

/** Did any photograph actually clear the relevance bar for this concept? Kept
 *  exported so the harness can assert the gate was not quietly loosened to let
 *  a page obtain a picture. */
export function photoWouldQualify(concept: string, candidateAlt: string): boolean {
  return mediaIsRelevant({ subject: concept }, candidateAlt);
}
