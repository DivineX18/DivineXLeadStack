/**
 * Campaign Art Direction (Increment 1 of docs/plans/flow-art-direction-upgrade.md).
 *
 * The layer that turns strategy into VISUAL COMPOSITION — the missing half the
 * audit found: the brain could decide "urgent, people-led, panic→relief" but
 * every funnel still rendered the same single-layout sections on the same
 * background rhythm. This module derives a Campaign Art Direction Profile from
 * model-supplied inputs and DETERMINISTICALLY maps it onto the composed
 * sections: per-section layout `variant`s + per-section `canvas` treatments.
 *
 * Design rules (locked in the plan):
 *  - The model supplies INPUTS (the emotional transformation + optional
 *    dimension overrides); this mapper composes. No per-business hardcoding —
 *    the same inputs always produce the same composition, so it's testable and
 *    generalizes to businesses we've never seen.
 *  - Pure: no LLM, no Firestore, no side effects.
 *  - Regression-safe: a baseline profile (no transformation, balanced
 *    dimensions) returns the sections UNTOUCHED — funnels created without
 *    art-direction inputs render exactly as before.
 *  - Never fabricates content: variants/canvases re-present content the model
 *    already wrote; nothing here invents copy, stats, imagery, or proof.
 */

import type { FunnelSection, SectionCanvas } from "@/types/funnels";
import type {
  BenefitsGridConfig,
  CtaBannerConfig,
  HeroConfig,
  ProblemSolutionConfig,
} from "@/types/funnels";

// ─── Profile dimensions (reasoning axes, never customer-facing sliders) ────

export type CampaignEnergy = "calm" | "balanced" | "urgent";
export type CampaignDensity = "minimal" | "medium" | "rich";
export type CampaignHumanity = "product_led" | "balanced" | "people_led";

/** The buyer's current → desired emotional state. This is the single highest-
 *  leverage art-direction input: it decides whether the page must feel like
 *  "help is available right now" (panic→relief) or "you are safe here"
 *  (fear→safety) — which are structurally different pages, not recolors. */
export type EmotionalTransformation =
  | "panic_to_relief" // emergency/urgent local service (dead AC in July)
  | "fear_to_safety" // anxious/avoidant buyer (dentist, therapy)
  | "uncertainty_to_confidence" // attorney, high-stakes professional
  | "confusion_to_clarity" // financial advisor, complex purchase
  | "frustration_to_control" // SaaS/tools replacing a painful workflow
  | "discouragement_to_possibility" // fitness, coaching, self-improvement
  | "desire_to_aspiration" // luxury/premium
  | "concern_to_action" // nonprofit/cause
  | "interest_to_ownership" // ecommerce/product
  | "stagnation_to_clarity"; // consulting/strategy

export const EMOTIONAL_TRANSFORMATIONS: readonly EmotionalTransformation[] = [
  "panic_to_relief",
  "fear_to_safety",
  "uncertainty_to_confidence",
  "confusion_to_clarity",
  "frustration_to_control",
  "discouragement_to_possibility",
  "desire_to_aspiration",
  "concern_to_action",
  "interest_to_ownership",
  "stagnation_to_clarity",
] as const;

export interface ArtDirectionProfile {
  transformation: EmotionalTransformation | null;
  energy: CampaignEnergy;
  density: CampaignDensity;
  humanity: CampaignHumanity;
}

export interface ArtDirectionInputs {
  transformation?: EmotionalTransformation | null;
  /** Explicit overrides — only set when the business genuinely deviates from
   *  the transformation's default character. */
  energy?: CampaignEnergy | null;
  density?: CampaignDensity | null;
  humanity?: CampaignHumanity | null;
  /** Resolved visual archetype — the SAFETY NET when no transformation was
   *  supplied: distinct industries still get dimension defaults (and thus art
   *  direction) instead of silently falling to the do-nothing baseline. */
  archetype?: string | null;
}

/** Dimension defaults per archetype, used ONLY when no transformation was
 *  supplied. Coarser than a real transformation but always safe — e.g. a
 *  professional/healthcare page composes calm-rational, never urgent. Absent
 *  archetypes (incl. direct_response) stay baseline = unchanged. */
