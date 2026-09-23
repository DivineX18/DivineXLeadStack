import "server-only";

import type { PlanLimits } from "@/types/billing";

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
 * WHAT A SOLO WORKSPACE IS ACTUALLY ALLOWED, NOT JUST WHAT IT IS SOLD.
 *
 * An Ascend-provisioned workspace carries no `billing.planId`, because Ascend
 * grants it rather than Client Billing selling it. `resolvePlanLimits` reads
 * an absent plan as unlimited — correct and deliberate for the comped, legacy
 * and agency-owner workspaces that clause exists for, and wrong here, because
 * this one belongs to a paying $197 customer.
 *
 * It did not leak only because three gates ship off, so the metered Flow
 * routes were unreachable and the real ceiling lived on BI. That is one
 * checkbox in the agency Manage dialog away from unlimited Growth Scans,
 * unlimited asset generations and unlimited broadcast email on a $197
 * subscription — and flipping one of those gates for a customer who asks for
 * the Ascend shell inside Flow is an entirely reasonable thing for an
 * operator to do. The ceiling should not depend on nobody doing it.
 *
 * Scans and assets mirror BI's `professional` row, the row growth_system
 * resolves to, so the two systems meter the same customer to the same number
 * instead of disagreeing. Email mirrors the figure already authored for this
 * price point. Websites is MAX_WEBSITES_PER_SUBACCOUNT, which is what the
 * workspace would get anyway.
 *
 * Declared next to the card below ON PURPOSE: what we advertise and what we
 * enforce are two statements of the same fact, and keeping them apart is how
 * they drift.
 */
export const ASCEND_SOLO_WORKSPACE_LIMITS = {
  maxSubAccounts: 1,
  maxWebsites: 5,
  maxEmailsPerMonth: 25_000,
  maxAiGenerationsPerMonth: 50,
  maxGrowthScansPerMonth: 15,
} satisfies PlanLimits;

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
    // SOURCED, NOT ESTIMATED. The workspace count is what
    // provision-ascend-operations.ts actually creates (one). The website
    // figure is MAX_WEBSITES_PER_SUBACCOUNT, the cap a workspace carries
    // when no plan overrides it. The asset and scan figures are BI's own
    // `professional` plan_limits row (assetLimit 50, auditLimit 15), which
    // is the row growth_system resolves to through PRODUCT_TO_PLAN — so they
    // are the allowances this subscription is actually metered against
    // rather than a neighbouring tier's numbers borrowed by analogy.
    `${ASCEND_SOLO_WORKSPACE_LIMITS.maxSubAccounts} business workspace`,
    // Funnels carry no counter anywhere in the product, so this is a real
    // capability rather than a generous-sounding cap nobody enforces.
    "Unlimited funnels & landing pages",
    "Unlimited contacts",
    "Unlimited visitors",
    `${ASCEND_SOLO_WORKSPACE_LIMITS.maxWebsites} websites`,
    `${ASCEND_SOLO_WORKSPACE_LIMITS.maxAiGenerationsPerMonth} marketing assets a month in Asset Studio`,
    `${ASCEND_SOLO_WORKSPACE_LIMITS.maxGrowthScansPerMonth} Growth Scans a month`,
    "CRM & sales pipelines",
    "Forms & lead capture",
    "Booking & scheduling",
    "Automated lead follow-up",
    "Growth Intelligence",
    "Zeno Growth Strategist",
  ],
  alsoIncluded: [
    "Workflows & automations",
    "Reporting & conversion measurement",
    "Single sign-on between Ascend and the CRM",
  ],
  // The numbers live in the list now, so there is no second grid to keep in
  // step with it.
  allowances: [],
} as const;
