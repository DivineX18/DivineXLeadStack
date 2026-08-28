import type {
  FunnelGenre,
  FunnelSection,
  FunnelSectionConfig,
  FunnelSectionType,
} from "@/types/funnels";
import type { AwarenessLevel, TrafficTemperature } from "@/types/conversion";

/**
 * Conversion-framework definitions — the "Landing Page Generator RC".
 *
 * Every funnel follows the same underlying persuasion sequence (Attention →
 * Problem → Solution → Benefits → Process → Offer → Trust → FAQ → CTA); each
 * genre maps that sequence onto its own recommended layout choices, and each
 * stage may allow a small set of alternate layouts Zeno can substitute when
 * it fits the specific business better (e.g. "Results" as Before/After vs.
 * real Testimonials, depending on what evidence the operator actually gave).
 *
 * Shared between the funnel-seeding path (funnels-service.ts, used when an
 * operator picks a genre by hand) and the AI Suite's create_funnel
 * capability (which lets the model override individual stages within their
 * allowed alternates) — one source of truth for "what does this genre look
 * like by default."
 */

export interface FrameworkStage {
  /** Stable slot id, e.g. "problem" — stays constant across genres so the
   *  AI Suite can address a stage by name regardless of which genre it's
   *  building. */
  id: string;
  /** Human label for the builder / AI tool description. */
  label: string;
  /** Default/recommended layout for this stage. */
  section: FunnelSectionType;
  /** Other layouts Zeno may substitute for this stage when it fits the
   *  business better. Absent/empty = this stage's layout is fixed. */
  alternates?: FunnelSectionType[];
  /** This stage's section is where the lead-capture form gets wired in
   *  (offer's formId, or ticket_tiers' tiers[0].formId — handled per-type
   *  by the caller, this flag just marks WHICH stage). */
  isCapture?: boolean;
}