const ARCHETYPE_FALLBACK: Record<string, { energy: CampaignEnergy; density: CampaignDensity; humanity: CampaignHumanity }> = {
  professional_enterprise: { energy: "calm", density: "rich", humanity: "balanced" },
  luxury_premium: { energy: "calm", density: "minimal", humanity: "people_led" },
  nonprofit_mission: { energy: "balanced", density: "medium", humanity: "people_led" },
  wellness: { energy: "calm", density: "medium", humanity: "people_led" },
}

/** The default character of each transformation — how that buyer state maps
 *  onto the reasoning dimensions. Deterministic; overridable per input. */
const TRANSFORMATION_DEFAULTS: Record<
  EmotionalTransformation,
  { energy: CampaignEnergy; density: CampaignDensity; humanity: CampaignHumanity }
> = {
  panic_to_relief: { energy: "urgent", density: "rich", humanity: "people_led" },
  fear_to_safety: { energy: "calm", density: "medium", humanity: "people_led" },
  uncertainty_to_confidence: { energy: "calm", density: "rich", humanity: "balanced" },
  confusion_to_clarity: { energy: "calm", density: "medium", humanity: "balanced" },
  frustration_to_control: { energy: "balanced", density: "medium", humanity: "product_led" },
  discouragement_to_possibility: { energy: "balanced", density: "medium", humanity: "people_led" },
  desire_to_aspiration: { energy: "calm", density: "minimal", humanity: "people_led" },
  concern_to_action: { energy: "balanced", density: "medium", humanity: "people_led" },
  interest_to_ownership: { energy: "balanced", density: "medium", humanity: "product_led" },
  stagnation_to_clarity: { energy: "calm", density: "rich", humanity: "balanced" },
};

/**
 * Deterministically infer the emotional transformation from signals the
 * system ALWAYS has — so art direction is GUARANTEED on every funnel and can
 * never silently no-op when the model omits the param. The model's explicit
 * emotional_transformation (now schema-required) always wins over this; this
 * is the floor, not the ceiling.
 */
export function inferEmotionalTransformation(s: {
  archetype?: string | null;
  objective?: string | null;
  awareness?: string | null;
  temperature?: string | null;
  ctaStyle?: string | null;
  priced?: boolean;
}): EmotionalTransformation {
  // Distinct-industry archetypes carry their buyer's emotional register.
  switch (s.archetype) {
    case "professional_enterprise":
      return "uncertainty_to_confidence";
    case "luxury_premium":
      return "desire_to_aspiration";
    case "nonprofit_mission":
      return "concern_to_action";
    case "wellness":
      return "fear_to_safety";
  }
  // High-intent direct-response lead/appointment pages (a phone CTA, a
  // most-aware reader, hot traffic) = the urgent "help right now" register.
  const highIntent = s.ctaStyle === "phone" || s.awareness === "most_aware" || s.temperature === "hot";
  const leadLike = !s.objective || s.objective === "lead_generation" || s.objective === "appointment" || s.objective === "consultation";
  if (highIntent && leadLike) return "panic_to_relief";
  if (s.objective === "free_trial") return "frustration_to_control";
  if (s.priced || s.objective === "purchase") return "interest_to_ownership";
  if (s.objective === "application" || s.objective === "consultation") return "stagnation_to_clarity";
  if (s.objective === "webinar_registration" || s.objective === "event_registration") return "discouragement_to_possibility";
  if (s.objective === "donation") return "concern_to_action";
  // Everything else: the balanced premium-DR treatment (visualized
  // transformation + strong close) — never the do-nothing baseline.
  return "frustration_to_control";
}

/** Derive the Campaign Art Direction Profile from model-supplied inputs.
 *  Precedence: explicit dimension override > transformation default >
 *  archetype fallback > neutral baseline (which applyArtDirection treats as
 *  "change nothing"). */
