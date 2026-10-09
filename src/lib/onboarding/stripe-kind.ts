/**
 * The metadata kind that marks a DIVINEX managed-services checkout.
 *
 * Its own module so the pure routing function can import it without pulling
 * in the server-only onboarding service, exactly as SUB_ACCOUNT_PLAN_KIND and
 * QUOTE_INVOICE_PAYMENT_KIND are kept importable by that same function.
 */
export const DIVINEX_ONBOARDING_KIND = "divinexOnboarding";

/** What the checkout-creation side must stamp. Named so a future caller
 *  cannot forget a field and produce a session that routes but cannot enroll. */
export interface DivinexOnboardingMetadata {
  kind: typeof DIVINEX_ONBOARDING_KIND;
  agencyId: string;
  packageId: string;
  businessName?: string;
}
