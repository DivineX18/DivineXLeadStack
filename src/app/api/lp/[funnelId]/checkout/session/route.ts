import "server-only";

import { NextResponse } from "next/server";
import { loadFunnelForRender } from "@/lib/funnels/load-funnel-for-render";
import { getStripeForTenant } from "@/lib/stripe/tenant-server";
import { checkCheckoutRateLimit } from "@/lib/funnels/checkout-rate-limit";
import { ipFromRequest } from "@/lib/contacts/location";
import { FUNNEL_ORDER_KIND } from "@/lib/funnels/constants";
import type { CheckoutConfig } from "@/types/funnels";

/**
 * Public, unauthenticated — the funnelId + sectionId are the only
 * "credentials" needed, same trust model as /api/forms/[id]/submit.
 * Creates a Stripe Checkout Session on the TENANT's own Stripe account
 * (never the platform's) and returns the hosted-page URL to redirect to.
 *
 * The order bump (if present) rides Stripe's native `optional_items` —
 * Stripe renders its own checkbox on the hosted page, so this route never
 * needs to know whether the visitor wants it; it's just offered.
 */

interface PostBody {
  sectionId?: string;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ funnelId: string }> },
) {
  const { funnelId } = await ctx.params;

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

  const renderable = await loadFunnelForRender(funnelId);
  if (!renderable) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { funnel } = renderable;

  const section = body.sectionId
    ? funnel.sections.find((s) => s.id === body.sectionId)
    : funnel.sections.find((s) => s.type === "checkout");
  if (!section || section.type !== "checkout") {
    return NextResponse.json({ error: "Checkout section not found" }, { status: 404 });
  }
  const config = section.config as CheckoutConfig;
  if (config.checkoutMode !== "stripe_checkout" || !config.stripePriceId) {
    return NextResponse.json({ error: "This offer isn't set up for checkout yet." }, { status: 400 });
  }

  const tenant = await getStripeForTenant(funnel.subAccountId);
  if (!tenant) {
    return NextResponse.json(
      { error: "Payments aren't set up for this workspace." },
      { status: 503 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  // Multistep handoff (closes the documented Funnel Checkout gap): when this
  // checkout section names an upsell step, the buyer lands DIRECTLY on it
  // after paying — session_id in the URL is what the upsell page's one-click
  // charge reads. No upsell configured = today's return-to-page behavior.
  const successUrl = config.upsellFunnelId
    ? `${appUrl}/lp/${config.upsellFunnelId}?session_id={CHECKOUT_SESSION_ID}`
    : `${appUrl}/lp/${funnelId}/thanks?paid=1`;
  const cancelUrl = `${appUrl}/lp/${funnelId}`;

  const metadata = {
    kind: FUNNEL_ORDER_KIND,
    subAccountId: funnel.subAccountId,
    agencyId: funnel.agencyId,
    funnelId,
    sectionId: section.id,
  };

  try {
    const session = await tenant.stripe.checkout.sessions.create({
      mode: config.billingMode === "subscription" ? "subscription" : "payment",
      line_items: [{ price: config.stripePriceId, quantity: 1 }],
      ...(config.orderBump?.stripePriceId
        ? {
            optional_items: [
              { price: config.orderBump.stripePriceId, quantity: 1 },
            ],
          }
        : {}),
      ...(config.billingMode !== "subscription"
        ? { payment_intent_data: { setup_future_usage: "off_session", metadata } }
        : {}),
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });
    if (!session.url) {
      return NextResponse.json({ error: "Couldn't start checkout." }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(`[lp/${funnelId}/checkout/session] Stripe error:`, err);
    return NextResponse.json({ error: "Couldn't start checkout." }, { status: 502 });
  }
}