export function deriveArtDirection(inputs: ArtDirectionInputs): ArtDirectionProfile {
  const t = inputs.transformation ?? null;
  const defaults = t
    ? TRANSFORMATION_DEFAULTS[t]
    : ((inputs.archetype && ARCHETYPE_FALLBACK[inputs.archetype]) || {
        energy: "balanced" as const,
        density: "medium" as const,
        humanity: "balanced" as const,
      });
  return {
    transformation: t,
    energy: inputs.energy ?? defaults.energy,
    density: inputs.density ?? defaults.density,
    humanity: inputs.humanity ?? defaults.humanity,
  };
}

/** True when the profile is the do-nothing baseline (no transformation and no
 *  explicit dimension pushed off balanced/medium). */
export function isBaselineProfile(p: ArtDirectionProfile): boolean {
  return p.transformation === null && p.energy === "balanced" && p.humanity === "balanced" && p.density === "medium";
}

// ─── Sales Argument roles (every section must have a JOB) ──────────────────

/** Deterministic map: which persuasion job each section type performs. The
 *  final cta_banner is the CLOSE; a mid-page one is an ACTION beat. Stored on
 *  every section (FunnelSection.argumentRole) so "why does this section
 *  exist?" is answerable from data — the Sales Argument Engine's §4 rule. */
const SECTION_ARGUMENT_ROLES: Record<string, string> = {
  hero: "hook",
  problem_solution: "belief_shift",
  before_after: "belief_shift",
  comparison: "belief_shift",
  callout: "promise",
  benefits_grid: "promise",
  video: "mechanism",
  story: "mechanism",
  agenda: "mechanism",
  image_text: "mechanism",
  testimonials: "proof",
  proof_strip: "proof",
  trust_badges: "proof",
  stats: "proof",
  team: "proof",
  photo_gallery: "proof",
  included: "offer",
  value_stack: "offer",
  offer: "offer",
  ticket_tiers: "offer",
  checkout: "action",
  upsell_offer: "offer",
  guarantee: "risk_reversal",
  faq: "objections",
  countdown: "close",
  cta_banner: "action", // final banner upgraded to "close" below
};

/** Stamp every section with its argument role. Pure; returns new objects. */
export function stampArgumentRoles(sections: FunnelSection[]): FunnelSection[] {
  const lastCta = sections.reduce((last, s, i) => (s.type === "cta_banner" ? i : last), -1);
  return sections.map((s, i) => {
    const role = i === lastCta ? "close" : SECTION_ARGUMENT_ROLES[s.type];
    return role ? { ...s, argumentRole: role } : s;
  });
}

/** The Sales Argument Plan shape consumed here (structurally matches
 *  FunnelDoc.salesArgument). */
export interface SalesArgumentPlanLike {
  beliefChain: string[];
  corePromise: string;
  closeReason: string;
  /** The belief-shift material. Optional so every existing caller still
   *  type-checks; when present it is what fills an otherwise-blank
   *  problem/solution beat (see step 0 below). */
  currentBelief?: string;
  whyOldWayFails?: string;
  mechanism?: string;
  oldWay?: string;
}

/**
 * Make the stored Sales Argument Plan STRUCTURALLY CONSUMED (never a
 * decorative intelligence object):
 *
 * 1. Belief assignment — each belief-chain step is assigned to the section(s)
 *    responsible for establishing it (stored as `servesBelief`): the hook
 *    carries the arrival belief; belief_shift/promise/mechanism/proof carry
 *    the middle beliefs in page order; offer/close/action carry the final
 *    action belief; objections/risk_reversal defend the last middle belief.
 * 2. Offer ≠ benefits — offer bullets that verbatim duplicate benefit titles
 *    are removed (offer = what you get / what happens next; benefits = why
 *    the promise is believable). Skipped when benefits were themselves seeded
 *    from the bullets (the missing-content fallback), and the offer always
 *    keeps at least one bullet.
 * 3. The close closes — a closing banner with no subtext is seeded from
 *    corePromise + closeReason so the final section restates the outcome and
 *    the reason to act, never a bare "Ready?" box.
 *
 * Pure; returns new objects. Requires roles to be stamped first.
 */
/** Would this section actually RENDER content? Mirrors the section
 *  components' null-render rules — an empty/non-rendered section can never
 *  own a required belief (belief-assignment semantics rule). */
