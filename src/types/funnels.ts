import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * First-party funnel pages — ClickFunnels/GHL-style single-page funnels,
 * rendered directly by this app (no gitpage.site involvement, so no
 * fabricated-content risk: nothing renders unless an operator or Zeno
 * actually wrote it). Genre only determines what the builder pre-seeds;
 * the public renderer just maps over whatever `sections` exist.
 */

export type FunnelGenre =
  | "lead_magnet"
  | "vsl"
  | "challenge"
  | "application"
  | "tripwire"
  | "webinar"
  | "lead_gen";
export type FunnelStatus = "draft" | "published";

export type FunnelSectionType =
  | "hero"
  | "proof_strip"
  | "offer"
  | "story"
  | "faq"
  | "cta_banner"
  | "countdown"
  | "agenda"
  | "ticket_tiers"
  | "guarantee"
  | "trust_badges"
  | "checkout"
  | "upsell_offer"
  | "video"
  | "benefits_grid"
  | "problem_solution"
  | "before_after"
  | "included"
  | "value_stack"
  | "comparison"
  | "testimonials"
  | "stats"
  | "callout"
  | "team"
  | "image_text"
  | "photo_gallery";

/**
 * Shared CTA-experience config, embedded (optional) on any section that
 * carries a primary call-to-action (hero, offer, cta_banner). Additive —
 * every field is optional and absent = today's plain inline behavior, so
 * every already-published funnel keeps rendering exactly as before.
 */
export interface CtaExtras {
  style?: "inline" | "popup_form" | "popup_calendar" | "dual" | "sticky_desktop" | "floating_mobile" | "phone";
  /** "dual" style's secondary button. */
  secondaryLabel?: string;
  secondaryHref?: string;
  /** "popup_calendar" style — opens this sub-account's booking page in the
   *  modal. Slug only (not a full URL) — the renderer builds
   *  /b/[subAccountId]/[slug] itself so this stays portable across a
   *  custom-domain deploy without the AI/operator needing to know the URL
   *  shape. */
  bookingPageSlug?: string;
  /** "phone" style — tel: link, e.g. "+15551234567". Degrades to plain
   *  inline (no dead tel: link) when absent. */
  phoneNumber?: string;
  /** Phase 3 — popup presentation layout, only meaningful for
   *  "popup_form". "centered" (default/omitted) is today's plain
   *  form-in-a-card. "split_image" needs popupImageUrl; "split_benefits"
   *  needs popupBenefits — both degrade to "centered" when their
   *  prerequisite is missing. */
  popupLayout?: "centered" | "split_image" | "split_benefits";
  /** Small headline shown above the form inside the popup (any layout).
   *  Optional — omit for a plain form with no extra framing. */
  popupHeadline?: string;
  /** Real image URL for the "split_image" popup layout — never a
   *  fabricated/stock image; the operator's own photo. */
  popupImageUrl?: string;
  /** 2-4 short benefit lines shown beside the form for the
   *  "split_benefits" popup layout. */
  popupBenefits?: string[];
}

