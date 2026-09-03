/**
 * SECTION COMPLETENESS — the objective half of "is this page real?".
 *
 * THE LAW (final launch pass, checkpoint 1):
 *   A section may be MINIMAL.
 *   A section may be OMITTED.
 *   A section may NOT be EMPTY-BUT-PRESENT.
 *
 * An empty-but-present section is the one failure mode a visitor always
 * notices and no upstream check caught: the generator emitted the skeleton,
 * the content never arrived, and the page shipped with dead zones between
 * real sections. The traced negative fixture (a lead_gen page with an empty
 * proof strip, an all-blank problem/solution and an itemless FAQ) reached a
 * "ready" verdict precisely because every guard in the system judged
 * DECISIONS and INPUTS, and nothing judged whether the artifact actually had
 * content in it.
 *
 * WHY THIS IS DETERMINISTIC. "Is this heading persuasive?" is judgment and
 * belongs to the Critic. "Does this section contain any customer-facing
 * content at all?" is a fact. Facts must not be delegated to a model — a
 * model can be talked out of a fact, and this one was.
 *
 * NEVER FABRICATES. The remedy for an empty section is to OMIT it, never to
 * fill it. Inventing proof, testimonials, stats or FAQ answers to satisfy a
 * completeness check would be a far worse failure than the empty shell.
 *
 * Consumed by exactly two places, so the two can never drift:
 *   - lib/server/funnels-service.ts  — prunes + fails closed at the write boundary
 *   - lib/funnels/landing-page-critic.ts — objective findings before subjective critique
 */

import type { FunnelSection, FunnelSectionType } from "@/types/funnels";

export type CompletenessState =
  /** Carries real customer-facing content. Minimal is fine. */
  | "ok"
  /** No customer-facing content whatsoever — a shell. Safe to OMIT. */
  | "empty"
  /** Has content, but a required customer-facing element is missing (a
   *  headline over a body, one half of a two-sided contrast). Cannot be
   *  omitted without losing real content, so it is reported, not dropped. */
  | "incomplete";

export interface SectionCompleteness {
  sectionId: string;
  sectionType: FunnelSectionType;
  state: CompletenessState;
  /** Customer-appropriate, actionable. Empty string when state is "ok". */
  reason: string;
}

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const has = (v: unknown): boolean => s(v).length > 0;
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
/** Counts entries that carry at least one of the named text fields. An array
 *  of blank objects is an empty array as far as a visitor is concerned. */
const filled = (v: unknown, ...fields: string[]): number =>
  list(v).filter((it) => it && fields.some((f) => has(it[f]))).length;

type Verdict = { state: CompletenessState; reason: string };
const OK: Verdict = { state: "ok", reason: "" };
const empty = (reason: string): Verdict => ({ state: "empty", reason });
const incomplete = (reason: string): Verdict => ({ state: "incomplete", reason });

/**
 * Per-type rules. Each answers only: what is the minimum this section must
 * carry for a visitor to get something real from it?
 *
 * Deliberately generous. "Minimal is allowed" is a law, not a concession —
 * a hero with just a headline, a footer with just a business name and a
 * gallery showing an honest "add photos of your work" placeholder are all
 * legitimate pages, and none of them may be pruned.
 */