export const FUNNEL_FRAMEWORKS: Record<FunnelGenre, FrameworkStage[]> = {
  // One-fold by design (RC 1.1 length pass, 2026-08-02): a free lead magnet
  // is a low-commitment ask — the visitor either wants the free thing or
  // doesn't, and nothing below the fold changes that decision the way it
  // does for a paid offer. The single hero stage IS the whole page: it
  // carries the value prop, the bullets a scrollable "What You'll Learn"
  // section would otherwise hold, and the capture form itself (via
  // HeroConfig.formId, rendered as a popup by default — see cta_style's
  // "popup_form" default in capabilities.ts). No scroll required to convert.
  lead_magnet: [{ id: "attention", label: "Hero", section: "hero", isCapture: true }],
  vsl: [
    { id: "attention", label: "Hero", section: "hero" },
    { id: "video", label: "Video", section: "video" },
    {
      id: "problem_solution",
      label: "Problem / Solution",
      section: "problem_solution",
      alternates: ["before_after"],
    },
    { id: "value_stack", label: "Value Stack", section: "value_stack" },
    { id: "offer", label: "Offer", section: "offer", isCapture: true },
    { id: "faq", label: "FAQ", section: "faq" },
    { id: "cta", label: "CTA", section: "cta_banner" },
  ],
  webinar: [
    { id: "attention", label: "Hero", section: "hero" },
    // Sales Argument Engine: the BELIEF SHIFT — agitate the old belief /
    // conventional experience, then reframe (why this session is different).
    // Lean (high-intent) depth drops it automatically: most-aware visitors
    // don't need belief education.
    { id: "belief_shift", label: "Belief Shift", section: "problem_solution" },
    { id: "agenda", label: "Agenda", section: "agenda" },
    { id: "benefits", label: "Benefits", section: "benefits_grid" },
    { id: "cta", label: "CTA", section: "cta_banner" },
    { id: "host", label: "Host", section: "story" },
    { id: "faq", label: "FAQ", section: "faq" },
    { id: "register", label: "Register", section: "offer", isCapture: true },
  ],
  application: [
    { id: "attention", label: "Hero", section: "hero" },
    { id: "who_for", label: "Who It's For", section: "benefits_grid" },
    // Distinct section type from "who_for" on purpose — stage_content
    // matches by resolved type, so two stages can never share one
    // (see the uniqueness check in verify-funnel-frameworks.mts).
    { id: "who_not_for", label: "Who This Isn't For", section: "included" },
    { id: "cta", label: "CTA", section: "cta_banner" },
    { id: "process", label: "Process", section: "agenda" },
    {
      id: "results",
      label: "Results",
      section: "before_after",
      alternates: ["testimonials"],
    },
    { id: "application", label: "Application", section: "offer", isCapture: true },
  ],
  challenge: [
    { id: "attention", label: "Hero", section: "hero" },
    {
      id: "problem",
      label: "Problem",
      section: "problem_solution",
      alternates: ["before_after"],
    },
    { id: "benefits", label: "What You'll Get", section: "benefits_grid" },
    { id: "schedule", label: "Challenge Schedule", section: "agenda" },
    { id: "register", label: "Register", section: "ticket_tiers", isCapture: true },
    { id: "faq", label: "FAQ", section: "faq" },
    { id: "cta", label: "CTA", section: "cta_banner" },
  ],
  // Enriched to the "Sales Page" sequence (RC 1.1): Problem/Opportunity/
  // Solution collapse into problem_solution + a callout ("the opportunity"
  // — why now) rather than 3 separate sections, since problem_solution
  // already covers Problem+Solution in one honest, non-fragmented section.
  // Trust Rules: the social-proof stage defaults to trust_badges (always
  // safe/generic) and only becomes real testimonials when the operator
  // gave real quotes — never a testimonials section left silently empty.
  tripwire: [
    { id: "attention", label: "Hero", section: "hero" },
    {
      id: "problem",
      label: "Problem / Solution",
      section: "problem_solution",
      alternates: ["before_after"],
    },
    { id: "opportunity", label: "Opportunity", section: "callout" },
    { id: "features", label: "Features", section: "benefits_grid" },
    {
      id: "trust",
      label: "Trust / Testimonials",
      section: "trust_badges",
      alternates: ["testimonials"],
    },
    { id: "value_stack", label: "Value Stack", section: "value_stack" },
    { id: "offer", label: "Offer", section: "offer" },
    { id: "guarantee", label: "Guarantee", section: "guarantee" },
    { id: "faq", label: "FAQ", section: "faq" },
    { id: "cta", label: "CTA", section: "cta_banner" },
  ],
  lead_gen: [
    { id: "attention", label: "Hero", section: "hero" },
    { id: "trust_logos", label: "Trust Logos", section: "proof_strip" },
    // Sales Argument Engine: the BELIEF SHIFT — the "old way → why it
    // fails → reframe" move that gives the benefits a reason to exist
    // (hero jumping straight to benefits is a website, not an argument).
    // Lean (high-intent) depth drops it automatically.
    { id: "belief_shift", label: "Belief Shift", section: "problem_solution" },
    { id: "benefits", label: "Benefits", section: "benefits_grid" },
    { id: "offer", label: "Offer", section: "offer", isCapture: true },
    { id: "faq", label: "FAQ", section: "faq" },
    { id: "cta", label: "CTA", section: "cta_banner" },
  ],
};

/** Every layout a stage may resolve to across every genre — used to build
 *  the AI Suite tool schema's per-stage enum so the model can't propose a
 *  layout that isn't actually offered for that stage. */
export function stageAllowedLayouts(stage: FrameworkStage): FunnelSectionType[] {
  return [stage.section, ...(stage.alternates ?? [])];
}

/** Server-safe default config for a freshly-added section of the given
 *  type — mirrors (but is independent of) the client builder's
 *  SECTION_DEFAULTS, matching this codebase's existing convention where
 *  funnels-service.ts's genre seeds hand-write their own defaults rather
 *  than importing the "use client" builder module. */
