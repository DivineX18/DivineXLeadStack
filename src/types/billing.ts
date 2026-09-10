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
  "funnelsEnabledByAgency",
  "customDomainsEnabledByAgency",
  "funnelCheckoutEnabledByAgency",
  // Ascend OS — unlike every other key here (which each gate exactly one
  // Flow module/surface), this one also feeds
  // evaluate-workspace-entitlements.ts's `effectiveTier` computation: a
  // sub-account only reaches "full_ascend" (the Full Ascend shell at
  // /app/*) when BOTH this gate is on AND an active Ascend<->Flow
  // workspace mapping exists. See that file for the full formula.
  "ascendIntelligenceEnabledByAgency",
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
  funnelsEnabledByAgency: "Funnels",
  customDomainsEnabledByAgency: "Custom domains",
  funnelCheckoutEnabledByAgency: "Funnel checkout (Stripe)",
  ascendIntelligenceEnabledByAgency: "Zeno Growth Intelligence",
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
  /**
   * When true, this is the plan auto-assigned to every NEW sub-account the
   * agency owner creates — the workspace starts `billing.status: "pending"`
   * (walled for everyone except the owner) instead of the historical
   * `"comped"` default. At most one plan per agency carries this flag;
   * {@link setDefaultPlanForAgency} in the billing service enforces that.
   */
  isDefault: boolean;
  /**
   * When true, this plan is sold on the public marketing pricing page
   * (`/pricing` + the homepage pricing section) via self-serve Stripe
   * Checkout — a stranger can pay and get a brand-new sub-account
   * provisioned automatically, no agency-owner action needed. See
   * `createPublicSignupCheckoutSession` / `getPublicPlansForAgency`.
   */
  publicSelfServeEnabled: boolean;
  stripeProductId: string | null;
  stripePriceId: string | null;
  /**
   * Usage ceilings. `null` means "no limit recorded" — every plan created
   * before limits existed reads that way, and is deliberately treated as
   * unlimited so this change can never retroactively wall an existing
   * customer out of something they already paid for.
   *
   * WHY THESE FIVE. They are the only cost drivers that scale with use:
   * workspaces and AI generations drive model spend, email drives Resend
   * spend, websites drive the shared gitpage build quota. SMS and voice are
   * deliberately absent — those run on the customer's own Twilio, so they
   * cost the agency nothing and need no ceiling.
   *
   * Resolved and counted PER WORKSPACE, from the plan that workspace bought
   * (`billing.planId`). It was previously pooled at the agency, which is wrong
   * for self-serve, where every customer is a workspace under one agency.
   */
  limits?: PlanLimits;
  /**
   * Free-trial length in days for self-serve signup. `null`/absent = no trial,
   * which is what every existing plan reads as.
   *
   * The card IS collected at signup and the subscription simply starts in
   * Stripe's `trialing` state at $0 — so conversion is automatic at day 14 and
   * there is no second "now add a card" step to lose people at. Cancelling
   * during the trial prevents the first charge.
   */
  trialDays?: number | null;
  /**
   * Which product's pricing page sells this plan.
   *
   * One agency owns one plan collection, but this deployment sells two
   * products from it (Flow on crm.divinex.io, Unified on app.divinex.io).
   * Without this, every pricing page would list every plan and a Flow visitor
   * would be offered Unified tiers.
   *
   * Absent reads as "flow", which is what every plan created before this
   * existed actually is — so no existing plan changes where it appears.
   */
  product?: PlanProduct;
  createdAt: Timestamp | FieldValue | Date | null;
  updatedAt: Timestamp | FieldValue | Date | null;
}

/** The product surface a plan is sold on. */
export type PlanProduct = "flow" | "unified";

/**
 * A plan's usage ceilings. Every field is nullable and null means unlimited,
 * so a legacy plan document (which has none of them) behaves exactly as it
 * did before limits shipped.
 */
export interface PlanLimits {
  /** Client workspaces the agency may have at once. */
  maxSubAccounts: number | null;
  /** gitpage sites per workspace. Overridden per workspace by
   *  `SubAccountDoc.websiteMaxSites` when an owner grants an exception. */
  maxWebsites: number | null;
  /** Emails per calendar month, counted on this workspace. */
  maxEmailsPerMonth: number | null;
  /** Asset/copy generations per calendar month, counted on this workspace. */
  maxAiGenerationsPerMonth: number | null;
  /** Growth Scans per calendar month, pooled. Unified + Ascend only. */
  maxGrowthScansPerMonth: number | null;
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
  isDefault: boolean;
  publicSelfServeEnabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Public-safe plan shape for the marketing pricing page (`/api/public/plans`).
 * Deliberately excludes internal fields (raw gate keys, Stripe ids) — only
 * what a prospective buyer needs to decide and check out.
 */
export interface PublicPlanSummary {
  id: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  currency: string;
  /**
   * Customer-facing capability highlights, in customer-value order — see
   * `lib/billing/plan-presentation.ts`. NOT gate order, and not gate labels;
   * a buyer should never be reading our internal entitlement list.
   */
  highlights: string[];
  /** Real supporting capabilities, condensed into one line on the card. */
  alsoIncluded: string[];
  /** "How much can I use?" — the reason to move up a tier. */
  /** `note` is an optional one-line descriptor shown under the value. It
   *  exists for allowances whose unit is not self-explanatory: "creations"
   *  means nothing until a buyer knows what can be created. Entries carrying
   *  one span the full card width so the line stays readable. */
  allowances: { label: string; value: string; note?: string }[];
  /**
   * Free-trial days, or null when the plan has none. Public because the
   * pricing page must disclose the trial AND the price that begins after it
   * BEFORE checkout — a trial the customer only discovers on the Stripe page
   * is the kind of surprise that produces chargebacks.
   */
  trialDays: number | null;
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
