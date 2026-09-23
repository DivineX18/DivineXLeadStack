import "server-only";

/**
 * ONE COMMERCIAL ASCEND SOLO SUBSCRIPTION, OWNED BY BI.
 *
 * Ascend Solo existed twice: as BI's `growth_system` product, and as a Flow
 * Client Billing plan with `product: "unified"` at the same $197. They were
 * independent subscriptions in independent billing systems, and only the BI
 * one grants `growth_intelligence` + `growth_operations` — which is what
 * drives workspace provisioning, the canonical mapping and the Operations SSO
 * handoff. A customer who bought the Flow one paid $197 and reached none of
 * it.
 *
 * BI is now the canonical owner. This module is what `/start` DISPLAYS; the
 * purchase itself happens on the Ascend application, against the Clerk
 * identity, via lib/intelligence/ascend-acquisition-handoff.ts.
 */

/**
 * THE ASCEND SOLO OFFER — ONE CONTRACT FOR BOTH DISPLAY AND PURCHASE.
 *
 * `/start` used to read its price and trial length from Flow's legacy
 * `unified` Client Billing plan while buying something else entirely, so the
 * page showed one product's numbers and charged another's. That is exactly
 * how a display and a checkout drift apart unnoticed.
 *
 * These values mirror BI's canonical `PRODUCTS.growth_system`
 * (`defaultAmount: 19700`) and `TRIAL_DAYS_BY_PRODUCT.growth_system` (14).
 * They are restated here rather than fetched because `/start` is a
 * cold-traffic page and a cross-service call on it would make the front door
 * fail whenever the intelligence service hiccups — a worse failure than the
 * one being fixed.
 *
 * Restating carries a divergence risk, so it is PINNED BY TEST: the
 * acquisition suite asserts these numbers against BI's own source, and CI
 * fails if either side moves without the other. BI remains the authority;
 * this is a mirror with an alarm on it, not a second source of truth.
 */
export const ASCEND_SOLO_OFFER = {
  /** The canonical BI product this page sells. */
  product: "growth_system",
  name: "Ascend Solo",
  priceMonthlyCents: 19_700,
  currency: "usd",
  trialDays: 14,
} as const;

/*
 * THE CHECKOUT CALL THAT USED TO LIVE HERE IS GONE.
 *
 * `startAscendSoloCheckout()` posted this page's form email to BI's anonymous
 * pay-first endpoint, which made a typed address the owner of the
 * subscription. Ascend purchasing now runs behind the Clerk identity: `/start`
 * hands off to the authenticated Ascend application instead of buying. See
 * lib/intelligence/ascend-acquisition-handoff.ts.
 *
 * What remains here is PRESENTATION ONLY — the numbers `/start` displays,
 * still pinned by test to BI's canonical growth_system product so the page
 * cannot advertise something different from what the authenticated checkout
 * charges.
 */

/**
 * ASCEND SOLO AS A PRICING CARD.
 *
 * The public pricing page renders Flow Client Billing plans, and Ascend Solo
 * is deliberately not one of them any more, so the Ascend ladder opened at
 * Team ($397) with its entry tier missing entirely and no trial offered
 * anywhere — the only `unified` plan still carrying a trial is the retired
 * duplicate, and it is switched off on purpose.
 *
 * Solo is therefore presented from THIS contract, the same one `/start`
 * displays and the same one the authenticated checkout charges, rather than
 * by re-enabling that duplicate plan. `ctaHref` sends the button to `/start`,
 * which remains the only place a trial can begin.
 *
 * WHAT THIS CARD MAY CLAIM. A Solo workspace is provisioned by
 * `lib/workspace/provision-ascend-operations.ts`, which turns funnels and
 * websites ON and every spend-capable channel OFF. So broadcasts, WhatsApp,
 * outbound calling, the social planner, the Meta inbox, custom domains,
 * funnel checkout, a dedicated sending domain and API access are absent here
 * by design, not by oversight — they are real Team/Agency differentiators and
 * listing them on Solo would be selling something the provisioner does not
 * grant. Labels are reused verbatim from `lib/billing/plan-presentation.ts`
 * so the three cards read as one ladder rather than three authors.
 */
export const ASCEND_SOLO_CARD = {
  id: ASCEND_SOLO_OFFER.product,
  name: ASCEND_SOLO_OFFER.name,
  description:
    "Everything one operator needs: the intelligence that finds the constraint, and the CRM that acts on it.",
  priceMonthlyCents: ASCEND_SOLO_OFFER.priceMonthlyCents,
  currency: ASCEND_SOLO_OFFER.currency,
  trialDays: ASCEND_SOLO_OFFER.trialDays,
  ctaHref: "/start",
  highlights: [
    "Funnels & landing pages",
    "Automated lead follow-up",
    "CRM & sales pipelines",
    "Forms & lead capture",
    "Booking & scheduling",
    "Growth Intelligence",
    "Marketing Content & Assets",
    "Zeno Growth Strategist",
  ],
  alsoIncluded: [
    "Workflows & automations",
    "Growth Scans & prioritized recommendations",
    "Website builder",
    "Reporting & conversion measurement",
    "Single sign-on between Ascend and the CRM",
  ],
  allowances: [
    { label: "Business workspace", value: "1" },
    { label: "Growth Scans / month", value: "15" },
    {
      label: "Marketing Content & Assets",
      value: "50 creations/mo",
      note: "Lead magnets, page copy, VSLs, scripts, proposals, content plans & more.",
    },
  ],
} as const;
