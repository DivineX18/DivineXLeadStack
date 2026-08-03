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
  | "comparison"
  | "testimonials"
  | "stats"
  | "callout"
  | "team"
  | "image_text";

/**
 * Shared CTA-experience config, embedded (optional) on any section that
 * carries a primary call-to-action (hero, offer, cta_banner). Additive —
 * every field is optional and absent = today's plain inline behavior, so
 * every already-published funnel keeps rendering exactly as before.
 */
export interface CtaExtras {
  style?: "inline" | "popup_form" | "popup_calendar" | "dual" | "sticky_desktop" | "floating_mobile";
  /** "dual" style's secondary button. */
  secondaryLabel?: string;
  secondaryHref?: string;
  /** "popup_calendar" style — opens this sub-account's booking page in the
   *  modal. Slug only (not a full URL) — the renderer builds
   *  /b/[subAccountId]/[slug] itself so this stays portable across a
   *  custom-domain deploy without the AI/operator needing to know the URL
   *  shape. */
  bookingPageSlug?: string;
}

export interface HeroConfig {
  eyebrow?: string;
  headline: string;
  subheadline?: string;
  mediaType: "video" | "image" | "none";
  mediaUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** "split" places media beside the text (desktop) instead of below it.
   *  "background_image"/"founder_image" reuse the same mediaUrl as a
   *  full-bleed backdrop or a small framed portrait respectively — no new
   *  media field needed, just a different treatment of the existing one.
   *  Falls back to centered when no media is set (split/background_image/
   *  founder_image all have nothing to render without it). */
  layout?: "centered" | "split" | "background_image" | "founder_image";
  cta?: CtaExtras;
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
}

/** Icon+title+description cards — the generic "here's what you get /
 *  here's who this is for" grid. Reused across multiple framework stages
 *  (Benefits, What You'll Learn, Who It's For) via a different headline,
 *  not a different section type. */
export interface BenefitsGridConfig {
  headline?: string;
  items: { title: string; description?: string; iconType?: BenefitIconType }[];
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
  members: { name: string; role: string; photoUrl?: string; bio?: string }[];
}

/** Alternating (or single) image+text blocks — a versatile layout reused
 *  across genres for "how it works in detail," feature deep-dives, etc. */
export interface ImageTextConfig {
  blocks: { headline: string; text: string; imageUrl?: string; imagePosition: "left" | "right" }[];
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
  | ComparisonConfig
  | TestimonialsConfig
  | StatsConfig
  | CalloutConfig
  | TeamConfig
  | ImageTextConfig;

export interface FunnelSection {
  id: string;
  type: FunnelSectionType;
  config: FunnelSectionConfig;
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
