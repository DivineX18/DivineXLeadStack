import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { decryptSecret } from "@/lib/crypto/secrets";
import { getStripeForTenant } from "@/lib/stripe/tenant-server";
import {
  handleFunnelCheckoutCompleted,
  handleFunnelChargeRefunded,
  handleFunnelChargeDispute,
} from "@/lib/funnels/checkout-webhook";
import type { SubAccountStripeConfig } from "@/types/tenancy";

/**
 * Per-tenant Stripe webhook — verifies against THAT sub-account's own
 * decrypted webhook secret (never the shared platform STRIPE_WEBHOOK_SECRET
 * from src/app/api/webhooks/stripe/route.ts). Public path — security is
 * the signature check, not the session cookie. See middleware
 * PUBLIC_PATH_PATTERNS.
 *
 * Event handlers are added incrementally as later slices ship:
 *   - checkout.session.completed -> Slice 2 (funnelOrders creation)
 *   - charge.refunded, charge.dispute.* -> Slice 3
 *   - payment_intent.* -> Slice 4 (upsell/downsell off-session charges)
 * Until those land, recognized-but-unhandled events are acknowledged (200)
 * so Stripe doesn't retry-storm a route that's intentionally still a stub.
 */

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ subAccountId: string }> },
) {
  const { subAccountId } = await ctx.params;
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const stripeConfig = subSnap.data()?.stripeConfig as SubAccountStripeConfig | undefined;
  if (!stripeConfig) {
    return NextResponse.json({ error: "Not connected" }, { status: 404 });
  }

  const tenant = await getStripeForTenant(subAccountId);
  if (!tenant) {
    return NextResponse.json({ error: "Not connected" }, { status: 404 });
  }

  let event: Stripe.Event;
  try {
    const webhookSecret = decryptSecret(stripeConfig.webhookSecretEncrypted);
    event = tenant.stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[stripe/tenant/${subAccountId}] signature verification failed: ${message}`);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleFunnelCheckoutCompleted(
          tenant.stripe,
          event.data.object as Stripe.Checkout.Session,
          subAccountId,
        );
        break;
      case "charge.refunded":
        await handleFunnelChargeRefunded(event.data.object as Stripe.Charge, subAccountId);
        break;
      case "charge.dispute.created":
        await handleFunnelChargeDispute(event.data.object as Stripe.Dispute, subAccountId, false);
        break;
      case "charge.dispute.closed":
        await handleFunnelChargeDispute(event.data.object as Stripe.Dispute, subAccountId, true);
        break;
      // Off-session upsell/downsell charges land in Slice 4.
      default:
        console.log(`[stripe/tenant/${subAccountId}] unhandled event type: ${event.type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[stripe/tenant/${subAccountId}] handler failed: ${message}`);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
