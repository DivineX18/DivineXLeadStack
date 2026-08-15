import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Affiliate program — real, general-purpose, live on every deployment
 * (no longer gated to LANDING_VARIANT === "leadstack"; that gate made the
 * whole program dormant on any buyer clone / custom-branded deployment,
 * including this deployment's own crm.divinex.io).
 *
 * Commission policy (locked at 2026-08 launch):
 *  - Rate: 25% of each payment, per affiliate (commissionPct), recurring —
 *    credited on the customer's first payment AND every subsequent renewal
 *    for as long as they stay subscribed. Configurable per-affiliate so a
 *    future "partner tier" (e.g. 30% for top performers) needs no schema
 *    change, just a different value on that affiliate's row.
 *  - Attribution: last-click, 60-day cookie window.
 *  - Self-referral: blocked (buyer email === affiliate email → no credit).
 *  - Enrollment: self-serve signup (/affiliate) — anyone can become an
 *    affiliate, being a customer isn't required.
 *  - Payout: manual. The affiliate sets a payout email (PayPal) on their
 *    own dashboard; the agency owner sends payment out-of-band and marks
 *    each Referral paid with a free-text note. No Stripe Connect / payment
 *    rail integration.
 */

export type AffiliateStatus = "active" | "paused" | "banned";

export interface Affiliate {
  id: string;
  email: string;
  code: string;
  /** Display name, pulled from Stripe `customer_details.name` when available. */
  displayName: string | null;
  status: AffiliateStatus;
  /** Whole-number percentage of each payment credited (e.g. 25 = 25%). */
  commissionPct: number;
  /** Where the agency owner should send payout — set by the affiliate themselves. */
  payoutEmail: string | null;
  /** Lifetime totals — updated atomically when referral status changes. */
  referralCount: number;
  pendingCommissionCents: number;
  paidCommissionCents: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export type ReferralStatus = "pending" | "paid" | "voided";

/**
 * One row per unique-visitor-per-day-per-code. The doc id is a deterministic
 * composite so repeated visits from the same IP on the same day for the
 * same affiliate code collapse into a single doc — keeps Firestore writes
 * proportional to real reach instead of bot/spam traffic.
 */
export interface Click {
  id: string;
  affiliateCode: string;
  /** SHA-256 hash of visitor IP, salted with AUTOMATIONS_TOKEN_SECRET. */
  ipHash: string;
  userAgent: string;
  landingPath: string;
  referrer: string | null;
  /** YYYYMMDD for cheap aggregation queries. */
  dayKey: string;
  createdAt: Timestamp | FieldValue | null;
}

/**
 * One row per COMMISSION-EARNING PAYMENT, not per customer relationship —
 * a subscription that renews monthly produces a new Referral row every
 * renewal, all sharing `stripeCustomerId` so the UI can group them into
 * "this affiliate referred customer X, who has paid N times." This keeps
 * the payout mechanics (mark ONE Referral paid at a time) identical for a
 * one-time sale (Flow's founders cohort — exactly one row, ever) and a
 * recurring subscription (Ascend — one row per billing cycle).
 */
export interface Referral {
  id: string;
  /** Doc id of the affiliate that earned this commission. */
  affiliateId: string;
  /** Their code at the time of attribution — denormalized for analytics. */
  affiliateCode: string;
  /** Groups every charge from the same referred customer together. */
  stripeCustomerId: string;
  /** Checkout session id (first payment) or invoice id (renewal). */
  stripePaymentReference: string;
  /** False for the first payment, true for every renewal after it. */
  isRecurringCharge: boolean;
  /** Buyer email captured from Stripe customer_details. */
  buyerEmail: string;
  /** Amount actually paid on this specific charge. */
  amountPaidCents: number;
  /** Commission owed to the affiliate for THIS charge, computed at credit time. */
  commissionCents: number;
  status: ReferralStatus;
  /** Set by the agency owner when the payout is sent. */
  paidOutAt: Timestamp | FieldValue | null;
  /** Free-text note attached when marking paid (e.g. "PayPal txn ABC123"). */
  paidOutNote: string | null;
  createdAt: Timestamp | FieldValue | null;
}

/** Server-only session row backing an affiliate's signed-in dashboard state.
 *  Not Firebase Auth — affiliates aren't CRM users. Only the SHA-256 hash of
 *  the session token is stored, same discipline as the magic-link tokens. */
export interface AffiliateSession {
  id: string;
  affiliateId: string;
  tokenHash: string;
  expiresAt: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue | null;
}