export function defaultSectionConfig(type: FunnelSectionType): FunnelSectionConfig {
  switch (type) {
    case "hero":
      return { headline: "Write your headline here", subheadline: "", mediaType: "none" };
    case "business_footer":
      return { businessName: "" };
    case "proof_strip":
      return { variant: "logos", logos: [] };
    case "offer":
      return {
        headline: "",
        priceCents: null,
        strikethroughPriceCents: null,
        bullets: [],
        formId: null,
        ctaLabel: "Get started",
      };
    case "story":
      return { byline: "Why this works", paragraphs: [] };
    case "faq":
      return { items: [] };
    case "cta_banner":
      return { headline: "Ready?", ctaLabel: "Get started", ctaHref: "" };
    case "countdown":
      return { endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString() };
    case "agenda":
      return { days: [] };
    case "ticket_tiers":
      return { tiers: [] };
    case "guarantee":
      return { headline: "", bodyText: "", badgeIcon: "shield" };
    case "trust_badges":
      return { badges: [] };
    case "checkout":
      return { priceCents: 0, bullets: [], ctaLabel: "Buy now", checkoutMode: "external_link" };
    case "upsell_offer":
      return {
        headline: "Wait — add this to your order?",
        bullets: [],
        priceCents: 0,
        acceptLabel: "Yes, add it!",
        declineLabel: "No thanks",
      };
    case "video":
      return { embedUrl: "" };
    case "benefits_grid":
      return { items: [] };
    case "problem_solution":
      return { problemHeadline: "", problemText: "", solutionHeadline: "", solutionText: "" };
    case "before_after":
      return { beforeItems: [], afterItems: [] };
    case "included":
      return { items: [] };
    case "value_stack":
      return { items: [] };
    case "comparison":
      return { usLabel: "Us", themLabel: "Doing it yourself", rows: [] };
    case "testimonials":
      return { items: [] };
    case "stats":
      return { items: [] };
    case "callout":
      return { text: "" };
    case "team":
      return { members: [] };
    case "image_text":
      return { blocks: [] };
    case "photo_gallery":
      return { images: [], layout: "grid" };
  }
}

/**
 * Build a fresh section list for a genre, resolving each stage to either
 * its default layout or a caller-chosen alternate (validated against that
 * stage's `alternates`). `sectionOverrides` keys are a stage's DEFAULT
 * section type (e.g. "guarantee" -> the tripwire genre's Guarantee stage),
 * not an opaque stage id — every genre's framework uses a distinct default
 * type per stage (verified — no genre repeats a default type across
 * stages), so the type itself is an unambiguous, and far more
 * model-friendly, way to address "which stage." An earlier version keyed
 * this by stage id and the model reliably failed to invent matching ids for
 * stage_content, leaving every new-layout section blank — real live-model
 * testing caught this (2026-08-02).
 */
/** Adaptive funnel DEPTH (Conversion Engine P0 + Sales Argument Engine).
 *  "lean" strips the persuasion runway a high-intent visitor doesn't need;
 *  "standard" keeps the genre's full sequence; "deep" ALTERS the persuasion
 *  architecture for high-commitment/high-risk/complex decisions — adding
 *  old-way/new-way and mechanism/authority stages, not just longer copy. */
export type FunnelDepth = "lean" | "standard" | "deep";

/**
 * Multi-factor persuasion-depth classifier. NEVER price alone: depth emerges
 * from commitment (objective), coldness (awareness/temperature), belief-work
 * complexity (chain length), trust requirement (archetype), with price as one
 * contributing stake among several. High intent always wins: a most-aware/hot
 * visitor gets lean regardless of everything else.
 */