export function sectionHasRenderableContent(s: FunnelSection): boolean {
  if (s.type === "business_footer") {
    const c = s.config as unknown as Record<string, unknown>;
    return !!(c.businessName || c.email || c.phone || c.address);
  }
  const c = s.config as unknown as Record<string, unknown>;
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  switch (s.type) {
    case "benefits_grid":
    case "included":
    case "testimonials":
    case "stats":
    case "faq":
      return len(c.items) > 0;
    case "problem_solution":
      return !!(c.problemText || c.solutionText);
    case "story":
      return len(c.paragraphs) > 0;
    case "agenda":
      return len(c.days) > 0;
    case "callout":
      return !!c.text;
    case "before_after":
      return len(c.beforeItems) > 0 || len(c.afterItems) > 0;
    case "comparison":
      return len(c.rows) > 0 || len(c.items) > 0 || !!c.leftTitle || !!c.headline;
    case "proof_strip":
      return len(c.logos) > 0 || (c.variant !== undefined && c.variant !== "logos");
    case "photo_gallery":
      return len(c.images) > 0;
    default:
      return true; // hero / offer / cta_banner / guarantee etc. always render
  }
}

/**
 * FLOOR for a missing model plan: synthesize a minimal Sales Argument from
 * the model's OWN page copy (the headline is the hook claim; the bullets are
 * the claims the reader must come to accept; the CTA is the action). Grounded
 * entirely in copy the model already wrote — nothing invented. An explicit
 * model-written sales_argument always wins; this guarantees the argument
 * object (and servesBelief coverage) can never be absent.
 */
export function synthesizeSalesArgument(input: {
  headline: string;
  bullets: string[];
  ctaLabel?: string;
}): SalesArgumentPlanLike & { prospect: string; arrivalContext: string; currentBelief: string; oldWay: string; whyOldWayFails: string; mechanism: string; primaryObjection: string; riskReversal: string } {
  const chain = [input.headline, ...input.bullets.slice(0, 4)].filter(Boolean);
  chain.push(input.ctaLabel ? `Taking the next step (${input.ctaLabel}) is the natural conclusion` : "Taking the next step is the natural conclusion");
  return {
    prospect: "",
    arrivalContext: "",
    currentBelief: "",
    beliefChain: chain,
    oldWay: "",
    whyOldWayFails: "",
    mechanism: "",
    corePromise: input.headline,
    primaryObjection: "",
    riskReversal: "",
    closeReason: "",
  };
}

/** Middle beliefs are assigned by PERSUASION-ROLE PRIORITY (the reframe
 *  belongs to the belief shift, then mechanism, then proof, then promise) —
 *  never by mere page order, and never to a section that won't render. */
const CARRIER_ROLE_PRIORITY: Record<string, number> = {
  belief_shift: 0,
  mechanism: 1,
  proof: 2,
  promise: 3,
};

