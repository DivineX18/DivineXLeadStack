import type {
  BenefitsGridConfig,
  CtaBannerConfig,
  FunnelSection,
  HeroConfig,
  ImageTextConfig,
  IncludedConfig,
  ProblemSolutionConfig,
} from "@/types/funnels";
import { sectionHasRenderableContent } from "@/lib/funnels/art-direction";

/**
 * PAGE-LEVEL COMPOSITION — the pass that looks at the whole page.
 *
 * Everything upstream of here decides one section at a time. `frameworks.ts`
 * picks which beats exist; `applyArtDirection` assigns a variant and a canvas
 * per SECTION TYPE from the campaign's energy; `applySalesArgument` writes each
 * beat's copy from the plan. All three are correct at their own altitude and
 * all three are blind to the same thing: what the page looks like read top to
 * bottom.
 *
 * Five defects follow from that blindness, and every one of them was observed
 * on all five rendered fixtures rather than reasoned about:
 *
 *   1. The close was literally the seeded default — a box reading "Ready?" with
 *      a "Get started" button — on a page whose own call to action was
 *      "Schedule My Free Roof Inspection". The visitor is asked three times in
 *      the page's language and once in nobody's.
 *   2. On the consultant page the closing banner rendered BEFORE the offer, so
 *      the page closed and then made its pitch.
 *   3. Section headings repeated each other verbatim, because more than one
 *      seeder legitimately reaches for the same sentence.
 *   4. Every beat resolved to the same narrow centred column, so a six-section
 *      page had one silhouette repeated six times.
 *   5. Where media existed it sat on the same side of every row.
 *
 * None of these is fixable from inside a single section, which is why this
 * exists as its own pass rather than another branch in `applyArtDirection`.
 *
 * WHAT IT WILL NOT DO. It never writes a claim. Every repair here either moves
 * a section, changes how a section is laid out, or reuses a sentence the page
 * already had a right to say (the plan's own promise, the page's own CTA
 * label). When there is nothing honest to promote a section to, it is left
 * alone — a plain page is a correct outcome and a fabricated one never is.
 */

/**
 * The SHAPE a section occupies, independent of what it is about.
 *
 * Variety is a property of shapes, not of section types: a checklist, an FAQ
 * and a stacked problem/solution are three different subjects rendered as the
 * same narrow centred column, and a reader scrolling past sees one thing three
 * times. Grouping by shape is what lets the variety pass below see the page the
 * way a visitor does.
 */
export type LayoutFamily =
  /** The opening fold. Only ever one, and it is its own shape. */
  | "fold"
  /** Narrow centred measure — the default of most sections. */
  | "centered_column"
  /** Text set beside media, or two columns of comparable weight. */
  | "split"
  /** Zigzag rows that alternate which side carries the media. */
  | "alternating"
  /** A card grid. */
  | "grid"
  /** A full-width strip: ratings, logos, stats, a pull quote, the full-bleed close. */
  | "band"
  /** A contained card the eye is meant to stop on: the offer, the checkout. */
  | "card"
  /** Row-and-column data: the comparison table. */
  | "table"
  /** Renders nothing a reader can see; never counts toward rhythm. */
  | "none";

/** What shape will this section actually occupy once rendered? */
export function layoutFamilyOf(section: FunnelSection): LayoutFamily {
  if (!sectionHasRenderableContent(section)) return "none";
  switch (section.type) {
    case "hero":
      return "fold";
    case "benefits_grid":
      return (section.config as BenefitsGridConfig).variant === "alternating_image" ? "alternating" : "centered_column";
    case "problem_solution":
      return (section.config as ProblemSolutionConfig).variant === "before_after" ? "split" : "centered_column";
    case "cta_banner":
      return (section.config as CtaBannerConfig).variant === "full_bleed_close" ? "band" : "card";
    case "image_text":
      return "alternating";
    case "photo_gallery":
      return "grid";
    case "comparison":
      return "table";
    case "before_after":
      return "split";
    case "team":
    case "testimonials":
    case "ticket_tiers":
      return "grid";
    case "proof_strip":
    case "trust_badges":
    case "stats":
    case "callout":
    case "countdown":
      return "band";
    case "offer":
    case "checkout":
    case "upsell_offer":
      return "card";
    case "business_footer":
      return "band";
    default:
      return "centered_column";
  }
}