export function computePersuasionDepth(s: {
  awareness?: string | null;
  temperature?: string | null;
  objective?: string | null;
  priceCents?: number | null;
  beliefChainLength?: number | null;
  archetype?: string | null;
}): FunnelDepth {
  if (s.awareness === "most_aware" || s.temperature === "hot") return "lean";
  let score = 0;
  // High-commitment decision (apply/consult = a relationship, not a click).
  if (s.objective === "application" || s.objective === "consultation") score += 2;
  // Stakes: a $1,000+ ask raises perceived risk (contributes, never decides).
  if ((s.priceCents ?? 0) >= 100_000) score += 1;
  // Cold/early-awareness traffic needs real belief work.
  if (s.awareness === "unaware" || s.awareness === "problem_aware" || s.temperature === "cold") score += 1;
  // A long belief chain = a complex buying decision.
  if ((s.beliefChainLength ?? 0) >= 5) score += 1;
  // Trust-heavy categories (professional/enterprise/luxury) carry more risk.
  if (s.archetype === "professional_enterprise" || s.archetype === "luxury_premium") score += 1;
  return score >= 3 ? "deep" : "standard";
}

/**
 * DECISION COMPLEXITY — the SECOND reasoning dimension, orthogonal to
 * persuasion depth. Depth answers "how much BELIEF CHANGE is required?";
 * complexity answers "how much information, proof, risk reduction, and buying
 * SUPPORT does the decision require?" A most-aware enterprise buyer may need
 * almost no persuasion (lean) yet substantial decision support (enterprise).
 */
export type DecisionComplexity = "low" | "moderate" | "high" | "enterprise";

/** Deterministic FLOOR for decision complexity (the model's explicit
 *  decision_complexity always wins — it knows stakeholders/implementation/
 *  procurement context this fallback can't see). Derived from commitment,
 *  stakes, and trust-heavy category signals — coarse but always safe. */
export function computeDecisionComplexity(s: {
  objective?: string | null;
  priceCents?: number | null;
  archetype?: string | null;
}): DecisionComplexity {
  const price = s.priceCents ?? 0;
  if (price >= 2_500_000) return "enterprise"; // $25k+ engagements
  if (price >= 200_000 || s.objective === "application" || s.objective === "consultation") return "high";
  if (price > 0 || s.objective === "appointment" || s.archetype === "professional_enterprise") return "moderate";
  return "low";
}

/** Decision-SUPPORT stages injected for high/enterprise complexity —
 *  genre-agnostic (no per-industry hardcoding), skipped where the section
 *  type already exists, inserted before the FAQ (support informs, FAQ cleans
 *  up). Applied at EVERY persuasion depth including lean: low persuasion +
 *  heavy decision support is a real buying situation. All are fillable via
 *  existing params (stage_content included/comparison, process_steps). */
const DECISION_SUPPORT_STAGES: { minComplexity: "high" | "enterprise"; stage: FrameworkStage }[] = [
  { minComplexity: "high", stage: { id: "offer_detail", label: "What's Included", section: "included" } },
  { minComplexity: "high", stage: { id: "process_rollout", label: "Process / Rollout", section: "agenda" } },
  { minComplexity: "enterprise", stage: { id: "evaluation", label: "Comparison / Evaluation", section: "comparison" } },
];

/** Stages DEEP adds per genre — old-way/new-way (comparison) + mechanism/
 *  authority (story) where the genre lacks them. Architecture change, not
 *  copy inflation; skipped where the section type already exists, and the
 *  one-fold lead_magnet is never deepened. */
const DEEP_EXTRA: Partial<Record<FunnelGenre, { afterId: string; stage: FrameworkStage }[]>> = {
  lead_gen: [
    { afterId: "belief_shift", stage: { id: "old_way_new_way", label: "Old Way / New Way", section: "comparison" } },
    { afterId: "benefits", stage: { id: "mechanism_story", label: "Why This Works", section: "story" } },
  ],
  webinar: [
    { afterId: "belief_shift", stage: { id: "old_way_new_way", label: "Old Way / New Way", section: "comparison" } },
  ],
  application: [
    { afterId: "process", stage: { id: "old_way_new_way", label: "Old Way / New Way", section: "comparison" } },
    { afterId: "who_not_for", stage: { id: "mechanism_story", label: "Why This Works", section: "story" } },
  ],
  vsl: [
    { afterId: "problem_solution", stage: { id: "mechanism_story", label: "Why This Works", section: "story" } },
  ],
  tripwire: [
    { afterId: "problem", stage: { id: "mechanism_story", label: "Why This Works", section: "story" } },
  ],
  challenge: [
    { afterId: "problem", stage: { id: "mechanism_story", label: "Why This Works", section: "story" } },
  ],
};