export interface HeroConfig {
  eyebrow?: string;
  headline: string;
  subheadline?: string;
  mediaType: "video" | "image" | "none";
  mediaUrl?: string;
  /** True when mediaUrl was auto-filled with SUBJECT stock photography
   *  (Pexels) at generation time — the builder labels it "stock — replace
   *  with your real photo" so operators know to personalize. Cleared when
   *  the operator sets their own media. */
  mediaIsStock?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
  /** Lets the hero itself BE the capture surface — a real one-fold page
   *  (lead_magnet's default framework) needs no separate scrollable Offer
   *  section; the hero's CTA button opens the capture form directly (via
   *  cta.style "popup_form", the recommended default). Null/absent =
   *  today's plain link-button hero. */
  formId?: string | null;
  /** Short outcome phrases shown under the subheadline — the one-fold
   *  page's substitute for a separate Benefits/Included section, since it
   *  has none. Optional; renders nothing extra when omitted. */
  bullets?: string[];
  /** Short trust signals shown as a small row directly under the hero CTA
   *  (Brunson-style "risk-reversal" cluster) — e.g. "No credit card",
   *  "Cancel anytime", "Trusted by 500+ local businesses". Each renders as a
   *  check-marked pill. Keep them TRUE (no invented ratings/counts) — they're
   *  optional and render nothing when omitted. */
  trustBadges?: string[];
  /** A substring of `headline` to render in the design pack's gradient
   *  accent (packs without headlineGradient ignore this — plain text).
   *  Must match the headline text exactly (case-sensitive) or it's a
   *  no-op. */
  headlineAccent?: string;
  /** "split" places media beside the text (desktop) instead of below it.
   *  "background_image"/"founder_image" reuse the same mediaUrl as a
   *  full-bleed backdrop or a small framed portrait respectively — no new
   *  media field needed, just a different treatment of the existing one.
   *  "browser_mockup"/"phone_mockup" (Phase 2) wrap mediaUrl in a
   *  DeviceFrame instead of a plain rounded box — the SaaS/product-led
   *  treatment. Falls back to centered when no media is set (every
   *  media-dependent layout has nothing to render without it). */
  layout?: "centered" | "split" | "background_image" | "founder_image" | "browser_mockup" | "phone_mockup";
  cta?: CtaExtras;
  /** Phase 2 — an honest labeled placeholder ("Add a product screenshot")
   *  shown in the media slot when the archetype calls for real media but
   *  none was supplied. Ignored once mediaUrl is set. Never auto-filled
   *  with stock imagery — see CLAUDE.md's anti-fabrication rules. */
  mediaPlaceholderLabel?: string;
  /** Phase 3 — operator-facing shooting brief for `mediaPlaceholderLabel`,
   *  e.g. "Technician repairing an HVAC unit · Build trust before the CTA
   *  · Recommended 1600×900". BUILDER-ONLY (never rendered on the public
   *  page) — tells the operator specifically what to shoot/upload and why,
   *  instead of a generic "add a photo." */
  mediaPlaceholderBrief?: string;
}

export interface ProofStripConfig {
  variant: "logos" | "rating";
  rating?: { score: number; reviewCount: number; scale?: number };
  logos?: { url: string; alt: string }[];
}

export interface OfferConfig {
  productImageUrl?: string;
  headline?: string;
  priceCents: number | null;
  strikethroughPriceCents?: number | null;
  bullets: string[];
  /** Embedded lead-capture form. Null = CTA button only (VSL genre). */
  formId: string | null;
  ctaLabel: string;
  /** External checkout/booking link — only used when formId is null. */
  ctaHref?: string;
  cta?: CtaExtras;
}

export interface StoryConfig {
  /** e.g. "From: Jane Doe, Austin, TX" — direct-mail-letter byline. */
  byline: string;
  paragraphs: string[];
  photoUrl?: string;
  /** Honest labeled placeholder ("Add founder photo") shown when the
   *  archetype expects a founder photo but none was supplied. Ignored once
   *  photoUrl is set. */
  photoPlaceholderLabel?: string;
  /** Builder-only shooting brief — see HeroConfig.mediaPlaceholderBrief. */
  photoPlaceholderBrief?: string;
}

export interface FaqConfig {
  items: { question: string; answer: string }[];
}

export interface CtaBannerConfig {
  headline: string;
  subtext?: string;
  ctaLabel: string;
  ctaHref: string;
  cta?: CtaExtras;
  /** When set, the banner's CTA opens this capture form (popup) — same as the
   *  offer/hero, so a mid/late-page repeat CTA actually converts. */
  formId?: string | null;
  /** Art-direction layout variant. "banner" (default) = the contained
   *  rounded CTA box. "full_bleed_close" = a full-width, high-contrast
   *  accent close (big type, inverted button) — the urgent final close. */
  variant?: "banner" | "full_bleed_close";
}

export interface CountdownConfig {
  /** ISO timestamp. */
  endsAt: string;
  onExpireBehavior?: "hide" | "show_zero";
}

export interface AgendaConfig {
  days: { label: string; title: string; bullets: string[] }[];
}

export interface TicketTiersConfig {
  tiers: {
    name: string;
    priceCents: number | null;
    features: string[];
    ctaLabel: string;
    ctaHref?: string;
    formId?: string | null;
    highlighted?: boolean;
  }[];
}