const RULES: Record<FunnelSectionType, (c: Record<string, unknown>) => Verdict> = {
  hero: (c) =>
    has(c.headline)
      ? OK
      : // The page's opening statement. Omitting it is not an option, so this
        // is always reported rather than pruned, and viability fails below.
        incomplete("The hero has no headline — it is the first thing a visitor reads."),

  proof_strip: (c) => {
    if (c.variant === "rating") {
      const r = (c.rating ?? {}) as Record<string, unknown>;
      return Number(r.score) > 0 && Number(r.reviewCount) > 0
        ? OK
        : empty("The proof strip is set to show a rating but carries no real rating.");
    }
    return filled(c.logos, "url") > 0
      ? OK
      : empty("The proof strip has no logos in it — it would render as a blank band.");
  },

  offer: (c) => {
    const bullets = Array.isArray(c.bullets) ? (c.bullets as unknown[]).filter((b) => has(b)).length : 0;
    if (!has(c.headline) && bullets === 0 && c.priceCents == null) {
      return empty("The offer section has no headline, no bullets and no price.");
    }
    if (!has(c.headline)) {
      return incomplete("The offer section has content but no headline above it.");
    }
    return OK;
  },

  story: (c) =>
    Array.isArray(c.paragraphs) && (c.paragraphs as unknown[]).some((p) => has(p))
      ? OK
      : empty("The story section has no paragraphs."),

  faq: (c) =>
    filled(c.items, "question") > 0
      ? filled(c.items, "answer") > 0
        ? OK
        : incomplete("The FAQ has questions with no answers.")
      : empty("The FAQ has no questions in it."),

  cta_banner: (c) => {
    if (!has(c.headline) && !has(c.ctaLabel)) return empty("The closing CTA banner is blank.");
    if (!has(c.ctaLabel)) return incomplete("The closing CTA banner has no button label.");
    if (!has(c.headline)) return incomplete("The closing CTA banner has no headline.");
    return OK;
  },

  countdown: (c) =>
    has(c.endsAt) && !Number.isNaN(Date.parse(s(c.endsAt)))
      ? OK
      : empty("The countdown has no end time set."),

  agenda: (c) =>
    filled(c.days, "title", "label") > 0 ? OK : empty("The agenda has no days in it."),

  ticket_tiers: (c) =>
    filled(c.tiers, "name") > 0 ? OK : empty("The ticket tiers section has no tiers."),

  guarantee: (c) => {
    if (!has(c.headline) && !has(c.bodyText)) return empty("The guarantee section is blank.");
    if (!has(c.bodyText)) return incomplete("The guarantee has a heading but states no terms.");
    return OK;
  },

  trust_badges: (c) =>
    filled(c.badges, "label") > 0 ? OK : empty("The trust badges row has no badges."),

  checkout: (c) => {
    const bullets = Array.isArray(c.bullets) ? (c.bullets as unknown[]).filter((b) => has(b)).length : 0;
    if (!has(c.headline) && bullets === 0 && c.priceCents == null) {
      return empty("The checkout section has no headline, no bullets and no price.");
    }
    if (c.checkoutMode === "stripe_checkout" && c.priceCents == null) {
      return incomplete("The checkout is set to take real payment but has no price.");
    }
    if (!has(c.ctaLabel)) return incomplete("The checkout section has no button label.");
    return OK;
  },

  upsell_offer: (c) => {
    const bullets = Array.isArray(c.bullets) ? (c.bullets as unknown[]).filter((b) => has(b)).length : 0;
    if (!has(c.headline) && bullets === 0) return empty("The upsell step has no headline or bullets.");
    if (!has(c.headline)) return incomplete("The upsell step has no headline.");
    return OK;
  },

  // An honest labeled placeholder IS content — it tells the operator exactly
  // what to supply and renders as a deliberate slot, not a dead zone. That is
  // the documented anti-fabrication design and must never be pruned.
  video: (c) =>
    has(c.embedUrl) || has(c.placeholderLabel) || has(c.headline)
      ? OK
      : empty("The video section has no video and no placeholder."),

  benefits_grid: (c) =>
    filled(c.items, "title") > 0 ? OK : empty("The benefits grid has no items in it."),

  problem_solution: (c) => {
    const p = has(c.problemHeadline) || has(c.problemText);
    const sol = has(c.solutionHeadline) || has(c.solutionText);
    if (!p && !sol) return empty("The problem/solution section is completely blank.");
    if (!p) return incomplete("The problem/solution section states a solution but no problem.");
    if (!sol) return incomplete("The problem/solution section states a problem but no solution.");
    return OK;
  },

  before_after: (c) => {
    const b = Array.isArray(c.beforeItems) && (c.beforeItems as unknown[]).some((x) => has(x));
    const a = Array.isArray(c.afterItems) && (c.afterItems as unknown[]).some((x) => has(x));
    if (!b && !a) return empty("The before/after section has no items on either side.");
    if (!b || !a) return incomplete("The before/after section only has one side filled in.");
    return OK;
  },

  included: (c) =>
    filled(c.items, "title") > 0 ? OK : empty("The what's-included section has no items."),

  value_stack: (c) =>
    filled(c.items, "title") > 0 ? OK : empty("The value stack has no items in it."),

  comparison: (c) =>
    filled(c.rows, "feature") > 0 ? OK : empty("The comparison table has no rows."),

  testimonials: (c) =>
    filled(c.items, "quote") > 0 ? OK : empty("The testimonials section has no quotes."),

  stats: (c) => (filled(c.items, "value") > 0 ? OK : empty("The stats section has no numbers.")),

  callout: (c) => (has(c.text) ? OK : empty("The callout has no text.")),

  team: (c) => (filled(c.members, "name") > 0 ? OK : empty("The team section has no people in it.")),

  image_text: (c) =>
    filled(c.blocks, "headline", "text") > 0 ? OK : empty("The image+text section has no blocks."),

  business_footer: (c) =>
    has(c.businessName) || has(c.email) || has(c.phone) || has(c.address)
      ? OK
      : empty("The footer carries no business identity."),

  photo_gallery: (c) =>
    filled(c.images, "url") > 0 || has(c.placeholderLabel) || has(c.headline)
      ? OK
      : empty("The photo gallery has no images and no placeholder."),
};

