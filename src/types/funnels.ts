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
  | "lead_gen"
  /**
   * BOOKING / CONSULTATION — the page's whole purpose is getting a time in
   * the diary (a consultation, an assessment, a site visit).
   *
   * It exists because it was MISSING, and its absence had a customer-visible
   * cost: a physiotherapy page offering a free 20-minute assessment was
   * classified `lead_magnet`, so the publish contract demanded an uploaded
   * file the page never promised, and the page could not go live at all.
   * Booking intent had no way to be represented, so it borrowed the
   * semantics of the one genre that requires a deliverable.
   *
   * Captures a lead like any other genre. Promises no file, so no
   * lead-magnet asset and no delivery email are required of it.
   */
  | "booking";
/**
 * APPROVAL STATES — P0.4. ADDITIVE ONLY.
 *
 * "draft" and "published" are the ORIGINAL values and remain valid forever:
 * every existing funnel carries one of them, and nothing is migrated. The new
 * states describe the review journey the product now expresses; "published"
 * IS the live state and is shown to customers as "Live".
 *
 * The safety property that matters: only "published" renders publicly.
 * "approved" and "scheduled" deliberately do NOT — approving something is not
 * the same as making it live, and conflating them would publish work a human
 * only agreed to in principle. See isPubliclyRenderable().
 */
export type FunnelStatus =
  | "draft"
  | "ready_for_review"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "published"
  | "paused"
  | "archived";

/** The ONLY state that may be served to the public. Deliberately a
 *  whitelist: a new state added later is non-public until someone
 *  deliberately adds it here. */
export function isPubliclyRenderable(status: FunnelStatus | undefined | null): boolean {
  return status === "published";
}

/** Customer-facing label. "published" reads as "Live" — customers think in
 *  terms of what the public can see, not our storage value. */
export const FUNNEL_STATUS_LABEL: Record<FunnelStatus, string> = {
  draft: "Draft",
  ready_for_review: "Ready for review",
  changes_requested: "Changes requested",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Live",
  paused: "Paused",
  archived: "Archived",
};

/**
 * A genuine UNRESOLVED REQUIREMENT: something only the business can supply —
 * a photograph of their team, work or premises — with a brief saying exactly
 * what to shoot. These are actionable: they drive Upload / Brand Library /
 * Generate, and they are what "Stronger with N photos" counts.
 */
export interface VisualRequirement {
  /** Stable id so an action targets THIS requirement, not "a photo somewhere". */
  id: string;
  role: string;
  sectionType: string;
  /** The shot brief — specific enough to act on without asking us. */
  brief: string;
  /**
   * SEMANTIC, never positional. An earlier version derived this from
   * `sectionType === "hero"`, which is wrong in both directions: a hero may
   * legitimately be text-led, while a non-hero visual can be the evidence the
   * page's argument actually rests on.
   *
   *   required     the section cannot fulfil its role without this — the
   *                page's argument or evidence genuinely depends on it
   *   recommended  publishable and reviewable now; authentic media would
   *                make it stronger
   *
   * The Critic has the final say on readiness against the finished artifact.
   */
  necessity: "required" | "recommended";
  /**
   * How this requirement was satisfied, when it has been. Resolution means
   * "this visual role is handled" — NOT "authentic first-party evidence now
   * exists". A generated image must never become evidence merely because it
   * filled a slot and turned the UI green.
   */
  resolvedWith?: {
    provenance: "first_party_upload" | "brand_library" | "generated";
    url: string;
    /** True only for genuine business media. Generated visuals are never
     *  evidence, however well they fit the slot. */
    countsAsAuthenticEvidence: boolean;
    /**
     * The asset's OWN classification at discovery time, carried across
     * unchanged when it comes from the brand library. Resolution moves an
     * asset into a slot; it does not reclassify it. Null for uploads, which
     * were never discovered and so have no prior classification.
     */
    sourceClassification?: string | null;
  };
}

/**
 * A COMPLETED Director decision, kept for auditability. Deliberately a
 * SEPARATE type rather than a `kind` on the same array: "the gallery was
 * omitted because only one strong photograph exists" is a resolved choice,
 * not something a customer must fix. Modelling both as one list means every
 * future consumer — preview, Zeno, readiness, counters — has to remember
 * that some entries are not gaps, and eventually one forgets.
 *
 * These never count toward improvements, never create actions, never make a
 * page look incomplete, and never block readiness.
 */
