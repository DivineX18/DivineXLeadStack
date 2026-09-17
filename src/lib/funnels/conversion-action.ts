/**
 * WHAT THE PRIMARY BUTTON IS FOR.
 *
 * The architecture diagnostic generated a $39 template kit, a $27 challenge and
 * a $9,000 program. All three ended in a lead-capture popup, because generation
 * has only ever composed one conversion mechanic: a form. The `checkout`
 * section type, BYO-Stripe and price materialization all existed and were never
 * reachable from a generated page.
 *
 * PRICE ALONE DOES NOT DECIDE THIS. A $9,000 engagement whose stated objective
 * is an application is correctly an application: asking a stranger for a card
 * number is the wrong ask, and the operator said so when they set the
 * objective. What decides it is the OBJECTIVE plus whether a real payment
 * destination exists.
 *
 * And a page never pretends. When the objective is a purchase but no checkout
 * is connected, this returns `capture_pending_checkout` — today's certified
 * behavior, plus an operator-facing note — rather than dressing a lead form as
 * a payment. Nothing here can invent a price, a Stripe account or a link.
 */

export type ConversionAction =
  /** Take the money: a real Stripe checkout on the tenant's own account. */
  | "checkout"
  /** Qualify first — the operator asked for an application before any call. */
  | "application"
  /** Put a time in the diary. */
  | "booking"
  /** Collect the lead. The certified default for everything unpriced. */
  | "capture"
  /** A purchase page with nowhere to pay. Captures, and says so. */
  | "capture_pending_checkout";

/** Objectives where the operator has said the next step is qualification or a
 *  diary slot, not a card. A price attached to these is the value of the
 *  engagement being discussed, never a checkout. */
const QUALIFY_FIRST_OBJECTIVES = new Set(["application", "consultation"]);
const BOOKING_OBJECTIVES = new Set(["appointment"]);

/** Genres whose whole point is a transaction when a price is present. */
const TRANSACTIONAL_GENRES = new Set(["tripwire", "challenge", "vsl"]);

/** Objectives that are explicitly a purchase, whatever the genre. */
const PURCHASE_OBJECTIVES = new Set(["purchase", "event_registration"]);

export interface ConversionActionInput {
  genre: string;
  /** The model/operator's stated conversion objective, when there is one. */
  objective?: string | null;
  priceCents?: number | null;
  /** A verified payment destination: the agency gate is on AND this
   *  sub-account's own Stripe account is connected. Never inferred here. */
  checkoutConfigured: boolean;
}

export interface ConversionActionDecision {
  action: ConversionAction;
  /** Why, in one line, for the audit trail and the operator note. */
  reason: string;
}

export function resolveConversionAction(input: ConversionActionInput): ConversionActionDecision {
  const objective = (input.objective ?? "").trim();
  const priced = (input.priceCents ?? 0) > 0;

  if (QUALIFY_FIRST_OBJECTIVES.has(objective)) {
    return { action: "application", reason: `objective is ${objective}, so the next step is qualification, not payment` };
  }
  if (BOOKING_OBJECTIVES.has(objective)) {
    return { action: "booking", reason: "objective is an appointment, so the next step is a booking" };
  }
  // A booking funnel books, whatever the objective field happens to say: its
  // entire purpose is a time in the diary.
  if (input.genre === "booking") {
    return { action: "booking", reason: "a booking funnel exists to put a time in the diary" };
  }
  // An application funnel is an application even when it names a fee.
  if (input.genre === "application") {
    return { action: "application", reason: "an application funnel qualifies before it sells" };
  }

  const purchaseIntended = priced && (PURCHASE_OBJECTIVES.has(objective) || TRANSACTIONAL_GENRES.has(input.genre));
  if (!purchaseIntended) {
    return {
      action: "capture",
      reason: priced ? "priced, but the objective is not a purchase" : "nothing is being sold on this page",
    };
  }

  return input.checkoutConfigured
    ? { action: "checkout", reason: "the objective is a purchase and this workspace has a connected checkout" }
    : {
        action: "capture_pending_checkout",
        reason: "the objective is a purchase but no checkout is connected, so the page collects leads instead",
      };
}

/** The operator-facing line for a purchase page that has nowhere to pay.
 *  Deliberately says what the page DOES do, so nobody assumes it is taking
 *  money. */
export const CHECKOUT_PENDING_NOTE =
  "This page sells something, but no checkout is connected yet, so the button collects leads instead of taking payment. " +
  "Connect Stripe under Settings to turn it into a real checkout.";

/* ─────────────────────────────────────────────────────────────────────────────
 * A PAGE MAKES ONE PROMISE ABOUT WHAT HAPPENS NEXT.
 *
 * The first cut of this converted the OFFER section to a real checkout and left
 * the hero and closing CTAs on the generic lead popup, so one page offered two
 * different next steps: pay here, or give us your email there. A visitor cannot
 * tell which one is the real one, and whichever they pick, the other was a lie
 * about the page's purpose.
 *
 * So the conversion action resolved above is a PAGE-level fact, and the primary
 * CTAs follow it. Secondary CTAs with a genuinely different job (a phone
 * number, a "see the agenda" link) are not primary and are not touched.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Sections whose CTA is a PRIMARY conversion control. */
export const PRIMARY_CTA_SECTIONS = ["hero", "offer", "cta_banner", "checkout", "ticket_tiers"] as const;

/**
 * CHECKOUT LANGUAGE IS A CAPABILITY CLAIM.
 *
 * A $39 page shipped the badge "Secure checkout" while the button collected an
 * email, because the model writes trust badges from the offer and nothing
 * checked them against what the page can actually DO. "Secure checkout" on a
 * page with no checkout is the same class of untruth as an invented rating: it
 * describes a capability the business does not have here.
 *
 * Deliberately narrow — it matches payment/checkout CAPABILITY language, not
 * every mention of money. "One-time $49" and "No credit card required" are
 * facts about the offer and survive; "Secure checkout" and "Instant purchase"
 * assert a payment surface that has to exist.
 */
const CHECKOUT_CAPABILITY_PATTERNS: RegExp[] = [
  /\bsecure\s+(?:checkout|payment|ordering|purchase)\b/i,
  /\bcheckout\b/i,
  /\bpayment\s+(?:secure|protected|processing|processed|encrypted|guaranteed)\b/i,
  /\b(?:ssl|256[\s-]?bit|encrypted)\s+(?:payment|checkout)\b/i,
  /\binstant\s+(?:purchase|payment)\b/i,
  /\bbuy\s+(?:securely|safely)\b/i,
  /\bpay\s+securely\b/i,
  /\bsecure\s+card\b/i,
];

/** Does this line claim the page can take a payment? */
export function assertsCheckoutCapability(text: string): boolean {
  return CHECKOUT_CAPABILITY_PATTERNS.some((re) => re.test(text));
}

/**
 * Remove capability claims a page cannot honour.
 *
 * Only ever called when the resolved action is NOT checkout, and it removes
 * rather than rewrites: substituting another assurance would be inventing a
 * different claim, and the visitor is not the right audience for "checkout is
 * not connected yet" either. The operator hears about it instead (see
 * CHECKOUT_PENDING_NOTE).
 */
export function stripCheckoutCapabilityClaims(lines: readonly string[]): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const line of lines) {
    if (assertsCheckoutCapability(line)) dropped.push(line);
    else kept.push(line);
  }
  return { kept, dropped };
}