/** Operator-typed real guarantee terms — nothing pre-filled or invented,
 *  unlike gitpage's fabricated-guarantee problem documented in CLAUDE.md. */
export interface GuaranteeConfig {
  headline: string;
  bodyText: string;
  badgeIcon?: "shield" | "seal" | "check";
  durationLabel?: string;
}

/** Icon-driven trust row — no fabricated ratings/review counts (that's
 *  proof_strip's rating variant, which already covers real star display). */
export interface TrustBadgesConfig {
  badges: { label: string; iconType: "lock" | "card" | "shield" | "star" }[];
}

export interface OrderBumpConfig {
  headline: string;
  description?: string;
  priceCents: number;
  /** Materialized at save time on the tenant's own Stripe account —
   *  null until first successful save with a connected tenant. */
  stripePriceId: string | null;
}

/**
 * Real, native Stripe checkout — additive to (not a replacement of)
 * `offer`, which stays the external-link/lead-capture-form option.
 * `offer` is untouched so every already-published funnel keeps working.
 */
export interface CheckoutConfig {
  productImageUrl?: string;
  headline?: string;
  priceCents: number | null;
  strikethroughPriceCents?: number | null;
  bullets: string[];
  ctaLabel: string;
  checkoutMode: "external_link" | "form_capture" | "stripe_checkout";
  // external_link mode:
  ctaHref?: string;
  // form_capture mode:
  formId?: string | null;
  // stripe_checkout mode — ISO 4217, defaults "usd":
  currency?: string;
  billingMode?: "one_time" | "subscription";
  recurringInterval?: "month" | "year";
  stripePriceId?: string | null;
  stripeProductId?: string | null;
  orderBump?: OrderBumpConfig | null;
  /** Post-purchase flow — the checkout success redirect lands here first.
   *  The downsell path is reached from THIS upsell's own `declineFunnelId`,
   *  not a second pointer here — keeps one "next step" concept per page. */
  upsellFunnelId?: string | null;
}

/**
 * A one-click post-purchase step page — rendered by the exact same
 * /lp/[funnelId] route as any other funnel, just with `chainRole` set on
 * its FunnelDoc (see below). `acceptNextFunnelId`/`declineFunnelId` are
 * per-step pointers rather than a single fixed pair on the root offer, so
 * a chain can run upsell -> upsell -> downsell -> thank-you (or any other
 * operator-built sequence) for free — no depth cap, no second data model.
 */
export interface UpsellOfferConfig {
  productImageUrl?: string;
  headline: string;
  bullets: string[];
  /** Charged via a direct off-session PaymentIntent, not a Checkout
   *  Session line item — no pre-created Stripe Price needed. */
  priceCents: number;
  currency?: string;
  acceptLabel: string;
  declineLabel: string;
  /** Where "Yes" goes next — another upsell, or null = thank-you/stop. */
  acceptNextFunnelId?: string | null;
  /** Where "No thanks" goes — a downsell step, or null = thank-you/stop. */
  declineFunnelId?: string | null;
}

/** A single embed (YouTube/Vimeo/Wistia/etc.) — distinct from hero's
 *  optional inline media, for genres (VSL) where the video IS the pitch,
 *  not a decoration beside the headline. */
export interface VideoConfig {
  embedUrl: string;
  headline?: string;
  subtext?: string;
  /** Honest placeholder shown when embedUrl is empty — the section stays
   *  visible instead of silently rendering nothing (see VideoSection). */
  placeholderLabel?: string;
}

/** Icon+title+description cards — the generic "here's what you get /
 *  here's who this is for" grid. Reused across multiple framework stages
 *  (Benefits, What You'll Learn, Who It's For) via a different headline,
 *  not a different section type. */
export interface BenefitsGridConfig {
  headline?: string;
  items: { title: string; description?: string; iconType?: BenefitIconType; imageUrl?: string; imageIsStock?: boolean }[];
  /** Art-direction layout variant. "flowing_checklist" (default) = the
   *  centered single-column sales-letter checklist. "alternating_image" =
   *  zigzag image/text rows (people-led, calm campaigns) — items render
   *  their imageUrl when set, else the designed placeholder panel. */
  variant?: "flowing_checklist" | "alternating_image";
}
export type BenefitIconType =
  | "check"
  | "clock"
  | "target"
  | "trending"
  | "shield"
  | "zap"
  | "users"
  | "star";

