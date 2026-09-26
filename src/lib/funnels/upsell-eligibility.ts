import type { FunnelOrderDoc } from "@/types/funnel-orders";

/**
 * Whether a one-click upsell may be charged to the saved card on an order.
 *
 * The public upsell endpoint's only credential is the checkout session id in the
 * page URL, and its only replay protection was Stripe's 24-hour idempotency key.
 * Anyone holding that URL could therefore re-trigger the charge later, and an
 * order that had since been refunded or disputed was still chargeable. So:
 *   - the order must actually be `paid`, and
 *   - an upsell already accepted on this order for this funnel is never charged again.
 * Pure (no I/O) so it can be tested exactly.
 */
export type UpsellEligibility =
  | { ok: true }
  | { ok: false; code: "order-not-paid" | "already-accepted" };

export function evaluateUpsellEligibility(
  order: Pick<FunnelOrderDoc, "status" | "upsells">,
  upsellFunnelId: string,
): UpsellEligibility {
  if (order.status !== "paid") return { ok: false, code: "order-not-paid" };
  const alreadyAccepted = (order.upsells ?? []).some(
    (u) => u.funnelId === upsellFunnelId && u.status === "accepted",
  );
  if (alreadyAccepted) return { ok: false, code: "already-accepted" };
  return { ok: true };
}
