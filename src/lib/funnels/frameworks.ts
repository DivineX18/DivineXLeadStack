import type {
  FunnelGenre,
  FunnelSection,
  FunnelSectionConfig,
  FunnelSectionType,
} from "@/types/funnels";

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
    { id: "offer", label: "Offer", section: "offer", isCapture: true },
    { id: "faq", label: "FAQ", section: "faq" },
    { id: "cta", label: "CTA", section: "cta_banner" },
  ],
  webinar: [
    { id: "attention", label: "Hero", section: "hero" },
    { id: "agenda", label: "Agenda", section: "agenda" },
    { id: "benefits", label: "Benefits", section: "benefits_grid" },
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
    { id: "offer", label: "Offer", section: "offer" },
    { id: "guarantee", label: "Guarantee", section: "guarantee" },
    { id: "faq", label: "FAQ", section: "faq" },
  ],
  lead_gen: [
    { id: "attention", label: "Hero", section: "hero" },
    { id: "trust_logos", label: "Trust Logos", section: "proof_strip" },
    { id: "benefits", label: "Benefits", section: "benefits_grid" },
    { id: "offer", label: "Offer", section: "offer", isCapture: true },
    { id: "faq", label: "FAQ", section: "faq" },
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
export function buildFrameworkSections(
  genre: FunnelGenre,
  sectionOverrides?: Record<string, FunnelSectionType>,
): FunnelSection[] {
  const framework = FUNNEL_FRAMEWORKS[genre];
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