/** What the page is closing on, so the close can be written in its language. */
export interface PageCompositionContext {
  /** The page's primary CTA label, verbatim — the one the hero already uses. */
  primaryCtaLabel?: string | null;
  /** The plan's single credible outcome. */
  corePromise?: string | null;
  /** Why acting now makes sense — the plan's own reason, which is what a
   *  closing section is FOR. */
  closeReason?: string | null;
}

/** Case- and punctuation-insensitive comparison, so "Ready?" and "ready" are
 *  the same heading and a trailing period never hides a duplicate. */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/[.!?,:;'"]+/g, "").replace(/\s+/g, " ");
}

/** The seeded placeholders that mean "nobody wrote this". Matching is exact
 *  (after normalisation) so a real page that genuinely says "Ready to start?"
 *  is never mistaken for an unwritten one. */
const UNWRITTEN_CLOSE_HEADLINES = new Set(["ready", "ready to get started", "get started"]);
const UNWRITTEN_CTA_LABELS = new Set(["get started", "submit", "continue", "click here", "learn more"]);

/**
 * 1. THE CLOSE MUST CLOSE.
 *
 * `defaultSectionConfig("cta_banner")` seeds `{headline: "Ready?", ctaLabel:
 * "Get started"}` for the model to overwrite, and when the model does not — the
 * common case, and the case on all five fixtures — that default ships. The
 * existing seeder fills the banner's SUBTEXT from the plan but leaves the
 * heading and the button alone, so the page's final ask was in nobody's voice
 * while the same button three sections above said "Schedule My Free Roof
 * Inspection".
 *
 * Both replacements are words the page already owns: the button takes the
 * page's own primary CTA label, and the heading takes the plan's own reason to
 * act. Neither is invented, and real authored copy is never overwritten.
 *
 * The heading is the CLOSE REASON, not the core promise, and that is a
 * correction to a first attempt here rather than a preference. Heading the
 * close with the promise looked right in isolation and shipped the same
 * sentence twice on four of five fixtures, because the offer section a few
 * beats above is ALREADY headed with the promise (applySalesArgument seeds it
 * there). The two sections have different jobs — the offer says what you get,
 * the close says why now — so they should not reach for the same sentence. The
 * promise still appears at the close, as the subtext under it.
 */
function closeTheClose(sections: FunnelSection[], ctx: PageCompositionContext): FunnelSection[] {
  const lastCtaIdx = sections.reduce((last, s, i) => (s.type === "cta_banner" ? i : last), -1);
  if (lastCtaIdx === -1) return sections;

  // Headings already spoken for elsewhere on the page, so the close cannot
  // pick one of them.
  const taken = new Set(
    sections
      .filter((s, i) => i !== lastCtaIdx && sectionHasRenderableContent(s))
      .map((s) => normalize((s.config as { headline?: string }).headline ?? ""))
      .filter(Boolean),
  );

  return sections.map((s, i) => {
    if (s.type !== "cta_banner") return s;
    const cfg = s.config as CtaBannerConfig;
    const next: CtaBannerConfig = { ...cfg };

    // The button, on EVERY banner: a repeat CTA that drifts to "Get started"
    // restarts the conversation the page just had.
    if (ctx.primaryCtaLabel && UNWRITTEN_CTA_LABELS.has(normalize(cfg.ctaLabel ?? ""))) {
      next.ctaLabel = ctx.primaryCtaLabel;
    }

    // The heading, on the CLOSING banner only: a mid-page banner is an action
    // beat and may legitimately stay short.
    if (i === lastCtaIdx && UNWRITTEN_CLOSE_HEADLINES.has(normalize(cfg.headline ?? ""))) {
      // Reason to act first, promise as the fallback. Only a sentence that
      // fits as a heading — a truncated one would read worse than the
      // placeholder it replaces, so the placeholder stays.
      const candidate = [ctx.closeReason, ctx.corePromise]
        .map((t) => t?.trim().replace(/[.,;:]\s*$/, ""))
        .find((t) => t && t.length <= 80 && !taken.has(normalize(t)));
      if (candidate) {
        next.headline = candidate;
        // The seeder above this pass writes the subtext as promise + reason.
        // With the reason now carrying the heading, that subtext would say it
        // twice inside one box, so the subtext keeps the promise alone.
        const promise = ctx.corePromise?.trim();
        if (promise && normalize(candidate) !== normalize(promise) && next.subtext && normalize(next.subtext).includes(normalize(candidate))) {
          next.subtext = /[.!?]$/.test(promise) ? promise : `${promise}.`;
        }
      }
    }

    return { ...s, config: next };
  });
}

