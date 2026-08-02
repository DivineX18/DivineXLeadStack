import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * One doc per completed funnel checkout (BYO-Stripe). Created directly at
 * "paid" status by the tenant webhook's checkout.session.completed
 * handler — Checkout Sessions in payment/subscription mode only fire that
 * event after payment actually clears, so there's no separate "pending"
 * state to model. `upsells` is an array (not a fixed pair) so an uncapped
 * post-purchase chain (added in a later slice) can append one entry per
 * accepted/declined/failed hop as the customer moves through it.
 */
export interface FunnelOrderUpsellEntry {
  funnelId: string;
  status: "accepted" | "declined" | "failed_requires_action";
  amountCents: number;
}

export type FunnelOrderStatus = "paid" | "refunded" | "partially_refunded" | "disputed";

export interface FunnelOrderDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  funnelId: string;
  sectionId: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
  currency: string;
  mainOrderAmountCents: number;
  bumpIncluded: boolean;
  bumpAmountCents: number;
  contactId: string | null;
  customerEmail: string | null;
  upsells: FunnelOrderUpsellEntry[];
  status: FunnelOrderStatus;
  refundedAmountCents: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
