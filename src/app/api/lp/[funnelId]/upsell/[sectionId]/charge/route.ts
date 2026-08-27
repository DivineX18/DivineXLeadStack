import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { loadFunnelForRender } from "@/lib/funnels/load-funnel-for-render";
import { getStripeForTenant } from "@/lib/stripe/tenant-server";
import { checkCheckoutRateLimit } from "@/lib/funnels/checkout-rate-limit";
import { ipFromRequest } from "@/lib/contacts/location";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import type { UpsellOfferConfig } from "@/types/funnels";
import type { FunnelOrderDoc } from "@/types/funnel-orders";

/**
 * One-click upsell/downsell accept — public, unauthenticated (the
 * customer just came from the success redirect, no login). Charges the
 * SAME saved card from the original checkout off-session, per the
 * verified Stripe pattern: no re-entered card details.
 *
 * A `requires_action` response means Stripe wants 3DS/SCA re-auth, which
 * is impossible with the customer not actively present in a card form —
 * this degrades gracefully (marks the hop failed, tells the client) and
 * NEVER touches the original order's paid status.
 */

interface PostBody {
  checkoutSessionId?: string;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ funnelId: string; sectionId: string }> },
) {
  const { funnelId, sectionId } = await ctx.params;

  const ip = ipFromRequest(request) ?? "unknown";
  const rl = checkCheckoutRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    body = {};
  }
  if (!body.checkoutSessionId) {
    return NextResponse.json({ error: "Missing checkout session." }, { status: 400 });
  }

  const renderable = await loadFunnelForRender(funnelId);
  if (!renderable) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { funnel } = renderable;
  const section = funnel.sections.find((s) => s.id === sectionId);
  if (!section || section.type !== "upsell_offer") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const config = section.config as UpsellOfferConfig;

  const db = getAdminDb();
  const orderSnap = await db
    .collection("funnelOrders")
    .where("stripeCheckoutSessionId", "==", body.checkoutSessionId)
    .limit(1)
    .get();
  if (orderSnap.empty) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  const orderDoc = orderSnap.docs[0];
  const order = orderDoc.data() as FunnelOrderDoc;

  if (order.subAccountId !== funnel.subAccountId) {
    return NextResponse.json({ error: "Order mismatch." }, { status: 400 });
  }
  if (!order.stripeCustomerId || !order.stripePaymentMethodId) {
    return NextResponse.json(
      { error: "No saved card on file for this order." },
      { status: 400 },
    );
  }

  const tenant = await getStripeForTenant(funnel.subAccountId);
  if (!tenant) {
    return NextResponse.json({ error: "Payments aren't set up for this workspace." }, { status: 503 });
  }

  const nextUrlFor = (targetFunnelId: string | null | undefined) =>
    targetFunnelId
      ? `/lp/${targetFunnelId}?session_id=${body.checkoutSessionId}`
      : // End of the chain — the order-confirmation thank-you page
        // ("add the thank you after the checkout page").
        `/lp/${funnelId}/thanks?paid=1`;

  try {
    // Idempotency key tied to (checkout session, upsell section) — a retry
    // of THIS exact accept (network retry, double-click, a client resend)
    // reuses the same key so Stripe dedupes it into a single charge instead
    // of creating a second PaymentIntent against the same saved card. A
    // genuinely separate purchase always has a different checkoutSessionId,
    // so this never blocks a real second sale.
    const idempotencyKey = `funnel-upsell:${body.checkoutSessionId}:${sectionId}`;
    const paymentIntent = await tenant.stripe.paymentIntents.create(
      {
        amount: config.priceCents,
        currency: (config.currency ?? order.currency ?? "usd").toLowerCase(),
        customer: order.stripeCustomerId,
        payment_method: order.stripePaymentMethodId,
        // Off-session charges must be card-only — without this, Stripe falls
        // back to whatever payment methods are enabled in the tenant's own
        // Dashboard, and refuses to confirm without a return_url the moment
        // any redirect-based method (Cash App, Link, etc.) is enabled there.
        // A saved-card off-session charge can never use a redirect flow
        // anyway, so restricting to card is correct, not just a workaround.
        payment_method_types: ["card"],
        off_session: true,
        confirm: true,
      },
      { idempotencyKey },
    );

    if (paymentIntent.status === "requires_action" || paymentIntent.status === "requires_confirmation") {
      await orderDoc.ref.update({
        upsells: FieldValue.arrayUnion({
          funnelId,
          status: "failed_requires_action",
          amountCents: config.priceCents,
        }),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({
        ok: false,
        requiresAction: true,
        nextUrl: nextUrlFor(config.declineFunnelId),
      });
    }

    await orderDoc.ref.update({
      upsells: FieldValue.arrayUnion({
        funnelId,
        status: "accepted",
        amountCents: config.priceCents,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });

    void emitWebhookEvent({
      subAccountId: order.subAccountId,
      agencyId: order.agencyId,
      mode: "live",
      type: "funnel.upsell.accepted",
      payload: { orderId: orderDoc.id, funnelId, amountCents: config.priceCents },
    });

    return NextResponse.json({ ok: true, nextUrl: nextUrlFor(config.acceptNextFunnelId) });
  } catch (err) {
    // A hard decline (not requires_action) — record as failed, route to
    // the downsell/next step same as requires_action rather than error.
    await orderDoc.ref
      .update({
        upsells: FieldValue.arrayUnion({
          funnelId,
          status: "failed_requires_action",
          amountCents: config.priceCents,
        }),
        updatedAt: FieldValue.serverTimestamp(),
      })
      .catch(() => {});
    console.error(`[lp/${funnelId}/upsell/${sectionId}/charge] Stripe error:`, err);
    return NextResponse.json({
      ok: false,
      requiresAction: true,
      nextUrl: nextUrlFor(config.declineFunnelId),
    });
  }
}
