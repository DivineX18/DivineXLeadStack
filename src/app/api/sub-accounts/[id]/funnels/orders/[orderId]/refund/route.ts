import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getStripeForTenant } from "@/lib/stripe/tenant-server";
import type { FunnelOrderDoc } from "@/types/funnel-orders";

/**
 * Refund a funnel order (full or partial) through the tenant's own Stripe
 * account. Writes an optimistic status update immediately; the tenant
 * webhook's charge.refunded handler reconciles the authoritative final
 * state (same optimistic-then-webhook-confirms pattern used elsewhere for
 * async Stripe state in this codebase).
 *
 * POST body: { amountCents?: number } — omit for a full refund.
 */

interface PostBody {
  amountCents?: number;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; orderId: string }> },
) {
  const { id: subAccountId, orderId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (subSnap.data()?.funnelCheckoutEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "Funnel checkout isn't enabled for this workspace." },
      { status: 403 },
    );
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    body = {};
  }
  if (body.amountCents !== undefined && (!Number.isInteger(body.amountCents) || body.amountCents <= 0)) {
    return NextResponse.json({ error: "amountCents must be a positive integer." }, { status: 400 });
  }

  const orderRef = getAdminDb().doc(`funnelOrders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists || orderSnap.data()?.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const order = orderSnap.data() as FunnelOrderDoc;
  if (!order.stripePaymentIntentId) {
    return NextResponse.json({ error: "This order has no payment to refund." }, { status: 400 });
  }
  const totalCents = order.mainOrderAmountCents + order.bumpAmountCents;
  const alreadyRefunded = order.refundedAmountCents ?? 0;
  const remaining = totalCents - alreadyRefunded;
  if (remaining <= 0) {
    return NextResponse.json({ error: "This order is already fully refunded." }, { status: 400 });
  }
  const amount = body.amountCents ?? remaining;
  if (amount > remaining) {
    return NextResponse.json(
      { error: `Can't refund more than the remaining ${remaining} cents.` },
      { status: 400 },
    );
  }

  const tenant = await getStripeForTenant(subAccountId);
  if (!tenant) {
    return NextResponse.json({ error: "Stripe isn't connected for this workspace." }, { status: 503 });
  }

  try {
    await tenant.stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      amount,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't process the refund.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const newRefundedTotal = alreadyRefunded + amount;
  await orderRef.update({
    refundedAmountCents: newRefundedTotal,
    status: newRefundedTotal >= totalCents ? "refunded" : "partially_refunded",
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, refundedAmountCents: newRefundedTotal });
}
