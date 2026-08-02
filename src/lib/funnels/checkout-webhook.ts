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

  // Retrieve the PaymentIntent to capture the payment method actually used
  // — needed so a later upsell/downsell hop can off-session-charge the
  // same card without the customer re-entering details.
  let stripePaymentMethodId: string | null = null;
  if (typeof session.payment_intent === "string") {
    try {
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
      stripePaymentMethodId = typeof pi.payment_method === "string" ? pi.payment_method : null;
    } catch {
      // Non-fatal — the order still records; a later upsell just can't charge.
    }
  }

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
    stripePaymentMethodId,
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

async function findOrderByPaymentIntent(
  subAccountId: string,
  paymentIntentId: string | null,
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  if (!paymentIntentId) return null;
  const db = getAdminDb();
  const snap = await db
    .collection("funnelOrders")
    .where("subAccountId", "==", subAccountId)
    .where("stripePaymentIntentId", "==", paymentIntentId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

/** charge.refunded — reconciles the authoritative refund total from
 *  Stripe (the refund route already writes an optimistic update; this
 *  corrects for any drift, e.g. a refund issued directly in the Stripe
 *  Dashboard rather than through our route). */
export async function handleFunnelChargeRefunded(
  charge: Stripe.Charge,
  subAccountId: string,
): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  const doc = await findOrderByPaymentIntent(subAccountId, paymentIntentId);
  if (!doc) return;
  const order = doc.data() as FunnelOrderDoc;
  const totalCents = order.mainOrderAmountCents + order.bumpAmountCents;
  const refundedAmountCents = charge.amount_refunded ?? 0;
  await doc.ref.update({
    refundedAmountCents,
    status: refundedAmountCents >= totalCents ? "refunded" : "partially_refunded",
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** charge.dispute.created / charge.dispute.closed — visibility only, no
 *  in-app evidence submission (that stays in the tenant's own Stripe
 *  Dashboard, which they have direct access to). Best-effort Task so the
 *  operator notices without watching the Orders dashboard. */
export async function handleFunnelChargeDispute(
  dispute: Stripe.Dispute,
  subAccountId: string,
  closed: boolean,
): Promise<void> {
  const paymentIntentId =
    typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
  const doc = await findOrderByPaymentIntent(subAccountId, paymentIntentId);
  if (!doc) return;
  const order = doc.data() as FunnelOrderDoc;

  const nextStatus = closed
    ? dispute.status === "won"
      ? (order.refundedAmountCents > 0 ? "refunded" : "paid")
      : "disputed"
    : "disputed";
  await doc.ref.update({ status: nextStatus, updatedAt: FieldValue.serverTimestamp() });

  if (!closed) {
    try {
      const db = getAdminDb();
      await db.collection("tasks").add({
        title: `Dispute opened on funnel order (${(dispute.amount / 100).toFixed(2)} ${dispute.currency})`,
        notes: `Stripe dispute reason: ${dispute.reason}. Respond in your Stripe Dashboard — this platform doesn't submit evidence for you.`,
        dueAt: new Date(),
        completed: false,
        completedAt: null,
        contactId: order.contactId,
        dealId: null,
        eventId: null,
        agencyId: order.agencyId,
        subAccountId,
        createdByUid: "funnel-checkout-webhook",
        territoryId: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error(`[funnel-checkout] dispute task create failed sa=${subAccountId}`, err);
    }
  }
}
