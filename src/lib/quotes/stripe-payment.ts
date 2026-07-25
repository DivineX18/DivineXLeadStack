import "server-only";

import type Stripe from "stripe";

import { getAdminDb } from "@/lib/firebase/admin";
import { markQuotePaid } from "@/lib/quotes/lifecycle";
import type { Quote } from "@/types/quotes";

/**
 * metadata.kind value stamped on Stripe Checkout Sessions created for
 * paying a quote/invoice via card (see the public `/api/quotes/[token]/pay`
 * route). Routed inside the shared Stripe webhook handler
 * (src/lib/stripe/webhooks.ts) alongside its other metadata.kind branches —
 * never touches the founders / subAccountPlan / public-signup flows.
 */
export const QUOTE_INVOICE_PAYMENT_KIND = "quoteInvoicePayment";

/**
 * checkout.session.completed handler for a quote/invoice card payment.
 * Idempotent — re-delivered webhook events (Stripe retries on any non-2xx
 * response, and duplicates can land via dashboard "Resend") for an
 * already-paid quote are silently ignored rather than erroring.
 */
export async function handleQuoteInvoiceCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const quoteId = session.metadata?.quoteId;
  const subAccountId = session.metadata?.subAccountId;
  if (!quoteId || !subAccountId) {
    console.error(
      "[stripe/quote-payment] checkout.session.completed missing quoteId/subAccountId in metadata",
      session.id,
    );
    return;
  }

  const ref = getAdminDb().collection("quotes").doc(quoteId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(
      `[stripe/quote-payment] quote ${quoteId} not found for session ${session.id}`,
    );
    return;
  }
  const quote: Quote = { id: snap.id, ...(snap.data() as Omit<Quote, "id">) };
  if (quote.subAccountId !== subAccountId) {
    console.error(
      `[stripe/quote-payment] quote ${quoteId} subAccountId mismatch for session ${session.id}`,
    );
    return;
  }
  if (quote.status === "paid") {
    // Already paid — duplicate webhook delivery, or the operator marked
    // it paid manually in the meantime. Nothing to do.
    return;
  }

  await markQuotePaid(quote, { source: "stripe" });
}