/** Two-column split — the problem the reader has right now vs. how this
 *  offer solves it. Covers both the "Problem" and "Solution" framework
 *  stages in one section (splitting them into two separate sections read
 *  as redundant in practice). */
export interface ProblemSolutionConfig {
  problemHeadline: string;
  problemText: string;
  solutionHeadline: string;
  solutionText: string;
  /** Art-direction layout variant. "stacked" (default) = the centered
   *  flowing problem → turn → solution narrative. "before_after" = two
   *  contrasting panels with a directional transition (the visualized
   *  transformation — e.g. hot home → cool home for an urgent campaign). */
  variant?: "stacked" | "before_after";
}

/** Two-column (or stacked) before/after contrast — real, concrete
 *  differences the reader will recognize, not fabricated statistics. */
export interface BeforeAfterConfig {
  beforeHeadline?: string;
  beforeItems: string[];
  afterHeadline?: string;
  afterItems: string[];
}

/** "What's Included" cards — distinct from BenefitsGrid in intent (this is
 *  an inventory of concrete deliverables, not persuasive benefit framing)
 *  even though the visual shape is similar. */
export interface IncludedConfig {
  headline?: string;
  items: { title: string; description?: string }[];
}

/** The Grand-Slam / ClickFunnels value stack: the operator's REAL deliverables,
 *  each with an honest value, summed to an anchor total, then the actual price
 *  revealed beneath it — the gap does the persuading. Values are the operator's
 *  own honest numbers; never fabricated or padded (see offer-value-stack in the
 *  conversion framework library). */
export interface ValueStackConfig {
  headline?: string;
  /** Each real deliverable + an honest value string, e.g. value: "$500". */
  items: { title: string; description?: string; value?: string }[];
  /** The summed anchor, e.g. "Total value: $2,970". Shown struck-through. */
  totalValueLabel?: string;
  /** The real price revealed under the anchor, e.g. "Today: $497" or "Free". */
  priceLabel?: string;
  /** Optional line under the price (e.g. a real guarantee restatement). */
  footnote?: string;
}

/** Us vs. the alternative — rows are our own real offer facts vs. a
 *  generic "the old way" / "doing it yourself" comparison, never a named
 *  real competitor's specific claims (which we have no way to verify). */
export interface ComparisonConfig {
  headline?: string;
  usLabel: string;
  themLabel: string;
  rows: { feature: string; us: boolean; them: boolean }[];
}

/** Real customer quotes ONLY — renders nothing when empty, exactly like
 *  TrustBadgesConfig/ProofStripConfig's logos variant. Distinct from
 *  StoryConfig, which is the operator's own synthesized narrative and is
 *  always safe to write; a testimonial is someone else's claim and must
 *  never be invented. */
export interface TestimonialsConfig {
  items: { quote: string; name: string; detail?: string }[];
}

/** Real numbers ONLY — same "renders nothing unless supplied" discipline
 *  as TestimonialsConfig. A fabricated stat ("10,000+ customers served")
 *  is exactly the kind of fake social proof this whole system exists to
 *  prevent, so this section is never AI-populated without real evidence. */
export interface StatsConfig {
  items: { value: string; label: string }[];
}

/** A single highlighted statement — a pull-quote/emphasis of something
 *  already established elsewhere on the page, not a new factual claim, so
 *  it's safe for the AI to write (unlike Stats/Testimonials). */
export interface CalloutConfig {
  text: string;
  tone?: "info" | "highlight";
}

/** Multiple people — distinct from StoryConfig, which is one operator's
 *  own narrative. Useful for agencies/teams; photos are optional (a real
 *  headshot only, never a stock/fabricated one). */
export interface TeamConfig {
  headline?: string;
  members: { name: string; role: string; photoUrl?: string; bio?: string; photoPlaceholderLabel?: string }[];
}

