import type Stripe from "stripe";
import { SUB_ACCOUNT_PLAN_KIND } from "@/lib/server/billing-service";
import { PUBLIC_SELF_SERVE_SIGNUP_KIND } from "@/lib/server/public-signup-service";
import { QUOTE_INVOICE_PAYMENT_KIND } from "@/lib/quotes/stripe-payment";
import { DIVINEX_ONBOARDING_KIND } from "@/lib/onboarding/stripe-kind";

/**
 * Which product a completed Checkout Session belongs to.
 *
 * This exists as its own pure function for one reason: DivineX sells two
 * different $297/month things (Flow's Team plan and ASCEND's Team tier), and
 * a third-party reading Stripe would see two subscriptions with an identical
 * `amount_total`. Product identity therefore must never be derived from the
 * amount — it comes from metadata stamped at session-creation time, and the
 * per-workspace plan is then looked up by `planId`, not by price.
 *
 * Keeping the routing here (instead of inline `if` chains in the webhook)
 * means the collision invariant can be exercised against the real decision
 * rather than re-stated by a test.
 */
export type CheckoutRoute =
  | { route: "founders" }
  | { route: "subAccountPlan"; subAccountId: string | null; planId: string | null }
  | { route: "publicSelfServeSignup" }
  | { route: "quoteInvoicePayment" }
  /** A DIVINEX managed-services purchase. Enrolls a client for onboarding. */
  | { route: "divinexOnboarding"; agencyId: string | null; packageId: string | null }
  | { route: "legacyUserSubscription"; uid: string }
  | { route: "unroutable" };

export function classifyCheckoutSession(
  session: Pick<Stripe.Checkout.Session, "metadata">,
): CheckoutRoute {
  const metadata = session.metadata ?? {};

  if (metadata.kind === "founders") return { route: "founders" };

  if (metadata.kind === SUB_ACCOUNT_PLAN_KIND) {
    return {
      route: "subAccountPlan",
      subAccountId: metadata.subAccountId ?? null,
      planId: metadata.planId ?? null,
    };
  }

  if (metadata.kind === PUBLIC_SELF_SERVE_SIGNUP_KIND) {
    return { route: "publicSelfServeSignup" };
  }

  if (metadata.kind === QUOTE_INVOICE_PAYMENT_KIND) {
    return { route: "quoteInvoicePayment" };
  }

  // DIVINEX managed services. Reached ONLY by this exact kind, which is
  // stamped when the checkout is created. An ordinary ASCEND subscription
  // carries a different kind and is structurally incapable of arriving here,
  // whatever it costs or whatever its product is called.
  if (metadata.kind === DIVINEX_ONBOARDING_KIND) {
    return {
      route: "divinexOnboarding",
      agencyId: metadata.agencyId ?? null,
      packageId: metadata.packageId ?? null,
    };
  }

  const uid = metadata.uid;
  if (uid) return { route: "legacyUserSubscription", uid };

  return { route: "unroutable" };
}
