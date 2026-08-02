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
  | "upsell_offer";

export interface HeroConfig {
  eyebrow?: string;
  headline: string;
  subheadline?: string;
  mediaType: "video" | "image" | "none";
  mediaUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** "split" places media beside the text (desktop) instead of below it —
   *  the default "centered" layout reads templated at scale; split is the
   *  standard modern-funnel pattern. Falls back to centered when no media
   *  is set, since split has nothing to put in the second column. */
  layout?: "centered" | "split";
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
  | UpsellOfferConfig;

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