export interface VisualDecision {
  role: string;
  sectionType: string;
  /** Why this slot is intentionally without imagery. */
  reason: string;
}

/** Who/what produced or changed an asset, and who allowed it to go out.
 *  Every field optional: existing records predate this and must stay valid. */
export interface ApprovalMetadata {
  /** "ai" when Zeno authored it, "human" when a person did. */
  origin?: "ai" | "human";
  createdByUid?: string;
  lastEditedByUid?: string;
  lastEditedAt?: string;
  approvedByUid?: string;
  approvedAt?: string;
  /** Who actually made it public — distinct from who approved it. */
  publishedByUid?: string;
  publishedAt?: string;
}

/**
 * THE SINGLE SOURCE OF TRUTH FOR SECTION TYPES — runtime array first, type
 * derived from it.
 *
 * This used to be a bare type union, with the save route keeping its own
 * hand-written copy to validate against at runtime (types vanish after
 * compilation, so it needed *a* list). The two drifted: `value_stack` and
 * `multi_step_form` were added here and never added there, so every funnel
 * containing one was rejected with a 400 on save — for every funnel type,
 * while the builder happily offered those sections and the renderer happily
 * rendered them. A VA lost a day to it.
 *
 * Deriving the type from the array makes that drift impossible rather than
 * merely unlikely: there is nowhere left to forget.
 */
export const FUNNEL_SECTION_TYPES = [
  "hero",
  "proof_strip",
  "offer",
  "story",
  "faq",
  "cta_banner",
  "countdown",
  "agenda",
  "ticket_tiers",
  "guarantee",
  "trust_badges",
  "checkout",
  "upsell_offer",
  "video",
  "benefits_grid",
  "problem_solution",
  "before_after",
  "included",
  "value_stack",
  "comparison",
  "testimonials",
  "stats",
  "callout",
  "team",
  "business_footer",
  "image_text",
  "photo_gallery",
  "multi_step_form",
] as const;

export type FunnelSectionType = (typeof FUNNEL_SECTION_TYPES)[number];

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
  /**
   * Whether this hero's image may be cropped to fill. `cover` only when the
   * planner proved the asset safe to crop; anything else (including absent,
   * which every pre-contract funnel is) must not be destructively cropped.
   * See lib/funnels/asset-suitability.ts.
   */
  mediaFit?: "cover" | "intrinsic";
  /** Meaningful alt text for the hero image. Empty string means deliberately
   *  decorative; ABSENT means nobody decided, which is the bug this closes. */
  mediaAlt?: string;
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
  /** A one-fold page has no mid-page beat to put proof in, so the fold itself
   *  carries it: the deliverable's REAL contents rendered beside the headline
   *  as a labelled example document. Set by the page-composition planner only
   *  when the page would otherwise have no visual at all and no photograph
   *  would be honest. Never invented — the items are the offer's own. */
  proofShowcase?: { items: { title: string; description?: string }[] } | null;
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
  /** REAL rating only (e.g. the business's actual Google rating) — never
   *  fabricated. `href` links the strip to the live profile (Google Business,
   *  etc.) so the proof is verifiable. */
  rating?: {
    score: number;
    reviewCount: number;
    scale?: number;
    href?: string;
    /** Whose reviews these are ("Google"). Rendered verbatim, so a page can
     *  never imply a source the business did not name. */
    source?: string;
  };
  /** Third-party marks. `category` is REQUIRED and is what the heading is
   *  derived from — an uncategorised mark makes an unknown claim, and the
   *  renderer refuses it (see lib/funnels/evidence-proof.ts). Never assembled
   *  from asset classification: that was the fabricated-"As seen in" defect. */
  logos?: { url: string; alt: string; category?: "partner" | "press" | "certification" | "award" }[];
  /** Evidence-strip heading over the logos row — "Trusted by", "As featured
   *  in", "Certifications & memberships". Defaults to "As seen in". */
  heading?: string;
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
  /** The visual for this section's persuasion beat — see BeatVisualConfig.
   *  Distinct from `photoUrl`, which is the byline's small round portrait. */
  beatVisual?: BeatVisualConfig;
  /** Honest labeled placeholder ("Add founder photo") shown when the
   *  archetype expects a founder photo but none was supplied. Ignored once
   *  photoUrl is set. */
  photoPlaceholderLabel?: string;
  /** Builder-only shooting brief — see HeroConfig.mediaPlaceholderBrief. */
  photoPlaceholderBrief?: string;
}

