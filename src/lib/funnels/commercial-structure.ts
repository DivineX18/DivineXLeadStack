import type { FunnelDoc, FunnelSection, FunnelSectionType } from "@/types/funnels";

/**
 * COMMERCIAL STRUCTURE: a page's sections must match what is actually being
 * sold on it.
 *
 * Found live (pre-beta P1 repair, funnel EcKaDdB6Px5G0jF1CIBc): a FREE
 * standalone lead-magnet page carried a $1,000 "Wait, add this to your
 * order?" upsell section. It was added by hand in the builder, whose
 * add-section palette offered every section type regardless of the funnel's
 * role, and nothing on the write path objected.
 *
 * That section is not merely off-brief, it is structurally dead. An
 * `upsell_offer`'s accept button posts to /api/lp/[funnelId]/upsell/[id]/charge
 * with the `session_id` query param from a completed Stripe Checkout, and
 * charges the card saved on the matching `funnelOrders` doc. On a standalone
 * opt-in page no such order exists and none can, so the button can only ever
 * fail. A visitor who never paid anything is shown a price and a "Yes, add
 * it!" button that cannot work.
 *
 * So: post-purchase sections belong on post-purchase pages. This module is
 * the single definition of which sections those are; the write chokepoint
 * (lib/server/funnels-service.ts) and the builder palette both read it, so
 * the rule cannot drift between what the UI offers and what the server
 * accepts.
 *
 * Deliberately NOT covered here:
 *  - `checkout` sections, which are perfectly valid on a standalone sales
 *    page (that is how a chain STARTS, via CheckoutConfig.upsellFunnelId).
 *  - a genuinely configured upsell/downsell chain step, which carries
 *    chainRole "upsell"/"downsell" and is exactly where these sections belong.
 */

/** Sections that only function inside a post-purchase chain step. */
export const CHAIN_ONLY_SECTION_TYPES: readonly FunnelSectionType[] = ["upsell_offer"];

export function isChainOnlySection(type: FunnelSectionType): boolean {
  return CHAIN_ONLY_SECTION_TYPES.includes(type);
}

/** A funnel that IS a post-purchase step, as opposed to a normal page.
 *  Absent/"standalone" is every ordinary funnel (see FunnelDoc.chainRole). */
export function isChainStepFunnel(chainRole: FunnelDoc["chainRole"] | undefined): boolean {
  return chainRole === "upsell" || chainRole === "downsell";
}

/** Chain-only sections present on a funnel that is not a chain step. Empty
 *  for every chain step and for every page that has none. */
export function invalidChainSections(
  sections: FunnelSection[],
  chainRole: FunnelDoc["chainRole"] | undefined,
): FunnelSection[] {
  if (isChainStepFunnel(chainRole)) return [];
  return sections.filter((s) => isChainOnlySection(s.type));
}

/** The operator-facing explanation, shared by every rejection site so the
 *  wording cannot drift. */
export function chainSectionRejection(offending: FunnelSection[]): string {
  const names = [...new Set(offending.map((s) => s.type))].join(", ");
  return (
    `This page isn't a post-purchase step, so it can't carry an upsell/downsell section (${names}). ` +
    `Those charge the card saved on a completed order, and this page has no order behind it, so the button could only fail. ` +
    `Remove the section, or add it to a real upsell step from the "Post-purchase flow" panel on the funnel that takes the payment.`
  );
}
