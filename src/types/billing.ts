import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Client Billing v1 — agency → sub-account plans + paywall.
 *
 * The agency owner defines PLANS (a monthly price + a bundle of the existing
 * per-sub-account feature gates), assigns a plan to a sub-account, and the
 * client pays through the deployment's own Stripe account (one agency per
 * deployment — no Stripe Connect). Payment state lives on
 * `SubAccountDoc.billing`; plan docs live at `agencies/{agencyId}/plans`.
 *
 * Money is stored in integer cents (like `products.unitPriceCents`).
 */

/**
 * The feature gates a plan can bundle. Mirrors the agency Manage-dialog
 * gate set MINUS Get Leads (parked — see GET_LEADS_PARKED). Assigning /
 * activating a plan writes EXACTLY these fields on the sub-account doc,
 * so a plan is the single source of truth for a managed client's gates.
 * The `*HiddenWhenDisabled` presentation overrides are deliberately NOT
 * plan-managed — they stay manual.
 */
export const PLAN_GATE_KEYS = [
  "emailDomainEnabledByAgency",
  "apiAccessEnabledByAgency",
  "broadcastsEnabledByAgency",
  "outboundVoiceEnabledByAgency",
  "whatsappEnabledByAgency",
  "metaInboxEnabledByAgency",
  "websiteEnabledByAgency",
  "socialPlannerEnabledByAgency",
  "communityEnabledByAgency",
  "missedCallTextBackEnabledByAgency",
  "aiSuiteEnabledByAgency",
] as const;

export type PlanGateKey = (typeof PLAN_GATE_KEYS)[number];

/** Human labels for the plan configurator + manage dialog. */
export const PLAN_GATE_LABELS: Record<PlanGateKey, string> = {
  emailDomainEnabledByAgency: "Dedicated email sending domain",
  apiAccessEnabledByAgency: "Public API access",
  broadcastsEnabledByAgency: "Email broadcasts",
  outboundVoiceEnabledByAgency: "Outbound AI voice calls",
  whatsappEnabledByAgency: "WhatsApp channel",
  metaInboxEnabledByAgency: "Facebook + Instagram inbox",
  websiteEnabledByAgency: "Website builder",
  socialPlannerEnabledByAgency: "Social Planner",
  communityEnabledByAgency: "Community + Courses",
  missedCallTextBackEnabledByAgency: "Missed Call Text Back",
  aiSuiteEnabledByAgency: "AI Suite assistant",
};

/** Full gate bundle a plan carries — every key present, true = enabled. */
export type PlanGates = Record<PlanGateKey, boolean>;

export type BillingPlanStatus = "active" | "archived";

/**
 * One agency-defined subscription plan. Lives at
 * `agencies/{agencyId}/plans/{planId}` — server-only writes (Admin SDK via
 * /api/agency/plans); reads go through the same API, no client rules needed.
 *
 * Stripe linkage: creating a plan creates a Product + a recurring monthly
 * Price on the deployment's Stripe account. Editing the price creates a NEW
 * Stripe Price (prices are immutable) and deactivates the old one — existing
 * subscriptions stay on the price they signed up at.
 */
export interface BillingPlanDoc {
  id: string;
  agencyId: string;
  /** Display name, 1–60 chars (e.g. "Starter", "Pro"). */
  name: string;
  /** Optional short pitch shown to the agency (≤300 chars). */
  description: string | null;
  /** Monthly price in integer cents. Stripe minimum (~50¢) enforced at create. */
  priceMonthlyCents: number;
  /** Lowercase ISO 4217 (e.g. "usd", "aud"). Fixed after creation. */
  currency: string;
  gates: PlanGates;
  status: BillingPlanStatus;
  stripeProductId: string | null;
  stripePriceId: string | null;
  createdAt: Timestamp | FieldValue | Date | null;
  updatedAt: Timestamp | FieldValue | Date | null;
}

/** Wire shape returned by /api/agency/plans (timestamps → ISO strings). */
export interface BillingPlanResponse {
  id: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  currency: string;
  gates: PlanGates;
  status: BillingPlanStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Billing lifecycle of one sub-account:
 *   - "comped"    — not billed through the platform (the default for every
 *                   sub-account, including all pre-feature legacy docs, which
 *                   simply have no `billing` field). Gates stay manual.
 *   - "pending"   — a plan is assigned but the client hasn't paid yet. The
 *                   workspace shows an activation paywall to sub-account
 *                   members until checkout completes.
 *   - "active"    — paying subscription in good standing.
 *   - "past_due"  — a renewal failed. Members see a dunning banner while
 *                   `graceUntil` is in the future, then the hard paywall.
 *   - "canceled"  — subscription ended (Stripe cancel or dunning exhausted).
 *                   Hard paywall; data preserved; re-checkout reactivates.
 */
export type SubAccountBillingStatus =
  | "comped"
  | "pending"
  | "active"
  | "past_due"
  | "canceled";

/**
 * Per-sub-account billing state, stored at `SubAccountDoc.billing`.
 * Server-only writes (the subAccounts rules already deny all client writes);
 * readable by members like the rest of the doc so the paywall + settings
 * card can render without extra reads.
 */
export interface SubAccountBilling {
  status: SubAccountBillingStatus;
  planId: string | null;
  /** Denormalized for list UIs — refreshed on assign/activate. */
  planName: string | null;
  /** Effective monthly charge in cents (special price wins over plan price). */
  priceCents: number | null;
  currency: string | null;
  /** Per-client override; null = plan's standard price. */
  specialPriceCents: number | null;
  /**
   * The Stripe Price the checkout / subscription uses — the plan's standard
   * price or a one-off special price minted for this sub-account. Stamped at
   * assignment so /pay doesn't re-resolve the plan.
   */
  stripePriceId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /**
   * SHA-256 of the currently-valid checkout-link token (raw token only ever
   * lives in the emailed/copied URL — same discipline as quote tokens).
   * Rotated on every "send/copy link"; null once consumed by activation.
   */
  checkoutTokenHash: string | null;
  /**
   * End of the dunning grace window, stamped when the subscription first
   * goes past_due. Checked at request/render time (no cron): past_due +
   * graceUntil in the past = hard paywall. Cleared on recovery.
   */
  graceUntil: Timestamp | FieldValue | Date | null;
  assignedAt: Timestamp | FieldValue | Date | null;
  activatedAt: Timestamp | FieldValue | Date | null;
  updatedAt: Timestamp | FieldValue | Date | null;
}

/** Days of dunning grace after a renewal fails before the hard paywall. */
export const BILLING_GRACE_DAYS = 7;
