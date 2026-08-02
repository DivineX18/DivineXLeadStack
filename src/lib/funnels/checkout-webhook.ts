import "server-only";

import type Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { reconcileFunnelCheckoutContact } from "@/lib/funnels/contact-reconcile";
import { FUNNEL_ORDER_KIND } from "@/lib/funnels/constants";
import type { CheckoutConfig } from "@/types/funnels";
import type { FunnelOrderDoc } from "@/types/funnel-orders";

/**
 * checkout.session.completed handler for the tenant Stripe webhook.
 * Mirrors lib/quotes/stripe-payment.ts's shape: re-verify tenant match,
 * idempotency-check, then write. Checkout Sessions in payment/subscription
 * mode only fire this event once payment has actually cleared, so the
 * order doc is created directly at "paid" — no separate pending state.
 */
export async function handleFunnelCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  subAccountId: string,
): Promise<void> {
  const metadata = session.metadata ?? {};
  if (metadata.kind !== FUNNEL_ORDER_KIND || metadata.subAccountId !== subAccountId) {
    return;
  }
  const { funnelId, sectionId, agencyId } = metadata as Record<string, string>;
  if (!funnelId || !sectionId) return;

  const db = getAdminDb();

  // Idempotency — Stripe retries webhooks on non-2xx and can redeliver.
  const existing = await db
    .collection("funnelOrders")
    .where("stripeCheckoutSessionId", "==", session.id)
    .limit(1)
    .get();
  if (!existing.empty) return;

  const funnelSnap = await db.collection("funnels").doc(funnelId).get();
  if (!funnelSnap.exists) return;
  const sections = (funnelSnap.data()?.sections ?? []) as { id: string; type: string; config: unknown }[];
  const section = sections.find((s) => s.id === sectionId);
  const config = section?.type === "checkout" ? (section.config as CheckoutConfig) : null;

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
  const bumpPriceId = config?.orderBump?.stripePriceId ?? null;
  const bumpLineItem = bumpPriceId
    ? lineItems.data.find((li) => li.price?.id === bumpPriceId)
    : undefined;
  const bumpAmountCents = bumpLineItem?.amount_total ?? 0;
  const amountTotal = session.amount_total ?? 0;
  const mainOrderAmountCents = amountTotal - bumpAmountCents;

  const email = session.customer_details?.email ?? "";
  const name = session.customer_details?.name ?? "";

  let contactId: string | null = null;
  if (email) {
    const reconciled = await reconcileFunnelCheckoutContact({
      agencyId,
      subAccountId,
      email,
      name,
    });
    contactId = reconciled.id;
  }

  const orderRef = db.collection("funnelOrders").doc();
  const doc: Omit<FunnelOrderDoc, "id"> = {
    subAccountId,
    agencyId,
    funnelId,
    sectionId,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    stripePaymentMethodId: null,
    currency: (session.currency ?? "usd").toLowerCase(),
    mainOrderAmountCents,
    bumpIncluded: !!bumpLineItem,
    bumpAmountCents,
    contactId,
    customerEmail: email || null,
    upsells: [],
    status: "paid",
    refundedAmountCents: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await orderRef.set({ id: orderRef.id, ...doc });

  void emitWebhookEvent({
    subAccountId,
    agencyId,
    mode: "live",
    type: "funnel.order.completed",
    payload: {
      orderId: orderRef.id,
      funnelId,
      sectionId,
      contactId,
      customerEmail: email || null,
      currency: doc.currency,
      mainOrderAmountCents,
      bumpIncluded: doc.bumpIncluded,
      bumpAmountCents,
      totalAmountCents: amountTotal,
    },
  });
}
