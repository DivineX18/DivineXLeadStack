import "server-only";

import type Stripe from "stripe";

/**
 * Mints (or reuses) a real Stripe Product + Price on the tenant's own
 * Stripe account for a funnel checkout/order-bump offer. Mirrors Client
 * Billing v1's plan-price-materialization flow
 * (lib/server/billing-service.ts) — Prices are immutable on Stripe, so a
 * changed price mints a NEW Price object and best-effort deactivates the
 * old one rather than mutating it in place.
 */
export interface PriceShape {
  productName: string;
  priceCents: number;
  currency: string; // lowercase ISO 4217
  billingMode: "one_time" | "subscription";
  recurringInterval?: "month" | "year";
}

export interface MaterializedPrice {
  stripeProductId: string;
  stripePriceId: string;
}

function shapesMatch(a: PriceShape, b: PriceShape): boolean {
  return (
    a.priceCents === b.priceCents &&
    a.currency === b.currency &&
    a.billingMode === b.billingMode &&
    (a.billingMode !== "subscription" || a.recurringInterval === b.recurringInterval)
  );
}

/**
 * `previous` is the last-known shape + ids for this offer (read from the
 * funnel doc before the patch was applied) — null/undefined for a
 * brand-new offer. Returns the ids to persist on the section config.
 */
export async function materializeCheckoutPrice(
  stripe: Stripe,
  next: PriceShape,
  previous: (PriceShape & { stripeProductId: string | null; stripePriceId: string | null }) | null,
): Promise<MaterializedPrice> {
  if (
    previous?.stripeProductId &&
    previous.stripePriceId &&
    shapesMatch(next, previous)
  ) {
    return {
      stripeProductId: previous.stripeProductId,
      stripePriceId: previous.stripePriceId,
    };
  }

  const productId =
    previous?.stripeProductId ??
    (await stripe.products.create({ name: next.productName })).id;

  if (previous?.stripeProductId && previous.productName !== next.productName) {
    await stripe.products.update(productId, { name: next.productName }).catch(() => {});
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: next.currency,
    unit_amount: next.priceCents,
    ...(next.billingMode === "subscription"
      ? { recurring: { interval: next.recurringInterval ?? "month" } }
      : {}),
  });

  if (previous?.stripePriceId && previous.stripePriceId !== price.id) {
    await stripe.prices.update(previous.stripePriceId, { active: false }).catch(() => {
      // Best-effort — the old price may already be inactive or gone.
    });
  }

  return { stripeProductId: productId, stripePriceId: price.id };
}