/** Alternating (or single) image+text blocks — a versatile layout reused
 *  across genres for "how it works in detail," feature deep-dives, etc. */
export interface ImageTextConfig {
  blocks: { headline: string; text: string; imageUrl?: string; imagePosition: "left" | "right" }[];
}

/** Phase 3 — multiple real photos, distinct from ImageTextConfig's
 *  paired-with-copy blocks (this is a pure visual gallery, no text per
 *  image beyond an optional caption) and from Hero's single media slot
 *  (this is the "more than one photo" answer — a dedicated, independently
 *  scalable section, so the hero can stay a single clean image/logo-only
 *  while real work photos live here). Real URLs only; `placeholderLabel`
 *  renders an honest "Add photos of your work" card when empty — never
 *  fabricated/stock imagery. */
export interface PhotoGalleryConfig {
  headline?: string;
  images: { url: string; caption?: string }[];
  /** "grid" (default) = even columns. "masonry" = varied-height columns
   *  for a less uniform feel. "carousel" = horizontal scroll-snap, best
   *  for 5+ images. "before_after" = exactly two images side by side
   *  labeled Before/After. */
  layout?: "grid" | "masonry" | "carousel" | "before_after";
  placeholderLabel?: string;
  /** Builder-only shooting brief — see HeroConfig.mediaPlaceholderBrief. */
  placeholderBrief?: string;
}

export type FunnelSectionConfig =
  | HeroConfig
  | ProofStripConfig
  | OfferConfig
  | StoryConfig
  | FaqConfig
  | CtaBannerConfig
  | CountdownConfig
  | AgendaConfig
  | TicketTiersConfig
  | GuaranteeConfig
  | TrustBadgesConfig
  | CheckoutConfig
  | UpsellOfferConfig
  | VideoConfig
  | BenefitsGridConfig
  | ProblemSolutionConfig
  | BeforeAfterConfig
  | IncludedConfig
  | ValueStackConfig
  | ComparisonConfig
  | TestimonialsConfig
  | StatsConfig
  | CalloutConfig
  | TeamConfig
  | ImageTextConfig
  | PhotoGalleryConfig;

/** Per-section background "canvas" — the art-direction layer's assignable
 *  surface treatment (replaces the fixed archetype background rhythm when
 *  set). Absent = today's rhythm-by-index behavior, so stored funnels are
 *  untouched. "photographic" renders the dark-immersive fallback until a
 *  real section image is wired (never a fabricated stock photo). */
export type SectionCanvas =
  | "clean"
  | "warm_paper"
  | "brand_tint"
  | "dark_immersive"
  | "high_contrast_cta"
  | "photographic";

export interface FunnelSection {
  id: string;
  type: FunnelSectionType;
  config: FunnelSectionConfig;
  /** Art-direction canvas for this section (see SectionCanvas). Optional —
   *  absent keeps the archetype's background rhythm. */
  canvas?: SectionCanvas;
  /** This section's JOB in the sales argument (Sales Argument Engine):
   *  hook / belief_shift / promise / mechanism / proof / offer /
   *  risk_reversal / objections / close / action. Every section must be able
   *  to answer "what persuasion job would be lost if this disappeared?" —
   *  stored so the answer lives in data, not in a discarded prompt. */
  argumentRole?: string;
  /** The specific belief (verbatim from salesArgument.beliefChain) this
   *  section is responsible for establishing — the data-level proof the
   *  belief chain is CONSUMED by composition, not decorative. */
  servesBelief?: string;
}