/** Sections a LEAN (high-intent) page keeps — hero, quick proof, the core
 *  offer/benefits, FAQ, and a CTA. Everything else is education/persuasion a
 *  most-aware reader or hot-traffic click doesn't need to reach the CTA. The
 *  capture stage (isCapture) is always kept regardless — a page must convert. */
const LEAN_KEEP: ReadonlySet<FunnelSectionType> = new Set<FunnelSectionType>([
  "hero",
  "proof_strip",
  "trust_badges",
  "benefits_grid",
  "offer",
  "ticket_tiers",
  "faq",
  "cta_banner",
]);

/**
 * Decide funnel depth from buyer state. A most-aware reader or hot traffic
 * gets a LEAN page that reaches the CTA fast; everyone else keeps the full
 * persuasion sequence. Priced sales genres are never leaned by the caller
 * (asking for a card number always earns the full page) — this only reports
 * what the buyer state suggests; the caller gates on priced.
 */
export function funnelDepthForBuyer(
  awareness?: AwarenessLevel | null,
  temperature?: TrafficTemperature | null,
): FunnelDepth {
  if (awareness === "most_aware" || temperature === "hot") return "lean";
  return "standard";
}

export function buildFrameworkSections(
  genre: FunnelGenre,
  sectionOverrides?: Record<string, FunnelSectionType>,
  depth: FunnelDepth = "standard",
  complexity: DecisionComplexity = "low",
): FunnelSection[] {
  // Lean pages drop education/persuasion stages a high-intent visitor doesn't
  // need — but always keep the capture stage (so the page still converts) and
  // the core LEAN_KEEP stages. Standard keeps the genre's full sequence.
  // Deep INSERTS the genre's DEEP_EXTRA stages (old-way/new-way, mechanism)
  // where their section type isn't already present.
  let framework = FUNNEL_FRAMEWORKS[genre].filter(
    (stage) => depth === "lean" ? stage.isCapture || LEAN_KEEP.has(stage.section) : true,
  );
  if (depth === "deep") {
    const present = new Set(framework.map((s) => s.section));
    for (const extra of DEEP_EXTRA[genre] ?? []) {
      if (present.has(extra.stage.section)) continue;
      const at = framework.findIndex((s) => s.id === extra.afterId);
      framework = at === -1
        ? [...framework, extra.stage]
        : [...framework.slice(0, at + 1), extra.stage, ...framework.slice(at + 1)];
      present.add(extra.stage.section);
    }
  }
  // Decision-support injection (orthogonal to depth; never for the one-fold
  // lead_magnet). Inserted before the FAQ, else before the closing banner.
  if ((complexity === "high" || complexity === "enterprise") && genre !== "lead_magnet") {
    const present = new Set(framework.map((s) => s.section));
    for (const { minComplexity, stage } of DECISION_SUPPORT_STAGES) {
      if (minComplexity === "enterprise" && complexity !== "enterprise") continue;
      if (present.has(stage.section)) continue;
      let at = framework.findIndex((s) => s.section === "faq");
      if (at === -1) at = framework.map((s) => s.section).lastIndexOf("cta_banner");
      framework = at === -1
        ? [...framework, stage]
        : [...framework.slice(0, at), stage, ...framework.slice(at)];
      present.add(stage.section);
    }
  }
  return framework.map((stage, i) => {
    const requested = sectionOverrides?.[stage.section];
    const allowed = stageAllowedLayouts(stage);
    const resolved = requested && allowed.includes(requested) ? requested : stage.section;
    return {
      id: `s${i + 1}`,
      type: resolved,
      config: defaultSectionConfig(resolved),
    };
  });
}
