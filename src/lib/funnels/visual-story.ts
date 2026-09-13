import type { FunnelSection } from "@/types/funnels";

/**
 * THE VISUAL STORY — one plan for the whole page, derived from the argument.
 *
 * What this replaces: media planning that asked the BUSINESS what it does and
 * then filled whatever slots happened to exist. Every beat inherited the same
 * page-level subject, so a page got four angles on one query — variation that
 * is cosmetic by construction — and placement was "a slot exists, find
 * something that fits", which is the decision order inverted.
 *
 * The page already knows its own argument. `stampArgumentRoles` puts a role on
 * every section (hook, belief_shift, promise, mechanism, proof, offer,
 * risk_reversal, objections, close/action) and `servesBelief` records which
 * step of the belief chain each section is responsible for. That IS the sales
 * story, in data, today. Nothing was reading it when choosing pictures.
 *
 * So the order is:
 *
 *   argumentRole -> visualJob -> concept -> source -> composition -> continuity
 *
 * CONCEPT IS MEDIUM-INDEPENDENT, and that is the load-bearing idea. It is not
 * a stock-photo query; it is the proposition the visual has to communicate:
 * "the owner is the central bottleneck every decision must pass through". A
 * photograph may or may not be able to say that. A diagram can. A document
 * preview can say a different kind of thing. Stating the concept once, in the
 * argument's own terms, is what lets a source hierarchy exist at all — a photo
 * brief would make every non-photographic rung unreachable.
 *
 * WHAT THIS MODULE WILL NOT DO. It never invents a claim: every concept is
 * built from the plan's own verified sentences (the belief being shifted, the
 * mechanism, the promise, the stated objection). When the argument has nothing
 * to say at a beat, the beat gets no visual rather than a decorative one.
 *
 * Pure and synchronous — no network, no Firestore, no model call — so the
 * whole story can be tested against an adversarial argument.
 */

/**
 * What a visual is FOR. Closed vocabulary, deliberately: an open one would let
 * "looks nice here" back in, and the test a visual has to pass is "name the
 * argument this supports", which is only answerable against a fixed list.
 */
export type VisualJob =
  | "recognise_problem"
  | "show_cost_of_current_state"
  | "make_future_tangible"
  | "explain_mechanism"
  | "show_what_happens_next"
  | "show_deliverable"
  | "reduce_uncertainty"
  | "establish_proof"
  | "answer_objection"
  | "direct_to_action";

export interface VisualBeat {
  sectionId: string;
  /** The role this section already carries. Never re-derived here. */
  argumentRole: string;
  visualJob: VisualJob;
  /**
   * THE PROPOSITION, not a query. Passed to every source rung, each of which
   * attempts it in its own medium.
   */
  concept: string;
  /** The job of the visual immediately before this one, so a planner and a
   *  reviewer can both ask "does this move the story on?". Null on the first. */
  continuesFrom: VisualJob | null;
}

/** The argument the page is making, as the plan already states it. */
export interface ArgumentContext {
  arrivalContext?: string | null;
  currentBelief?: string | null;
  oldWay?: string | null;
  whyOldWayFails?: string | null;
  mechanism?: string | null;
  corePromise?: string | null;
  primaryObjection?: string | null;
  closeReason?: string | null;
}

/**
 * Which job each argument role is asking a visual to do.
 *
 * One role, one job — a section that is making two arguments at once is a
 * composition problem upstream, not something to paper over by giving it two
 * pictures. Roles absent from this map (`close`, `action`) are deliberately
 * unvisualised: the close asks, and a picture beside an ask competes with it.
 */
const ROLE_TO_JOB: Record<string, VisualJob> = {
  hook: "recognise_problem",
  belief_shift: "show_cost_of_current_state",
  promise: "make_future_tangible",
  mechanism: "explain_mechanism",
  offer: "show_deliverable",
  proof: "establish_proof",
  objections: "answer_objection",
  risk_reversal: "reduce_uncertainty",
};

/** Trim a verified sentence to a proposition without rewriting it. */
function proposition(text: string | null | undefined): string | null {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  if (t.length < 12) return null;
  return t.length <= 180 ? t : `${t.slice(0, 177).replace(/[,;:\s]+\S*$/, "")}…`;
}

/**
 * The concept for a beat, in the argument's own words.
 *
 * The ladder per job is ordered by how directly the sentence states the thing
 * the visual has to communicate. `servesBelief` wins wherever it is set,
 * because that is the page's own record of what this specific section is
 * responsible for establishing — it is more precise than any page-level field.
 */