export interface FunnelDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  name: string;
  genre: FunnelGenre;
  status: FunnelStatus;
  theme: "light" | "dark";
  /** Hex string with leading #. */
  accentColor: string;
  /** Landing Page Design System (RC 1.1) — optional so every pre-existing
   *  funnel (created before this shipped) keeps rendering exactly as
   *  before: undefined resolves to the "classic" pack (today's plain
   *  white-background rendering, zero visual change). Set at creation by
   *  Zeno's design-pack selection or an operator override; editable
   *  afterward in the builder. */
  designPack?: import("@/lib/funnels/design-packs").DesignPackId;
  /** Flow Phase 2 — Design Intelligence. Supersedes `designPack` when
   *  present (see resolveEffectiveDesignTokens in design-strategy.ts);
   *  absent for every funnel created before this shipped, which keeps
   *  rendering through the designPack/"classic" chain unchanged. Set by
   *  Zeno's industry-aware archetype selection at creation; editable
   *  afterward in the builder. */
  designStrategy?: import("@/lib/funnels/design-strategy").DesignStrategy | null;
  /** The Campaign Art Direction profile this funnel was composed with (the
   *  CAMPAIGN_VISUAL_PLAN's reasoning core) — STORED so the composition is
   *  explainable and future re-renders/builder surfaces can consume it, never
   *  metadata that exists only in a prompt. Structurally matches
   *  ArtDirectionProfile in lib/funnels/art-direction.ts (declared inline here
   *  to keep the types layer import-cycle-free). Absent on funnels created
   *  before art direction shipped. */
  artDirection?: {
    transformation: string | null;
    energy: "calm" | "balanced" | "urgent";
    density: "minimal" | "medium" | "rich";
    humanity: "product_led" | "balanced" | "people_led";
  };
  /** Persuasion depth this funnel was composed at (lean/standard/deep) —
   *  how much BELIEF CHANGE the page performs. Persisted for certification
   *  traces + Zeno explainability. */
  persuasionDepth?: "lean" | "standard" | "deep";
  /** Decision complexity (low/moderate/high/enterprise) — how much
   *  information/proof/risk-reduction SUPPORT the decision requires.
   *  Orthogonal to persuasion depth: a most-aware enterprise buyer may be
   *  lean + enterprise. */
  decisionComplexity?: "low" | "moderate" | "high" | "enterprise";
  /** The Sales Argument Plan this funnel was built to EXECUTE — the belief
   *  work the page does, constructed BEFORE composition and stored so the
   *  argument is explainable (Zeno: "what must this prospect believe?") and
   *  auditable per section (see FunnelSection.argumentRole). The page is the
   *  visual execution of this argument, not a collection of components.
   *  Absent on funnels created before the Sales Argument Engine shipped. */
  salesArgument?: {
    /** Who exactly is being persuaded, in a sentence. */
    prospect: string;
    /** What likely happened right before they arrived (the conversation
     *  already in their head). */
    arrivalContext: string;
    /** What they believe right now that stops them acting. */
    currentBelief: string;
    /** The ordered belief chain the page must walk: current belief →
     *  required beliefs → action. 3-6 steps. */
    beliefChain: string[];
    /** The conventional/alternative experience (only when supportable —
     *  never a manufactured strawman). Empty = not used. */
    oldWay: string;
    /** Why the old way creates the friction the prospect recognizes. */
    whyOldWayFails: string;
    /** Why THIS solution works — the legitimate mechanism. */
    mechanism: string;
    /** The single credible outcome the page promises. */
    corePromise: string;
    /** The one objection most likely to block action. */
    primaryObjection: string;
    /** How legitimate risk is reduced (real policies only). */
    riskReversal: string;
    /** Why acting now makes sense (legitimate reasons only). */
    closeReason: string;
  };
  /** Small brand mark shown at the very top of the public page, above the
   *  hero — not a nav bar (funnels intentionally have no navigation away
   *  from the CTA), just a real logo for recognition/trust. Always
   *  operator-provided: Zeno never sets this (same reasoning as
   *  Testimonials — a real logo isn't something the AI has access to or
   *  can honestly invent). Absent = no logo bar rendered, unchanged from
   *  today. */
  logoUrl?: string;
  sections: FunnelSection[];
  /** Undefined/"standalone" = every existing funnel — appears in the main
   *  Funnels list. "upsell"/"downsell" = a post-purchase chain step,
   *  rendered by the same /lp/[funnelId] route but filtered out of the
   *  main list; created/managed from its parent's "Post-purchase flow"
   *  panel. */
  chainRole?: "standalone" | "upsell" | "downsell";
  /** The root checkout funnel this step belongs to. Null/undefined for
   *  standalone funnels. Used for the delete-guard (a parent with linked
   *  steps can't be silently orphaned) and the builder's back-link. */
  parentFunnelId?: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