/**
 * 2. THE PAGE CLOSES LAST.
 *
 * On the consultant fixture the closing banner rendered at position 3 and the
 * offer at position 4: the page asked for the decision, then explained what was
 * being decided. That ordering is produced upstream by stage insertion, and no
 * single-section pass can see it.
 *
 * Deliberately minimal — this moves ONE section (the final call to action, to
 * just before the footer) rather than re-ordering the page. Everything else
 * about the sequence is a framework decision and stays one.
 */
function closeLast(sections: FunnelSection[]): FunnelSection[] {
  const lastCtaIdx = sections.reduce((last, s, i) => (s.type === "cta_banner" ? i : last), -1);
  if (lastCtaIdx === -1) return sections;
  // Anything that must still come after the close: the business signature.
  const tailTypes = new Set(["business_footer"]);
  const lastContentIdx = sections.reduce(
    (last, s, i) => (tailTypes.has(s.type) ? last : i),
    -1,
  );
  if (lastCtaIdx >= lastContentIdx) return sections; // already closing
  // Only move it PAST a beat the visitor still needs — an offer or a proof
  // beat. A close sitting above an FAQ is a defensible mid-page action beat.
  const decisionTypes = new Set(["offer", "checkout", "ticket_tiers", "value_stack", "included"]);
  const laterDecision = sections.slice(lastCtaIdx + 1).some((s) => decisionTypes.has(s.type) && sectionHasRenderableContent(s));
  if (!laterDecision) return sections;

  const close = sections[lastCtaIdx];
  const rest = [...sections.slice(0, lastCtaIdx), ...sections.slice(lastCtaIdx + 1)];
  const insertAt = rest.findIndex((s) => tailTypes.has(s.type));
  return insertAt === -1 ? [...rest, close] : [...rest.slice(0, insertAt), close, ...rest.slice(insertAt)];
}

/**
 * 3. NO SECTION REPEATS ANOTHER SECTION'S HEADING.
 *
 * More than one seeder can legitimately reach for the same sentence — the
 * synthesized-argument floor sets `corePromise` to the hero headline, so the
 * hero, the offer heading and the close subtext all became one sentence printed
 * three times. The page reads as a stutter rather than an argument.
 *
 * The repair is to CLEAR the later duplicate, not to write a replacement:
 * sections whose heading is optional render fine without one, and inventing a
 * fresh heading to paper over a duplicate is exactly the fabrication this
 * codebase refuses elsewhere. A section that genuinely needs a heading keeps
 * the duplicate rather than losing its head, and the harness reports it.
 */
const HEADING_REQUIRED = new Set(["offer", "checkout", "cta_banner", "hero"]);

function dedupeHeadings(sections: FunnelSection[]): FunnelSection[] {
  const seen = new Set<string>();
  return sections.map((s) => {
    if (!sectionHasRenderableContent(s)) return s;
    const c = s.config as { headline?: string };
    const h = c.headline?.trim();
    if (!h) return s;
    const key = normalize(h);
    if (!seen.has(key)) {
      seen.add(key);
      return s;
    }
    if (HEADING_REQUIRED.has(s.type)) return s; // headless would read worse
    return { ...s, config: { ...s.config, headline: "" } };
  });
}