/** BUSINESS IDENTITY (Business Reality Engine, slice B) — the section that
 *  grounds the page in a real organization. Every field is VERIFIED
 *  workspace/customer data (agent-profile business name, accountContact,
 *  the funnel's logo, operator-typed credentials) — never invented. The
 *  renderer shows only the fields that exist, so an empty deployment gets
 *  a minimal-but-real footer rather than fabricated depth. Also feeds the
 *  slim top identity strip above the hero. */
export interface BusinessFooterConfig {
  businessName?: string;
  logoUrl?: string;
  tagline?: string;
  email?: string;
  phone?: string;
  address?: string;
  /** Real credentials/registrations the operator supplied ("ADA member",
   *  "Licensed & insured — TX #12345"). Never model-invented. */
  credentials?: string[];
  /** Render the slim identity strip above the hero too. Default true. */
  showTopBar?: boolean;
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
  items: { title: string; description?: string; iconType?: BenefitIconType; imageUrl?: string; imageIsStock?: boolean; imageAlt?: string }[];
  /** Art-direction layout variant. "flowing_checklist" (default) = the
   *  centered single-column sales-letter checklist. "alternating_image" =
   *  zigzag image/text rows (people-led, calm campaigns) — items render
   *  their imageUrl when set, else the designed placeholder panel.
   *
   *  The last two are the PROOF variants, for pages whose category makes
   *  stock photography counterfeit evidence and which would otherwise carry
   *  no visual at all: "document_showcase" frames the items as a labelled
   *  example of the deliverable, "process_flow" draws them as the verified
   *  mechanism's sequence. Both render the items already present — neither
   *  invents content or needs an asset. */
  variant?: "flowing_checklist" | "alternating_image" | "document_showcase" | "process_flow";
  /** The visual for this section's persuasion beat — see BeatVisualConfig.
   *  Only ever set on the default checklist variant (the other three ARE a
   *  composed visual device already). `side` carries "anchor" placement by
   *  being absent on a grid too long to split. */
  beatVisual?: BeatVisualConfig;
  /** Set when the beat visual LEADS the section rather than sitting beside it
   *  — a transition the cards beneath then detail. */
  beatVisualAnchored?: boolean;
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
/**
 * ONE BEAT'S VISUAL, PLACED INSIDE ITS OWN SECTION.
 *
 * Written by the visual story (lib/funnels/visual-story.ts and visual-source.ts)
 * onto the section whose ARGUMENT the visual supports, so the reader meets the
 * claim and the picture of the claim as one beat. Absent on every section that
 * did not earn one, which is most of them — see visual-placement.ts for why a
 * section with no honest slot stays text-led rather than receiving a band.
 *
 * `caption` is the page's own proposition, never invented copy. A drawn visual
 * carries `shape`; a photographic one carries `url` + `alt`; never both.
 */
export interface BeatVisualConfig {
  shape?: string;
  url?: string;
  alt?: string;
  caption: string;
  /** Which side the visual takes at desktop width. Assigned across the page so
   *  two split beats cannot both open on the same side. */
  side?: "left" | "right";
  /**
   * How to present the image. `cover` crops it to fill a fixed box and is only
   * ever set for an asset PROVEN safe to crop; `intrinsic` renders it at its
   * own aspect ratio, removing nothing.
   *
   * Absent means intrinsic — every funnel generated before this contract
   * carries no `fit`, and those pages must stop slicing their images too.
   * See lib/funnels/asset-suitability.ts.
   */
  fit?: "cover" | "intrinsic";
}

export interface ProblemSolutionConfig {
  problemHeadline: string;
  problemText: string;
  solutionHeadline: string;
  solutionText: string;
  /** The visual for this section's persuasion beat — see BeatVisualConfig. */
  beatVisual?: BeatVisualConfig;
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
  /** Content-shape variant (Business Reality Engine, slice E).
   *  "deliverable_preview" renders the REAL items inside framed document
   *  chrome labeled "Example preview" — presentation of verified facts
   *  (the actual methodology/contents), visibly an example, never dressed
   *  as historical customer evidence. Default: the checklist layout. */
  variant?: "deliverable_preview";
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
  /** The visual for this section's persuasion beat — see BeatVisualConfig. */
  beatVisual?: BeatVisualConfig;
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
  blocks: {
    headline: string;
    text: string;
    imageUrl?: string;
    /** What the photograph shows. Was absent, so the renderer emitted
     *  `alt=""` on a content image — an accessibility defect, and the reason
     *  a composed media beat failed the alt-text check. */
    imageAlt?: string;
    /** Flagged like every other non-first-party image so the builder can
     *  label it, matching `HeroConfig.mediaIsStock`. */
    imageIsStock?: boolean;
    imagePosition: "left" | "right";
  }[];
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
  /**
   * `role` is the ONLY thing that may put a "Before" or "After" badge on a
   * photograph. It exists because the renderer used to derive those labels
   * from array position whenever the layout happened to be "before_after" —
   * and the layout is chosen by ARCHETYPE, not by evidence. A trade business
   * got `galleryLayout: "before_after"` automatically, its own approved photos
   * auto-filled the gallery with captions deliberately omitted (the pipeline
   * states outright that it knows the images are theirs but not what each
   * depicts), and the page then told visitors that two unrelated photographs
   * were the same job before and after. Nobody asserted that. The page did.
   */
  images: { url: string; caption?: string; role?: "before" | "after" }[];
  /** "grid" (default) = even columns. "masonry" = varied-height columns
   *  for a less uniform feel. "carousel" = horizontal scroll-snap, best
   *  for 5+ images. "before_after" = two images side by side, labeled ONLY
   *  when they carry explicit before/after roles; otherwise it renders as an
   *  ordinary grid rather than manufacturing the claim. */
  layout?: "grid" | "masonry" | "carousel" | "before_after";
  placeholderLabel?: string;
  /** Builder-only shooting brief — see HeroConfig.mediaPlaceholderBrief. */
  placeholderBrief?: string;
}

/**
 * MULTI-STEP CAPTURE (V1).
 *
 * A qualification flow rendered as ONE section, submitting ONCE at the end
 * through the ordinary form-submission route. It is deliberately not a form
 * engine: steps are a presentation of an existing form's fields, so CRM field
 * mapping, automation triggers, attribution, opt-out handling and conversion
 * tracking are all inherited rather than re-implemented.
 *
 * Steps are LINEAR by design. Conditional branching and scoring are V1.1 —
 * both change what "the next step" is, which is the one property this shape
 * keeps simple enough to trust.
 */
export interface MultiStepFormStep {
  id: string;
  /** The question or heading the visitor reads on this step. */
  title: string;
  /** Optional one-line reassurance under the title. */
  subtitle?: string;
  /** Ids of the form's fields shown on this step, in order. A field id that
   *  no longer exists on the form is ignored at render time, so editing the
   *  underlying form can never produce a broken step. */
  fieldIds: string[];
}

export interface MultiStepFormConfig {
  eyebrow?: string;
  headline: string;
  subheadline?: string;
  /** The real form this flow submits to. Without it the section renders its
   *  copy and nothing else, rather than a dead submit button. */
  formId?: string | null;
  steps: MultiStepFormStep[];
  /** Label on the final step's button. */
  submitLabel?: string;
  /** Where the visitor lands after completing. "message" shows a confirmation
   *  in place; "booking" sends them to one of this workspace's booking pages,
   *  which is the highest-intent destination a qualification flow can have. */
  completion?: {
    mode: "message" | "booking";
    message?: string;
    /** Slug of a booking page in this workspace. */
    bookingSlug?: string;
  };
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
  | BusinessFooterConfig
  | PhotoGalleryConfig
  | MultiStepFormConfig;

/** Per-section background "canvas" — the art-direction layer's assignable
 *  surface treatment (replaces the fixed archetype background rhythm when
 *  set). Absent = today's rhythm-by-index behavior, so stored funnels are
 *  untouched. "photographic" renders the dark-immersive fallback until a
 *  real section image is wired (never a fabricated stock photo). */
/** Same rule as FUNNEL_SECTION_TYPES above: the save route needs a runtime
 *  list to validate against, so it gets this one rather than a second copy
 *  that can drift out of step with the renderer. */
export const SECTION_CANVASES = [
  "clean",
  "warm_paper",
  "brand_tint",
  "dark_immersive",
  "high_contrast_cta",
  "photographic",
] as const;

export type SectionCanvas = (typeof SECTION_CANVASES)[number];

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
  /**
   * THE ONE belief (verbatim from salesArgument.beliefChain) this section is
   * primarily responsible for establishing — the data-level proof the belief
   * chain is CONSUMED by composition, not decorative.
   *
   * ALWAYS A SINGLE COHERENT PROPOSITION. It used to hold several beliefs
   * joined with " + " when one section absorbed the remainder of the chain,
   * and that serialization reached a visitor: the constructed visual on a
   * Summit page captioned itself "…so no one is pushing a sale + If I only
   * need a small repair, they'll tell me that…", because a drawn visual's
   * caption is the beat's concept and the beat's concept is this field.
   *
   * Downstream reasoning (VisualBeat concepts, captions, redundancy checks)
   * treats this as one proposition, so it must BE one. Extra beliefs go in
   * `alsoServesBeliefs`, structurally.
   */
  servesBelief?: string;
  /**
   * Additional beliefs this section also establishes, when the chain has more
   * steps than it has rendered carriers.
   *
   * An array rather than more prose, deliberately: the previous design encoded
   * exactly this list into `servesBelief` with a delimiter, which made every
   * consumer that wanted "the proposition" silently receive a concatenation.
   * Kept so coverage is not lost — a belief nobody is responsible for is a hole
   * in the argument — while leaving the primary proposition usable on its own.
   */
  alsoServesBeliefs?: string[];
}

export interface FunnelDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  name: string;
  genre: FunnelGenre;
  status: FunnelStatus;
  /** P0.4 — optional; absent on every pre-P0.4 record. */
  approval?: ApprovalMetadata;
  /**
   * P0.5 — things the customer could still supply. ACTIONABLE.
   * Absent on every pre-P0.5 funnel; an empty array means the Director found
   * nothing outstanding, which is different from never having run.
   */
  visualRequirements?: VisualRequirement[];
  /** P0.5 — completed Director decisions. Auditable, never actionable. */
  visualDecisions?: VisualDecision[];
  /**
   * P0.5 — the Critic's structured verdict on the FINISHED composition.
   * Persisted so a readiness decision is inspectable rather than an
   * invisible AI opinion. Never contains internal reasoning. Absent means
   * the page has not been reviewed, which is NOT the same as passing.
   */
  criticVerdict?: {
    verdict: "ready" | "needs_correction";
    findings: { severity: string; sectionType: string; category: string; correction: string }[];
    evaluatedAt: string;
    model: string;
    round: number;
  };
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
  /** Thank-you/bridge step config (multistep journey): copy + the next
   *  offer the bridge page routes to after signup. All optional — the
   *  /lp/[id]/thanks page renders sensible defaults without it. */
  bridge?: {
    headline?: string;
    message?: string;
    nextFunnelId?: string | null;
    nextLabel?: string;
    nextHeadline?: string;
    nextCta?: string;
  };
  /** For webinar/event funnels: the event's start datetime (ISO 8601 with
   *  timezone). Anchors wait_until reminder nodes — editing this in the
   *  builder RESCHEDULES every pending reminder automatically (the engine
   *  re-reads it live on each wake). */
  eventStartAt?: string | null;
  /** Per-funnel SEO/share metadata. Auto-derived at generation from the
   *  page's own certified copy (headline + business identity), operator-
   *  editable in the builder. Rendered via generateMetadata on /lp — a
   *  funnel tab/share shows the CLIENT's business, never the deployment. */
  seo?: { title?: string; description?: string; ogImage?: string };
  /** The uploaded lead-magnet file (PDF) this funnel delivers after signup —
   *  stored via the chunked funnelAssets store; `url` is the public serve
   *  path (/api/funnel-asset/[id]) appended into the confirmation workflow
   *  email at upload time. */
  leadMagnetAsset?: { assetId: string; filename: string; url: string };
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