function conceptFor(job: VisualJob, ctx: ArgumentContext, servesBelief?: string | null): string | null {
  const belief = proposition(servesBelief);
  switch (job) {
    case "recognise_problem":
      return belief ?? proposition(ctx.arrivalContext) ?? proposition(ctx.currentBelief);
    case "show_cost_of_current_state":
      return proposition(ctx.whyOldWayFails) ?? proposition(ctx.oldWay) ?? belief;
    case "make_future_tangible":
      return belief ?? proposition(ctx.corePromise);
    case "explain_mechanism":
      return proposition(ctx.mechanism) ?? belief;
    case "show_deliverable":
      return belief ?? proposition(ctx.corePromise);
    // `servesBelief` first for both of these, because a page may legitimately
    // answer several DIFFERENT objections, or reduce uncertainty at more than
    // one point in the journey. The page-level field is the fallback for the
    // first such beat, not the answer for all of them.
    case "answer_objection":
      return belief ?? proposition(ctx.primaryObjection);
    case "reduce_uncertainty":
      return belief ?? proposition(ctx.closeReason);
    // Proof speaks for itself: the concept is the evidence, which the proof
    // router supplies. Nothing here should invent a proposition for it.
    case "establish_proof":
      return belief;
    default:
      return null;
  }
}

/** Words that carry the meaning of a proposition, for comparing two of them. */
function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

/**
 * Do two concepts say the same thing?
 *
 * Half the shorter proposition's content words appearing in the other is the
 * test. A page that states the problem twice is entitled to; a page that
 * DRAWS it twice has stopped telling a story and started decorating, which is
 * the repetition this pass exists to prevent.
 */
export function conceptsOverlap(a: string, b: string): boolean {
  const x = contentWords(a);
  const y = contentWords(b);
  if (x.size === 0 || y.size === 0) return false;
  const [small, large] = x.size <= y.size ? [x, y] : [y, x];
  let shared = 0;
  for (const w of small) if (large.has(w)) shared++;
  return shared / small.size >= 0.5;
}

/**
 * Plan the page's visual story.
 *
 * Returns one beat per section that has BOTH a nameable job and something true
 * to say at it. Sections are visited in page order, so `continuesFrom` is the
 * real reading sequence rather than a sort of convenience.
 *
 * THE INVARIANT IS THE CONCEPT, NOT THE JOB.
 *
 * An earlier version also refused a repeated `visualJob`, which is wrong: a
 * page with three distinct objections is entitled to answer each of them, and
 * uncertainty can honestly need reducing at more than one point in a journey.
 * What a page may never do is DRAW THE SAME PROPOSITION TWICE — that is the
 * move that stops being a story and starts being decoration. So a job may
 * recur; a concept may not, and a recurring job therefore has to arrive
 * carrying something genuinely different to say.
 *
 * Note what is NOT decided here: whether an image exists. A beat is a NEED.
 * Resolution against the source hierarchy happens afterwards and may end in a
 * text-led fallback — which is the last rung, never the automatic answer to a
 * failed photo search.
 */
export function planVisualStory(sections: FunnelSection[], ctx: ArgumentContext): VisualBeat[] {
  const beats: VisualBeat[] = [];

  for (const section of sections) {
    const role = (section as { argumentRole?: string }).argumentRole;
    if (!role) continue;
    const job = ROLE_TO_JOB[role];
    if (!job) continue;

    const servesBelief = (section as { servesBelief?: string }).servesBelief;
    const concept = conceptFor(job, ctx, servesBelief);
    // NOTHING TRUE TO SAY, NOTHING TO SHOW. A beat with no proposition behind
    // it is exactly the decorative visual this planner exists to refuse.
    if (!concept) continue;
    if (beats.some((b) => conceptsOverlap(b.concept, concept))) continue;

    beats.push({
      sectionId: section.id,
      argumentRole: role,
      visualJob: job,
      concept,
      continuesFrom: beats.length > 0 ? beats[beats.length - 1].visualJob : null,
    });
  }

  return beats;
}

/**
 * A page-level report of the visual story, for the harness and for review.
 *
 * Factual: it states which argument each visual serves and in what order. It
 * asserts nothing about taste, which is the reviewer's job and cannot be
 * delegated to a count of images.
 */
export function describeVisualStory(beats: VisualBeat[]): {
  jobs: VisualJob[];
  /** A job recurring is FINE — see planVisualStory. Reported so a reviewer can
   *  see the shape of the story, never treated as a defect. */
  recurringJobs: VisualJob[];
  /** The real defect: the same proposition drawn more than once. */
  repeatsConcept: boolean;
  /** The sharper case of it — a visual that merely restates the one before. */
  restatesPrevious: boolean;
} {
  const jobs = beats.map((b) => b.visualJob);
  const seen = new Set<VisualJob>();
  const recurringJobs: VisualJob[] = [];
  for (const j of jobs) {
    if (seen.has(j) && !recurringJobs.includes(j)) recurringJobs.push(j);
    seen.add(j);
  }
  let repeatsConcept = false;
  let restatesPrevious = false;
  for (let i = 0; i < beats.length; i++) {
    for (let j = i + 1; j < beats.length; j++) {
      if (conceptsOverlap(beats[i].concept, beats[j].concept)) {
        repeatsConcept = true;
        if (j === i + 1) restatesPrevious = true;
      }
    }
  }
  return { jobs, recurringJobs, repeatsConcept, restatesPrevious };
}