/**
 * 4. THE PAGE MUST NOT BE ONE SHAPE REPEATED.
 *
 * With every beat resolving to a narrow centred column, a reader scrolling the
 * Summit page saw the same silhouette five times and read it as a template. The
 * rule enforced here is deliberately weak and therefore safe: no THREE
 * consecutive rendered sections may share a layout family. Two in a row is
 * ordinary rhythm; three is a pattern the eye starts predicting.
 *
 * Promotion is only ever to a layout the section ALREADY SUPPORTS with the
 * content it ALREADY HAS — there is no branch here that adds a section, invents
 * an item, or asks for a photograph. A benefits grid becomes alternating rows
 * only when its items carry the description or image those rows need; a
 * problem/solution becomes the two-column before/after only when both sides are
 * written. When nothing qualifies, the run stands and the page is honestly
 * repetitive rather than dishonestly varied.
 */
function promote(section: FunnelSection): FunnelSection | null {
  // AN EXPLICIT REGISTER DECISION IS NEVER OVERTURNED.
  //
  // `applyArtDirection` runs before this pass and sets a variant whenever it
  // has an opinion, leaving it undefined when it does not. Those opinions are
  // about how the campaign should FEEL — a calm, people-led page is given the
  // contained "banner" close specifically so it never gets a high-contrast
  // full-bleed band, and an urgent page is given the flowing checklist because
  // it sits on a dark immersive surface. Promoting for the sake of rhythm
  // would quietly undo exactly those decisions, and rhythm is the weaker
  // concern. So only an UNDECIDED section is a candidate.
  if ((section.config as { variant?: string }).variant !== undefined) return null;

  switch (section.type) {
    case "benefits_grid": {
      const cfg = section.config as BenefitsGridConfig;
      // Zigzag rows need something beside the title, or each row is one short
      // line marooned next to an empty panel.
      const rich = (cfg.items ?? []).filter((it) => it.description?.trim() || it.imageUrl).length >= 2;
      if (!rich) return null;
      return { ...section, config: { ...cfg, variant: "alternating_image" as const } };
    }
    case "problem_solution": {
      const cfg = section.config as ProblemSolutionConfig;
      if (!cfg.problemText?.trim() || !cfg.solutionText?.trim()) return null;
      return { ...section, config: { ...cfg, variant: "before_after" as const } };
    }
    case "included": {
      const cfg = section.config as IncludedConfig;
      // The framed example-preview is a presentation of the REAL contents, so
      // it needs contents substantial enough to be worth previewing.
      if ((cfg.items ?? []).length < 3) return null;
      return { ...section, config: { ...cfg, variant: "deliverable_preview" as const } };
    }
    case "cta_banner":
      return { ...section, config: { ...(section.config as CtaBannerConfig), variant: "full_bleed_close" as const } };
    default:
      return null;
  }
}

function breakLayoutRuns(sections: FunnelSection[]): FunnelSection[] {
  const out = [...sections];
  let runFamily: LayoutFamily | null = null;
  let runStart = -1;
  let runLength = 0;

  for (let i = 0; i < out.length; i++) {
    const family = layoutFamilyOf(out[i]);
    if (family === "none") continue; // invisible sections never break rhythm
    if (family === runFamily) {
      runLength++;
    } else {
      runFamily = family;
      runStart = i;
      runLength = 1;
      continue;
    }
    if (runLength < 3) continue;
    // Promote the MIDDLE of the run where possible: changing the shape between
    // two like neighbours breaks the pattern for both, where changing an end
    // only shortens it.
    let promoted = false;
    for (const idx of [i - 1, i, runStart]) {
      if (idx < runStart || idx > i) continue;
      const next = promote(out[idx]);
      if (next && layoutFamilyOf(next) !== family) {
        out[idx] = next;
        promoted = true;
        break;
      }
    }
    // Whether or not anything qualified, restart the count from here: a run
    // that could not be broken must not trigger a promotion attempt on every
    // subsequent section of the same family.
    runFamily = family;
    runStart = promoted ? i : runStart;
    runLength = promoted ? 1 : 0;
  }
  return out;
}