export function applySalesArgument(
  sections: FunnelSection[],
  plan: SalesArgumentPlanLike,
): FunnelSection[] {
  const chain = plan.beliefChain.filter((b) => b.trim().length > 0);
  if (chain.length < 2) return sections;

  // 0. THE BELIEF-SHIFT BEAT MUST CARRY THE ARGUMENT'S OWN WORDS.
  //
  // The framework seeds a problem/solution section because the argument needs
  // that beat, but nothing downstream ever wrote its copy — so it reached the
  // page as an empty shell, was skipped by the belief assignment below (it has
  // no renderable content), and is now correctly OMITTED by shell safety. The
  // result was a page missing a persuasion step its own plan says it requires.
  //
  // This is NOT fabrication: currentBelief / whyOldWayFails / mechanism are
  // the model's own plan, already written and already stored. Rendering them
  // into the section that exists to express them is the reconnection — the
  // alternative was inventing copy, which is never acceptable, or dropping a
  // required beat, which is what was happening.
  //
  // Only ever fills a BLANK section: any real authored copy always wins.
  sections = sections.map((s) => {
    if (s.type !== "problem_solution" || sectionHasRenderableContent(s)) return s;
    const c = s.config as ProblemSolutionConfig;
    const problemText = plan.currentBelief?.trim() || plan.whyOldWayFails?.trim() || "";
    const solutionText = plan.mechanism?.trim() || plan.corePromise?.trim() || "";
    if (!problemText || !solutionText) return s; // nothing honest to say — stays omittable
    return {
      ...s,
      config: {
        ...c,
        problemHeadline: c.problemHeadline || (plan.oldWay?.trim() ? `The usual way: ${plan.oldWay.trim()}` : "The problem"),
        problemText,
        solutionHeadline: c.solutionHeadline || "How this works instead",
        solutionText,
      },
    };
  });

  // 0b. THE OFFER MUST BE HEADED. The framework seeds the offer with an empty
  // headline for the model to fill; when it doesn't, the section renders its
  // bullets and CTA under nothing, which reads as a layout bug rather than an
  // offer. corePromise is exactly the sentence that belongs there — again the
  // model's own words, not invented copy. Only ever fills a BLANK headline.
  sections = sections.map((s) => {
    if (s.type !== "offer" && s.type !== "checkout") return s;
    const c = s.config as { headline?: string };
    if (c.headline?.trim()) return s;
    const promise = plan.corePromise?.trim();
    if (!promise) return s;
    // A hard character slice cuts mid-word and reads as a rendering bug. Take
    // the first sentence/clause when there is one, then fall back to trimming
    // at a word boundary — never mid-word.
    const firstClause = promise.split(/(?<=[.!?])\s+/)[0].trim();
    const base = firstClause.length >= 20 && firstClause.length <= 80 ? firstClause : promise;
    let headline = base.replace(/[.,;:]\s*$/, "");
    if (headline.length > 80) {
      headline = headline.slice(0, 80);
      const lastSpace = headline.lastIndexOf(" ");
      if (lastSpace > 40) headline = headline.slice(0, lastSpace);
      headline = headline.replace(/[\s,;:]+$/, "");
    }
    return { ...s, config: { ...s.config, headline } };
  });

  const first = chain[0];
  const last = chain[chain.length - 1];
  const middle = chain.slice(1, -1);

  // Benefits titles for the dedupe guard (and whether they came from bullets).
  const benefits = sections.find((s) => s.type === "benefits_grid");
  const benefitTitles = new Set(
    ((benefits?.config as BenefitsGridConfig | undefined)?.items ?? []).map((it) => it.title.trim().toLowerCase()),
  );

  // Role-priority belief assignment across CONTENT-BEARING carriers only.
  const carrierIdxs = sections
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => s.argumentRole !== undefined && s.argumentRole in CARRIER_ROLE_PRIORITY && sectionHasRenderableContent(s));
  carrierIdxs.sort(
    (a, b) =>
      CARRIER_ROLE_PRIORITY[a.s.argumentRole!] - CARRIER_ROLE_PRIORITY[b.s.argumentRole!] || a.idx - b.idx,
  );
  const beliefByIdx = new Map<number, string>();
  carrierIdxs.forEach(({ idx }, i) => {
    if (middle.length === 0) { beliefByIdx.set(idx, first); return; }
    const isLast = i === carrierIdxs.length - 1;
    // The last carrier ABSORBS any remaining middle beliefs (a benefits
    // section with 3 items can legitimately establish 2 beliefs) so every
    // required belief always has a responsible rendered section.
    beliefByIdx.set(
      idx,
      isLast && middle.length > carrierIdxs.length
        ? middle.slice(i).join(" + ")
        : middle[Math.min(i, middle.length - 1)],
    );
  });

  return sections.map((s, idx) => {
    let next = s;
    const role = s.argumentRole;
    const renders = sectionHasRenderableContent(s);

    // 1. Belief assignment (only sections that will actually render).
    if (role === "hook" && renders) next = { ...next, servesBelief: first };
    else if (beliefByIdx.has(idx)) next = { ...next, servesBelief: beliefByIdx.get(idx)! };
    else if ((role === "offer" || role === "action" || role === "close") && renders) {
      next = { ...next, servesBelief: last };
    } else if ((role === "objections" || role === "risk_reversal") && renders) {
      next = { ...next, servesBelief: middle[middle.length - 1] ?? last };
    }

    // 2. Offer must not duplicate benefits.
    if (s.type === "offer" && benefitTitles.size > 0) {
      const cfg = next.config as { bullets?: string[] };
      const bullets = cfg.bullets ?? [];
      const allDuplicated = bullets.length > 0 && bullets.every((b) => benefitTitles.has(b.trim().toLowerCase()));
      // allDuplicated = the benefits were seeded FROM these bullets (fallback)
      // — dedup would empty the offer, so leave it alone.
      if (!allDuplicated) {
        const deduped = bullets.filter((b) => !benefitTitles.has(b.trim().toLowerCase()));
        if (deduped.length >= 1 && deduped.length !== bullets.length) {
          next = { ...next, config: { ...next.config, bullets: deduped } };
        }
      }
    }

    // 3. The close restates the promise + reason to act.
    if (role === "close" && s.type === "cta_banner") {
      const cfg = next.config as CtaBannerConfig;
      if (!cfg.subtext && (plan.corePromise || plan.closeReason)) {
        const subtext = [plan.corePromise, plan.closeReason].filter(Boolean).join(" — ").slice(0, 180);
        next = { ...next, config: { ...cfg, subtext } };
      }
    }

    return next;
  });
}

