import type { FunnelSection } from "@/types/funnels";
import type { ConstructedShape } from "@/lib/funnels/visual-source";

/**
 * WHERE A RESOLVED VISUAL GOES, AND WHETHER IT CAN GO ANYWHERE AT ALL.
 *
 * The first render of the visual story put its drawing in a band appended
 * underneath the host section: the reader met the claim, the section ended, and
 * then a small grey diagram appeared in the gap before the next one. That is
 * not a beat, it is a footnote — and it is the same "a slot exists, fill it"
 * shape the whole pass was supposed to replace, reintroduced at the last step.
 *
 * So composition is part of executing a beat, not a thing done to it
 * afterwards. A visual PARTICIPATES in the section that owns the argument, in
 * that section's own composition primitive, or it is not placed.
 *
 * WHICH MEANS SOME SECTIONS CANNOT HOST ONE, and that is the point rather than
 * a gap. A benefits grid, an FAQ list, an offer card and a closing banner are
 * each already a composed device; a diagram set beside one competes with it
 * instead of supporting it. A beat whose host has no honest slot resolves
 * TEXT-LED — the planner is allowed to decide a section stays text-led even
 * when a truthful visual exists, and this is where it makes that decision from
 * something structural rather than from taste.
 *
 * The practical effect is that a page gets one or two visuals that carry real
 * weight instead of five that decorate. That is the intended outcome, not a
 * shortfall: the goal is persuasive communication, never media coverage.
 */

/** The composition a host section can give a visual. Deliberately two: these
 *  are the shapes that already exist in the renderer and already read as part
 *  of a section rather than as an attachment to one. */
export type VisualComposition =
  | "fold_media" // the hero's split fold, the media side beside the headline
  | "split" //      text beside visual, inside the section's own shell
  | "anchor"; //    a wide visual LEADING the section, which the content details

/**
 * Can this section compose a visual, and how?
 *
 * Closed by section type on purpose. Adding a type here is a claim that the
 * section reads BETTER with a visual participating in it, which has to be
 * looked at on a render — it is not a default that new sections inherit.
 */
export function compositionForSection(section: FunnelSection): VisualComposition | null {
  switch (section.type) {
    case "hero":
      return "fold_media";
    // A narrative beat: a claim and the picture of the claim, side by side, at
    // the width the section already occupies.
    case "problem_solution":
    case "story":
    case "callout":
      return "split";
    // A BENEFITS GRID CAN HOST ONE, CONDITIONALLY — never by default.
    //
    // The grid is the dominant host of the `promise` beat, so excluding it put
    // "make the future tangible" permanently out of reach. Admitting it
    // unconditionally would be worse: image-beside-cards on every page is the
    // repetitive decoration this whole pass exists to remove. So two structural
    // conditions, and a third (which SHAPES a grid can integrate) in
    // `compositionAcceptsShape` below.
    case "benefits_grid": {
      const cfg = section.config as { variant?: string; items?: unknown[] };
      // The other three variants ARE already a composed visual device — zigzag
      // image rows, a framed example document, a drawn sequence. A second
      // visual beside any of them competes with the one the section already is.
      if (cfg.variant && cfg.variant !== "flowing_checklist") return null;
      const count = Array.isArray(cfg.items) ? cfg.items.length : 0;
      if (count === 0) return null;
      // A short list can give up half its width and still read as a list. A
      // long one cannot: four cards squeezed into one column beside a picture
      // is a worse list than four cards with no picture. A longer list instead
      // takes a visual that LEADS it, where the visual states the change and
      // the cards then detail it.
      return count <= 3 ? "split" : "anchor";
    }
    default:
      return null;
  }
}

/**
 * CAN THIS HOST INTEGRATE THIS PARTICULAR SHAPE NATURALLY?
 *
 * Separate from "can the host compose anything", because the answer genuinely
 * differs by shape. A relationship drawn beside a list adds something the list
 * cannot express; a SEQUENCE drawn beside a list is the list again, in circles.
 *
 * The honest test is whether the drawing says something the composition it sits
 * in cannot. Where it does not, the visual is declined — never swapped for a
 * shape that would fit, because a shape is chosen for the relationship the
 * concept asserts and substituting one makes the visual less true.
 */
export function compositionAcceptsShape(
  hostType: string,
  composition: VisualComposition,
  shape: ConstructedShape,
): boolean {
  // A diagram must be studied; the fold must be recognised in a second.
  if (composition === "fold_media") return false;

  // A visual that LEADS a section earns the position by showing the CHANGE the
  // section then details. A hub or a network is a static relationship: it
  // explains nothing about why the list beneath it follows, so it reads as a
  // header image. Only the two shapes that depict a transition qualify.
  if (composition === "anchor") return shape === "fragmented_to_connected" || shape === "state_contrast";

  // Beside a benefits grid, the cards already enumerate steps. Drawing them
  // again as a sequence is the redundancy rule in its purest form.
  if (hostType === "benefits_grid") return shape !== "sequence";

  return true;
}

/**
 * MAY A PHOTOGRAPH TAKE THIS POSITION?
 *
 * Everywhere except the anchor. The anchor is a position earned by depicting a
 * transition — that is the only thing that justifies a visual standing ahead of
 * the content rather than beside it. A photograph, however good and however
 * genuinely the customer's own, does not depict a change; placed there it is a
 * header image over a list, which is the decoration this pass removed.
 */
export function compositionAcceptsPhoto(composition: VisualComposition): boolean {
  return composition !== "anchor";
}

/**
 * MEDIA ALTERNATES SIDES DOWN THE PAGE.
 *
 * Mirrors `alternateMediaSides` in page-composition: two split beats that both
 * open on the same side read as one row repeated. Assigned across the page, so
 * the decision cannot be made locally and then collide.
 */
export function sideForPlacement(placedSoFar: number): "left" | "right" {
  return placedSoFar % 2 === 0 ? "right" : "left";
}

/**
 * The structural devices a section ALREADY DRAWS.
 *
 * Handed to the resolver so a constructed visual cannot duplicate something the
 * page renders as real content. A process/agenda section IS a sequence with
 * true labels on it; a comparison IS a state contrast. Redrawing either is the
 * failure the first render shipped — a 1-2-3 diagram directly above a process
 * section that said the same thing better.
 */
export function devicesRenderedBy(section: FunnelSection): ("sequence" | "state_contrast")[] {
  const variant = (section.config as { variant?: string }).variant;
  const out: ("sequence" | "state_contrast")[] = [];
  if (section.type === "agenda" || variant === "process_flow") out.push("sequence");
  if (section.type === "comparison" || section.type === "before_after" || variant === "before_after") {
    out.push("state_contrast");
  }
  return out;
}