/**
 * 5. A REAL PHOTOGRAPH EARNS THE FOLD'S WIDTH.
 *
 * The centred hero renders its media as a small rounded card under the
 * subheadline, which is the weakest available use of the most valuable
 * viewport on the page: on the Summit render it left a tall empty band above
 * the headline, a postage-stamp photo in the middle, and the CTA pushed toward
 * the fold line. `applyArtDirection` already upgrades this for urgent campaigns
 * (to the full-bleed environmental hero) but every other register was left on
 * the centred fallback, so a calm page with a genuine photograph still
 * displayed it as a thumbnail.
 *
 * The split hero is an existing layout that sets the media beside the headline
 * across the fold's full measure, so this is a better use of a primitive that
 * already ships rather than a new one. Applied ONLY when there is a real image:
 * a placeholder stretched across half the fold would be a large hole where an
 * asset should be, which is worse than a centred page with no picture. An
 * explicit non-centred layout is always left alone — including the urgent
 * full-bleed treatment, which is a deliberate register decision.
 */
function widenTheFold(sections: FunnelSection[]): FunnelSection[] {
  return sections.map((s) => {
    if (s.type !== "hero") return s;
    const cfg = s.config as HeroConfig;
    if (cfg.layout && cfg.layout !== "centered") return s;
    if (cfg.mediaType !== "image" || !cfg.mediaUrl) return s;
    const next: HeroConfig = { ...cfg, layout: "split" };
    return { ...s, config: next };
  });
}

/**
 * 6. MEDIA ALTERNATES SIDES.
 *
 * `image_text` blocks each carry their own `imagePosition`, and nothing was
 * setting it per block, so every row put its picture on the same side and the
 * zigzag layout rendered as a column of identical rows. Positions are assigned
 * across the whole page rather than within one section, so two adjacent
 * media-bearing sections cannot both open on the left.
 */
function alternateMediaSides(sections: FunnelSection[]): FunnelSection[] {
  let side: "left" | "right" = "left";
  return sections.map((s) => {
    if (s.type !== "image_text") return s;
    const cfg = s.config as ImageTextConfig;
    if (!cfg.blocks?.length) return s;
    const blocks = cfg.blocks.map((b) => {
      const assigned = { ...b, imagePosition: side };
      side = side === "left" ? "right" : "left";
      return assigned;
    });
    return { ...s, config: { ...cfg, blocks } };
  });
}

/**
 * Compose the finished page. Pure: returns new objects and never mutates input.
 *
 * Ordering matters. The close is written and moved before headings are deduped
 * (so the close's new heading participates in the duplicate check), and the
 * layout-variety pass runs last because moving a section changes which
 * sections are adjacent.
 */
export function composePage(
  sections: FunnelSection[],
  ctx: PageCompositionContext = {},
): FunnelSection[] {
  let out = closeTheClose(sections, ctx);
  out = closeLast(out);
  out = dedupeHeadings(out);
  out = widenTheFold(out);
  out = alternateMediaSides(out);
  out = breakLayoutRuns(out);
  return out;
}

/**
 * A page-level report of what a reader would see, for the harness and the
 * Critic. Deliberately factual: it counts shapes and repeats, and asserts
 * nothing about taste.
 */
export function describePageRhythm(sections: FunnelSection[]): {
  families: LayoutFamily[];
  longestRun: number;
  distinctFamilies: number;
  repeatedHeadings: string[];
  ctaLabels: string[];
} {
  const families = sections.map(layoutFamilyOf).filter((f) => f !== "none");
  let longestRun = 0;
  let run = 0;
  let prev: LayoutFamily | null = null;
  for (const f of families) {
    run = f === prev ? run + 1 : 1;
    prev = f;
    longestRun = Math.max(longestRun, run);
  }
  const seen = new Set<string>();
  const repeatedHeadings: string[] = [];
  const ctaLabels: string[] = [];
  for (const s of sections) {
    if (!sectionHasRenderableContent(s)) continue;
    const c = s.config as { headline?: string; ctaLabel?: string };
    const h = c.headline?.trim();
    if (h) {
      const key = normalize(h);
      if (seen.has(key)) repeatedHeadings.push(h);
      else seen.add(key);
    }
    if (c.ctaLabel?.trim()) ctaLabels.push(c.ctaLabel.trim());
  }
  return {
    families,
    longestRun,
    distinctFamilies: new Set(families).size,
    repeatedHeadings,
    ctaLabels,
  };
}
