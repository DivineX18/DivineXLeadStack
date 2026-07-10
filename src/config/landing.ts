/**
 * Landing-page configuration.
 *
 * The repo ships with two complete landing pages:
 *
 *   - "custom"    — a generic agency-CRM landing the buyer brands as
 *     their own. THIS IS THE DEFAULT — every new clone should be
 *     branded for the buyer's business, so the custom variant renders
 *     at "/" out of the box and CUSTOM_BRAND below should be edited
 *     first.
 *
 *     Supports BOTH sales motions at once: prospects can either self-serve
 *     (pick a plan on `/pricing` or the homepage pricing section, pay via
 *     Stripe Checkout, and get their own sub-account provisioned
 *     automatically — see `lib/server/public-signup-service.ts`) or you can
 *     still do it manually (take payment off-system, provision a
 *     sub-account, invite the client). Pricing is LIVE data — whichever
 *     Client Billing plans are marked "sellable publicly" (Agency → Client
 *     billing → a plan's "Sell on pricing page" toggle) render on the
 *     pricing page; there's no separate hardcoded pricing config to keep in
 *     sync.
 *
 *   - "leadstack" — the LeadStack-branded marketing landing that sells
 *     LeadStack itself (used on the leadstack.dev demo site). Only flip
 *     back to this if you're running the public LeadStack demo.
 *
 * Flip LANDING_VARIANT below to swap which one renders at "/".
 */

export type LandingVariant = "leadstack" | "custom";

export const LANDING_VARIANT: LandingVariant = "custom";

export interface CustomBrand {
  name: string;
  tagline: string;
  shortDescription: string;
  supportEmail: string;
  primaryDomain: string;
}

/**
 * The brand object actually passed to the custom landing components at
 * render time. Resolved on the server by lib/landing/resolve-brand.ts —
 * agency doc fields take precedence, CUSTOM_BRAND fills the gaps. `logoUrl`
 * is nullable because "no logo set" is a meaningful state (renders the
 * default gradient mark instead of an <img>).
 */
export interface ResolvedBrand {
  name: string;
  logoUrl: string | null;
  tagline: string;
  shortDescription: string;
  supportEmail: string;
  primaryDomain: string;
}

/**
 * Brand fields used by the "custom" landing variant. Ignored entirely when
 * LANDING_VARIANT is "leadstack". Edit these to brand the white-label
 * landing for your own business — the values below are placeholder
 * defaults so the page renders cleanly out of the box.
 */
export const CUSTOM_BRAND: CustomBrand = {
  /** Displayed in navbar, hero, footer copyright, page title — everywhere. */
  name: "Ascend CRM",

  /** One-line positioning, surfaced in hero subtitle + meta description. */
  tagline: "Turn strategy into execution.",

  /**
   * Short (~140 char) description used under the hero headline. Should
   * read like a tweet — what the product does, for whom.
   */
  shortDescription:
    "Everything you need to manage customers, automate marketing, close more sales, and execute your growth strategy.",

  /** Used on CTA buttons + the FAQ "talk to us" line + footer. */
  supportEmail: "hello@divinex.io",

  /** Used in footer, og:url, canonical. No https://, no trailing slash. */
  primaryDomain: "crm.divinex.io",
};