/**
 * THE STORY-FOLD LAW (user core principle): every section is a story beat, and
 * adjacent beats must be CLEARLY DIFFERENTIATED — no two neighboring rendered
 * sections may share the same surface. This post-pass assigns an explicit
 * canvas to every rendered section that the register mapping left unassigned,
 * cycling register-appropriate surfaces (calm/soft registers never receive a
 * dark or high-contrast surface from the alternator; explicit register
 * decisions like the urgent dark band are always preserved). Self-painting
 * sections (the hero's own gradient, the full-bleed close) count as their own
 * distinct surfaces. Null-rendered sections are skipped entirely so they never
 * break the alternation chain.
 */
export function enforceFoldDifferentiation(
  sections: FunnelSection[],
  profile: ArtDirectionProfile,
): FunnelSection[] {
  const soft: SectionCanvas[] = ["warm_paper", "clean", "brand_tint"];
  let prev: string | null = null; // previous rendered beat's surface signature
  return sections.map((s) => {
    if (!sectionHasRenderableContent(s)) return s;
    // Self-painting beats: distinct by construction.
    if (s.type === "hero") { prev = "hero:self"; return s; }
    if ((s.config as { variant?: string }).variant === "full_bleed_close") { prev = "accent:self"; return s; }
    if (s.canvas) { prev = s.canvas; return s; } // explicit register decision wins
    // Assign the first soft surface that differs from the previous beat.
    const next = soft.find((c) => c !== prev) ?? "clean";
    prev = next;
    return { ...s, canvas: next };
  });
}

// ─── Profile → composition mapping ─────────────────────────────────────────

/**
 * Apply the profile to a composed section list: assign per-section layout
 * variants and canvases so structurally different campaigns come out of the
 * same section library. Returns NEW section objects (never mutates input).
 *
 * Baseline profile → sections returned as-is (identity), so funnels built
 * without art-direction inputs are pixel-identical to today.
 */