export function evaluateSection(section: FunnelSection): SectionCompleteness {
  const rule = RULES[section.type];
  const verdict = rule
    ? rule((section.config ?? {}) as Record<string, unknown>)
    : // An unknown type is not assumed broken — a future section type must not
      // start silently deleting itself on every save.
      OK;
  return { sectionId: section.id, sectionType: section.type, state: verdict.state, reason: verdict.reason };
}

export function evaluateSections(sections: FunnelSection[]): SectionCompleteness[] {
  return sections.map(evaluateSection);
}

/** Any section that carries a real way for a visitor to act. */
function hasConversionPath(section: FunnelSection): boolean {
  const c = (section.config ?? {}) as Record<string, unknown>;
  const cta = (c.cta ?? {}) as Record<string, unknown>;
  if (has(c.formId)) return true;
  if (has(c.ctaHref)) return true;
  if (has(cta.bookingPageSlug) || has(cta.phoneNumber) || has(cta.secondaryHref)) return true;
  if (section.type === "checkout" || section.type === "upsell_offer") return true;
  if (section.type === "ticket_tiers") {
    return list(c.tiers).some((t) => has(t.formId) || has(t.ctaHref));
  }
  return false;
}

/** Any section that states the page's primary message. */
function hasPrimaryMessage(section: FunnelSection): boolean {
  const c = (section.config ?? {}) as Record<string, unknown>;
  return (
    (section.type === "hero" || section.type === "offer" || section.type === "checkout" ||
      section.type === "video" || section.type === "upsell_offer" || section.type === "cta_banner") &&
    has(c.headline)
  );
}

export interface ViabilityResult {
  viable: boolean;
  /** Customer-appropriate reasons. Empty when viable. */
  reasons: string[];
}

/**
 * Would what remains still function as a conversion experience?
 *
 * This is the fail-closed boundary. Pruning empty shells is a repair; pruning
 * so much that nothing is left is a different failure, and shipping THAT
 * silently would be worse than shipping the shells — the visitor would get a
 * page that looks finished and does nothing.
 */
export function assessViability(sections: FunnelSection[]): ViabilityResult {
  const reasons: string[] = [];
  if (sections.length === 0) {
    return { viable: false, reasons: ["The page has no sections left with any content in them."] };
  }
  if (!sections.some(hasPrimaryMessage)) {
    reasons.push("The page states no headline anywhere — a visitor would not know what it offers.");
  }
  if (!sections.some(hasConversionPath)) {
    reasons.push("The page gives a visitor no way to act — no form, checkout, booking link or phone number.");
  }
  return { viable: reasons.length === 0, reasons };
}

export interface PruneResult {
  sections: FunnelSection[];
  /** What was dropped, and why. Auditable — a silent deletion is not. */
  removed: SectionCompleteness[];
  /** Present-but-degraded sections. Never dropped (they hold real content);
   *  reported so the Critic and the operator can see them. */
  incomplete: SectionCompleteness[];
  viability: ViabilityResult;
}

/**
 * Omit every empty-but-present section, keep everything else untouched, and
 * report whether what remains is still a legitimate page.
 */
export function pruneEmptySections(sections: FunnelSection[]): PruneResult {
  const evaluated = evaluateSections(sections);
  const removed = evaluated.filter((e) => e.state === "empty");
  const removedIds = new Set(removed.map((e) => e.sectionId));
  const kept = sections.filter((sec) => !removedIds.has(sec.id));
  return {
    sections: kept,
    removed,
    incomplete: evaluated.filter((e) => e.state === "incomplete"),
    viability: assessViability(kept),
  };
}