export function applyArtDirection(
  sections: FunnelSection[],
  profile: ArtDirectionProfile,
): FunnelSection[] {
  if (isBaselineProfile(profile)) return sections;

  const lastCtaBannerIndex = sections.reduce(
    (last, s, i) => (s.type === "cta_banner" ? i : last),
    -1,
  );

  return sections.map((section, i) => {
    // URGENT (panic→relief): high contrast, visualized transformation, a dark
    // immersive band mid-page, a full-bleed close. "Help is available NOW."
    if (profile.energy === "urgent") {
      switch (section.type) {
        case "hero": {
          // An urgent page never spends its prime viewport on an EMPTY media
          // placeholder — with no real asset, the hero drops media entirely so
          // the eye lands on the headline + CTA (asset-fallback rule: compose
          // without the asset, don't design around it). A real PHOTO upgrades
          // to the immersive full-bleed environmental hero (image + overlay —
          // heat/urgency you can feel); a real video stays the centered VSL.
          const cfg = section.config as HeroConfig;
          if (cfg.mediaUrl && cfg.mediaType === "image") {
            return { ...section, config: { ...cfg, layout: "background_image" as const } };
          }
          if (!cfg.mediaUrl && cfg.mediaType !== "none") {
            return { ...section, config: { ...cfg, mediaType: "none" as const, mediaPlaceholderLabel: "" } };
          }
          return section;
        }
        case "problem_solution":
          return {
            ...section,
            canvas: "clean" as SectionCanvas,
            config: { ...(section.config as ProblemSolutionConfig), variant: "before_after" as const },
          };
        case "benefits_grid":
          return {
            ...section,
            canvas: "dark_immersive" as SectionCanvas,
            config: { ...(section.config as BenefitsGridConfig), variant: "flowing_checklist" as const },
          };
        case "cta_banner":
          return i === lastCtaBannerIndex
            ? {
                ...section,
                canvas: "clean" as SectionCanvas, // full_bleed_close paints its own bg
                config: { ...(section.config as CtaBannerConfig), variant: "full_bleed_close" as const },
              }
            : { ...section, canvas: "brand_tint" as SectionCanvas };
        case "offer":
        case "ticket_tiers":
        case "stats":
          return { ...section, canvas: "brand_tint" as SectionCanvas };
        default:
          return section;
      }
    }

    // CALM + PEOPLE-LED (fear→safety, desire→aspiration): warm, human,
    // image-led, soft transitions, NO dark bands, editorial close.
    if (profile.energy === "calm" && profile.humanity === "people_led") {
      switch (section.type) {
        case "benefits_grid": {
          // Alternating rows only when the items are RICH enough to earn the
          // layout (a description or a real image per item) — a list of bare
          // titles reads sparse/unbalanced as a zigzag and stays a checklist.
          const cfg = section.config as BenefitsGridConfig;
          const rich = (cfg.items ?? []).some((it) => it.description || it.imageUrl);
          return {
            ...section,
            canvas: "warm_paper" as SectionCanvas,
            config: { ...cfg, variant: rich ? ("alternating_image" as const) : ("flowing_checklist" as const) },
          };
        }
        case "problem_solution":
          return {
            ...section,
            canvas: "brand_tint" as SectionCanvas,
            config: { ...(section.config as ProblemSolutionConfig), variant: "stacked" as const },
          };
        case "story":
        case "testimonials":
          return { ...section, canvas: "warm_paper" as SectionCanvas };
        case "cta_banner":
          return {
            ...section,
            canvas: "brand_tint" as SectionCanvas,
            config: { ...(section.config as CtaBannerConfig), variant: "banner" as const },
          };
        default:
          return section;
      }
    }

    // CALM + rational (uncertainty→confidence, confusion→clarity,
    // stagnation→clarity): composed authority — gentle tint rhythm, the
    // transformation visualized once, contained close. No urgency devices.
    if (profile.energy === "calm") {
      switch (section.type) {
        case "problem_solution":
          return {
            ...section,
            canvas: "clean" as SectionCanvas,
            config: { ...(section.config as ProblemSolutionConfig), variant: "before_after" as const },
          };
        case "benefits_grid":
          return { ...section, canvas: "warm_paper" as SectionCanvas };
        case "cta_banner":
          return { ...section, canvas: "brand_tint" as SectionCanvas };
        default:
          return section;
      }
    }

    // BALANCED with a real transformation (control/possibility/ownership/
    // action): moderate contrast — visualized before/after + a strong close,
    // without the urgent dark band.
    switch (section.type) {
      case "problem_solution":
        return {
          ...section,
          config: { ...(section.config as ProblemSolutionConfig), variant: "before_after" as const },
        };
      case "cta_banner":
        return i === lastCtaBannerIndex
          ? {
              ...section,
              canvas: "clean" as SectionCanvas,
              config: { ...(section.config as CtaBannerConfig), variant: "full_bleed_close" as const },
            }
          : section;
      case "offer":
      case "ticket_tiers":
        return { ...section, canvas: "brand_tint" as SectionCanvas };
      default:
        return section;
    }
  });
}
