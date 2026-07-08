import "server-only";

import type Stripe from "stripe";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import { applyFeatureGates } from "@/lib/server/feature-gates-service";
import { issueCheckoutToken, buildCheckoutUrl } from "@/lib/billing/token";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import {
  BILLING_GRACE_DAYS,
  PLAN_GATE_KEYS,
  type BillingPlanDoc,
  type BillingPlanResponse,
  type PlanGates,
  type SubAccountBilling,
  type SubAccountBillingStatus,
} from "@/types/billing";

/**
 * Client Billing v1 service — the single write path for agency plans
 * (`agencies/{agencyId}/plans/{planId}`) and per-sub-account billing state
 * (`subAccounts/{id}.billing`). Charges run on the deployment's own Stripe
 * account (one agency per deployment — no Connect). Auth stays with the
 * callers (owner-gated routes + the signature-verified Stripe webhook);
 * this module trusts its inputs.
 *
 * Stripe linkage:
 *   - plan create  → Product + recurring monthly Price
 *   - price edit   → NEW Price (immutable), old one deactivated; existing
 *                    subscriptions keep the price they signed up at
 *   - special price → one-off Price on the plan's Product, scoped to one
 *                    sub-account via metadata
 *   - checkout     → mode:"subscription", `metadata.kind = "subAccountPlan"`
 *                    stamped on BOTH the session and the subscription so the
 *                    webhook can route without ever colliding with the
 *                    legacy founders / user-subscription branches
 */

export const SUB_ACCOUNT_PLAN_KIND = "subAccountPlan";

/** Stripe's practical floor for a recurring charge, in cents. */
const MIN_PRICE_CENTS = 100;
const MAX_PRICE_CENTS = 100_000_000;

export function billingStripeIsConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.trim();
}

export class BillingError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BillingError";
    this.status = status;
  }
}

function plansCollection(agencyId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/plans`);
}

/**
 * Append-only billing audit trail (top-level `billingEvents`, mirroring the
 * aiSuiteActions pattern): one row per assignment, comp, activation, and
 * dunning transition, so "who put this client on what, when" is answerable
 * without spelunking Stripe. Best-effort — never blocks the primary write.
 */
function recordBillingEvent(entry: {
  agencyId: string;
  subAccountId: string;
  event:
    | "plan.assigned"
    | "plan.switched"
    | "comped"
    | "activated"
    | "status.changed";
  detail: Record<string, unknown>;
}): void {
  getAdminDb()
    .collection("billingEvents")
    .add({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
    })
    .catch((err) =>
      console.warn("[billing] failed to record billing event", err),
    );
}

function tsToIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function serializePlan(
  id: string,
  data: FirebaseFirestore.DocumentData,
): BillingPlanResponse {
  const gates = {} as PlanGates;
  for (const key of PLAN_GATE_KEYS) {
    gates[key] = data.gates?.[key] === true;
  }
  return {
    id,
    name: String(data.name ?? ""),
    description: (data.description as string | null) ?? null,
    priceMonthlyCents: Number(data.priceMonthlyCents ?? 0),
    currency: String(data.currency ?? "usd"),
    gates,
    status: data.status === "archived" ? "archived" : "active",
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
}

/** Normalize an untrusted gates payload into a full PlanGates record. */
export function normalizePlanGates(input: unknown): PlanGates {
  const source = (input ?? {}) as Record<string, unknown>;
  const gates = {} as PlanGates;
  for (const key of PLAN_GATE_KEYS) {
    gates[key] = source[key] === true;
  }
  return gates;
}

export function validatePlanPricing(
  priceMonthlyCents: unknown,
  currency: unknown,
): { priceMonthlyCents: number; currency: string } {
  if (
    typeof priceMonthlyCents !== "number" ||
    !Number.isInteger(priceMonthlyCents) ||
    priceMonthlyCents < MIN_PRICE_CENTS ||
    priceMonthlyCents > MAX_PRICE_CENTS
  ) {
    throw new BillingError(
      `priceMonthlyCents must be an integer between ${MIN_PRICE_CENTS} and ${MAX_PRICE_CENTS}.`,
    );
  }
  const cur = typeof currency === "string" ? currency.trim().toLowerCase() : "";
  if (!/^[a-z]{3}$/.test(cur)) {
    throw new BillingError(
      'currency must be a 3-letter ISO code (e.g. "usd", "aud").',
    );
  }
  return { priceMonthlyCents, currency: cur };
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function listPlansForAgency(
  agencyId: string,
): Promise<BillingPlanResponse[]> {
  const snap = await plansCollection(agencyId).get();
  return snap.docs
    .map((d) => serializePlan(d.id, d.data()))
    .sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents);
}

export async function createPlanForAgency(input: {
  agencyId: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  currency: string;
  gates: PlanGates;
}): Promise<BillingPlanResponse> {
  if (!billingStripeIsConfigured()) {
    throw new BillingError(
      "Stripe isn't configured on this deployment. Set STRIPE_SECRET_KEY to create plans.",
      503,
    );
  }
  const stripe = getStripeServer();
  const ref = plansCollection(input.agencyId).doc();

  const product = await stripe.products.create({
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    metadata: {
      kind: SUB_ACCOUNT_PLAN_KIND,
      agencyId: input.agencyId,
      planId: ref.id,
    },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: input.priceMonthlyCents,
    currency: input.currency,
    recurring: { interval: "month" },
    metadata: { planId: ref.id },
  });

  await ref.set({
    id: ref.id,
    agencyId: input.agencyId,
    name: input.name,
    description: input.description,
    priceMonthlyCents: input.priceMonthlyCents,
    currency: input.currency,
    gates: input.gates,
    status: "active",
    stripeProductId: product.id,
    stripePriceId: price.id,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return serializePlan(ref.id, snap.data() ?? {});
}

export async function updatePlanForAgency(input: {
  agencyId: string;
  planId: string;
  name?: string;
  description?: string | null;
  priceMonthlyCents?: number;
  gates?: PlanGates;
  status?: "active" | "archived";
}): Promise<BillingPlanResponse> {
  const ref = plansCollection(input.agencyId).doc(input.planId);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError("Plan not found", 404);
  const plan = snap.data() as BillingPlanDoc & Record<string, unknown>;

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (typeof input.name === "string") updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.gates) updates.gates = input.gates;
  if (input.status) updates.status = input.status;

  const stripe = billingStripeIsConfigured() ? getStripeServer() : null;

  // Price change → mint a NEW Stripe Price and deactivate the old one.
  // Existing subscriptions keep the price they signed up at (standard
  // Stripe behavior); only new checkouts see the new amount.
  if (
    typeof input.priceMonthlyCents === "number" &&
    input.priceMonthlyCents !== plan.priceMonthlyCents
  ) {
    if (!stripe || !plan.stripeProductId) {
      throw new BillingError(
        "Stripe isn't configured — can't change the plan price.",
        503,
      );
    }
    const price = await stripe.prices.create({
      product: plan.stripeProductId,
      unit_amount: input.priceMonthlyCents,
      currency: plan.currency,
      recurring: { interval: "month" },
      metadata: { planId: input.planId },
    });
    if (plan.stripePriceId) {
      await stripe.prices
        .update(plan.stripePriceId, { active: false })
        .catch((err) =>
          console.warn("[billing] failed to deactivate old price", err),
        );
    }
    updates.priceMonthlyCents = input.priceMonthlyCents;
    updates.stripePriceId = price.id;
  }

  // Keep the Stripe Product's display fields in sync (best-effort).
  if (
    stripe &&
    plan.stripeProductId &&
    (typeof input.name === "string" || input.description !== undefined)
  ) {
    await stripe.products
      .update(plan.stripeProductId, {
        ...(typeof input.name === "string" ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description ?? "" }
          : {}),
      })
      .catch((err) =>
        console.warn("[billing] failed to sync Stripe product", err),
      );
  }

  // Archive → deactivate the standard price so no new checkout can use it.
  if (input.status === "archived" && stripe && plan.stripePriceId) {
    await stripe.prices
      .update(plan.stripePriceId, { active: false })
      .catch((err) =>
        console.warn("[billing] failed to deactivate archived price", err),
      );
  }

  await ref.update(updates);

  // Gate edits propagate to every sub-account currently ON this plan —
  // the plan is the source of truth for a managed client's gates. Comped /
  // unmanaged sub-accounts are untouched.
  if (input.gates) {
    const subs = await getAdminDb()
      .collection("subAccounts")
      .where("billing.planId", "==", input.planId)
      .get();
    for (const doc of subs.docs) {
      if (doc.data().agencyId !== input.agencyId) continue;
      const status = doc.data().billing?.status as
        | SubAccountBillingStatus
        | undefined;
      // Pending clients get gates at activation; everyone else re-applies now.
      if (status === "active" || status === "past_due") {
        await applyFeatureGates(doc.id, input.gates).catch((err) =>
          console.warn(
            `[billing] gate re-apply failed for sub-account ${doc.id}`,
            err,
          ),
        );
      }
    }
  }

  const updated = await ref.get();
  return serializePlan(ref.id, updated.data() ?? {});
}

async function getPlanOrThrow(
  agencyId: string,
  planId: string,
): Promise<BillingPlanDoc> {
  const snap = await plansCollection(agencyId).doc(planId).get();
  if (!snap.exists) throw new BillingError("Plan not found", 404);
  return { ...(snap.data() as BillingPlanDoc), id: snap.id };
}

// ---------------------------------------------------------------------------
// Assignment / comp / checkout links
// ---------------------------------------------------------------------------

async function getSubInAgencyOrThrow(agencyId: string, subAccountId: string) {
  const ref = getAdminDb().doc(`subAccounts/${subAccountId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.agencyId !== agencyId) {
    throw new BillingError("Sub-account not found", 404);
  }
  return { ref, data: snap.data() as Record<string, unknown> };
}

function readBilling(
  data: Record<string, unknown>,
): SubAccountBilling | null {
  return (data.billing as SubAccountBilling | null | undefined) ?? null;
}

/**
 * Resolve the Stripe Price a checkout/subscription should use: the plan's
 * standard price, or a freshly-minted one-off "special price" scoped to
 * this sub-account (GHL's per-client Special Price).
 */
async function resolveStripePrice(
  plan: BillingPlanDoc,
  subAccountId: string,
  specialPriceCents: number | null,
): Promise<string> {
  if (!plan.stripePriceId || !plan.stripeProductId) {
    throw new BillingError(
      "This plan has no Stripe price — recreate it with Stripe configured.",
      500,
    );
  }
  if (specialPriceCents === null) return plan.stripePriceId;
  const stripe = getStripeServer();
  const price = await stripe.prices.create({
    product: plan.stripeProductId,
    unit_amount: specialPriceCents,
    currency: plan.currency,
    recurring: { interval: "month" },
    metadata: { planId: plan.id, specialForSubAccountId: subAccountId },
  });
  return price.id;
}

export interface AssignPlanResult {
  status: SubAccountBillingStatus;
  /** Fresh checkout URL (only when the sub-account still needs to pay). */
  checkoutUrl: string | null;
}

/**
 * Assign (or switch) a plan.
 *
 *  - No live subscription → billing goes "pending" + a fresh checkout link
 *    is minted. Gates apply at activation, not before.
 *  - Live subscription (active/past_due) → the Stripe subscription's single
 *    item is moved to the new price (prorated) and the new plan's gates
 *    apply immediately.
 */
export async function assignPlanToSubAccount(input: {
  agencyId: string;
  subAccountId: string;
  planId: string;
  specialPriceCents: number | null;
}): Promise<AssignPlanResult> {
  if (!billingStripeIsConfigured()) {
    throw new BillingError(
      "Stripe isn't configured on this deployment. Set STRIPE_SECRET_KEY first.",
      503,
    );
  }
  const plan = await getPlanOrThrow(input.agencyId, input.planId);
  if (plan.status !== "active") {
    throw new BillingError("This plan is archived — unarchive it or pick another.");
  }
  if (input.specialPriceCents !== null) {
    if (
      !Number.isInteger(input.specialPriceCents) ||
      input.specialPriceCents < MIN_PRICE_CENTS ||
      input.specialPriceCents > MAX_PRICE_CENTS
    ) {
      throw new BillingError("specialPriceCents is out of range.");
    }
  }

  const { ref, data } = await getSubInAgencyOrThrow(
    input.agencyId,
    input.subAccountId,
  );
  const billing = readBilling(data);
  const priceCents = input.specialPriceCents ?? plan.priceMonthlyCents;
  const stripePriceId = await resolveStripePrice(
    plan,
    input.subAccountId,
    input.specialPriceCents,
  );

  const hasLiveSubscription =
    !!billing?.stripeSubscriptionId &&
    (billing.status === "active" || billing.status === "past_due");

  if (hasLiveSubscription) {
    // Plan switch on a live subscription: move the single item to the new
    // price with standard prorations.
    const stripe = getStripeServer();
    const sub = await stripe.subscriptions.retrieve(
      billing.stripeSubscriptionId as string,
    );
    const item = sub.items.data[0];
    if (!item) {
      throw new BillingError(
        "The Stripe subscription has no items — resolve it in the Stripe dashboard.",
        500,
      );
    }
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: stripePriceId }],
      proration_behavior: "create_prorations",
      metadata: {
        kind: SUB_ACCOUNT_PLAN_KIND,
        agencyId: input.agencyId,
        subAccountId: input.subAccountId,
        planId: plan.id,
      },
    });

    await ref.update({
      "billing.planId": plan.id,
      "billing.planName": plan.name,
      "billing.priceCents": priceCents,
      "billing.currency": plan.currency,
      "billing.specialPriceCents": input.specialPriceCents,
      "billing.stripePriceId": stripePriceId,
      "billing.updatedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await applyFeatureGates(input.subAccountId, plan.gates);

    recordBillingEvent({
      agencyId: input.agencyId,
      subAccountId: input.subAccountId,
      event: "plan.switched",
      detail: { planId: plan.id, planName: plan.name, priceCents },
    });
    void emitWebhookEvent({
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
      mode: "live",
      type: "billing.plan.assigned",
      payload: {
        subAccountId: input.subAccountId,
        planId: plan.id,
        planName: plan.name,
        priceCents,
        currency: plan.currency,
        status: billing?.status ?? "active",
      },
    });
    return { status: billing?.status ?? "active", checkoutUrl: null };
  }

  // Fresh assignment (or re-assignment after cancel): pending + link.
  const { token, hash } = issueCheckoutToken(input.subAccountId);
  const next: Record<string, unknown> = {
    billing: {
      status: "pending" satisfies SubAccountBillingStatus,
      planId: plan.id,
      planName: plan.name,
      priceCents,
      currency: plan.currency,
      specialPriceCents: input.specialPriceCents,
      stripePriceId,
      stripeCustomerId: billing?.stripeCustomerId ?? null,
      stripeSubscriptionId: null,
      checkoutTokenHash: hash,
      graceUntil: null,
      assignedAt: FieldValue.serverTimestamp(),
      activatedAt: billing?.activatedAt ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.update(next);

  recordBillingEvent({
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    event: "plan.assigned",
    detail: {
      planId: plan.id,
      planName: plan.name,
      priceCents,
      specialPriceCents: input.specialPriceCents,
    },
  });
  void emitWebhookEvent({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    mode: "live",
    type: "billing.plan.assigned",
    payload: {
      subAccountId: input.subAccountId,
      planId: plan.id,
      planName: plan.name,
      priceCents,
      currency: plan.currency,
      status: "pending",
    },
  });

  return { status: "pending", checkoutUrl: buildCheckoutUrl(token) };
}

/**
 * Mark a sub-account comped: cancel any live Stripe subscription
 * immediately and return gate control to manual. Data + gates untouched.
 */
export async function compSubAccount(input: {
  agencyId: string;
  subAccountId: string;
}): Promise<void> {
  const { ref, data } = await getSubInAgencyOrThrow(
    input.agencyId,
    input.subAccountId,
  );
  const billing = readBilling(data);

  if (billing?.stripeSubscriptionId && billingStripeIsConfigured()) {
    await getStripeServer()
      .subscriptions.cancel(billing.stripeSubscriptionId)
      .catch((err) => {
        // Already-canceled/missing subscriptions shouldn't block the comp.
        console.warn("[billing] cancel-on-comp failed (continuing)", err);
      });
  }

  await ref.update({
    billing: {
      status: "comped" satisfies SubAccountBillingStatus,
      planId: null,
      planName: null,
      priceCents: null,
      currency: null,
      specialPriceCents: null,
      stripePriceId: null,
      stripeCustomerId: billing?.stripeCustomerId ?? null,
      stripeSubscriptionId: null,
      checkoutTokenHash: null,
      graceUntil: null,
      assignedAt: billing?.assignedAt ?? null,
      activatedAt: billing?.activatedAt ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });

  recordBillingEvent({
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    event: "comped",
    detail: {
      previousStatus: billing?.status ?? null,
      canceledSubscription: billing?.stripeSubscriptionId ?? null,
    },
  });
}

/** Rotate the checkout token and return a fresh /pay URL. */
export async function mintCheckoutLink(input: {
  agencyId: string;
  subAccountId: string;
}): Promise<string> {
  const { ref, data } = await getSubInAgencyOrThrow(
    input.agencyId,
    input.subAccountId,
  );
  const billing = readBilling(data);
  if (!billing || billing.status === "comped" || !billing.planId) {
    throw new BillingError("Assign a plan before generating a checkout link.");
  }
  if (billing.status === "active") {
    throw new BillingError(
      "This client already has an active subscription — use the billing portal for card changes.",
    );
  }
  const { token, hash } = issueCheckoutToken(input.subAccountId);
  await ref.update({
    "billing.checkoutTokenHash": hash,
    "billing.updatedAt": FieldValue.serverTimestamp(),
  });
  return buildCheckoutUrl(token);
}

// ---------------------------------------------------------------------------
// Checkout session (used by /pay/[token] and the in-app activation screen)
// ---------------------------------------------------------------------------

export async function createSubAccountCheckoutSession(input: {
  subAccountId: string;
  /** Where Stripe returns the buyer. */
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  if (!billingStripeIsConfigured()) {
    throw new BillingError("Stripe isn't configured on this deployment.", 503);
  }
  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${input.subAccountId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError("Sub-account not found", 404);
  const data = snap.data() as Record<string, unknown>;
  const billing = readBilling(data);

  if (!billing || !billing.planId || !billing.stripePriceId) {
    throw new BillingError("No plan is assigned to this workspace.", 409);
  }
  if (billing.status === "active") {
    throw new BillingError("This subscription is already active.", 409);
  }
  if (billing.status === "comped") {
    throw new BillingError("This workspace isn't billed through checkout.", 409);
  }

  const stripe = getStripeServer();
  const agencyId = String(data.agencyId ?? "");

  // One Stripe customer per sub-account, reused across re-checkouts so
  // payment history stays attached to the client.
  let customerId = billing.stripeCustomerId;
  if (!customerId) {
    const contact = data.accountContact as {
      name?: string | null;
      email?: string | null;
    } | null;
    const customer = await stripe.customers.create({
      name: String(data.name ?? "Sub-account"),
      ...(contact?.email ? { email: contact.email } : {}),
      metadata: {
        kind: SUB_ACCOUNT_PLAN_KIND,
        agencyId,
        subAccountId: input.subAccountId,
      },
    });
    customerId = customer.id;
    await ref.update({
      "billing.stripeCustomerId": customerId,
      "billing.updatedAt": FieldValue.serverTimestamp(),
    });
  }

  const metadata = {
    kind: SUB_ACCOUNT_PLAN_KIND,
    agencyId,
    subAccountId: input.subAccountId,
    planId: billing.planId,
  };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: billing.stripePriceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata,
    subscription_data: { metadata },
  });
  if (!session.url) {
    throw new BillingError("Stripe did not return a checkout URL.", 502);
  }
  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Stripe webhook handlers (called from lib/stripe/webhooks.ts routing)
// ---------------------------------------------------------------------------

/** checkout.session.completed with metadata.kind === "subAccountPlan". */
export async function handleSubAccountPlanCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const subAccountId = session.metadata?.subAccountId;
  const planId = session.metadata?.planId;
  if (!subAccountId || !planId) {
    console.error(
      "[billing] subAccountPlan checkout completed without subAccountId/planId metadata",
    );
    return;
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`[billing] checkout completed for missing sub-account ${subAccountId}`);
    return;
  }
  const data = snap.data() as Record<string, unknown>;
  const agencyId = String(data.agencyId ?? "");
  const billing = readBilling(data);

  await ref.update({
    "billing.status": "active" satisfies SubAccountBillingStatus,
    "billing.stripeCustomerId":
      (session.customer as string | null) ?? billing?.stripeCustomerId ?? null,
    "billing.stripeSubscriptionId":
      (session.subscription as string | null) ??
      billing?.stripeSubscriptionId ??
      null,
    "billing.checkoutTokenHash": null,
    "billing.graceUntil": null,
    "billing.activatedAt": FieldValue.serverTimestamp(),
    "billing.updatedAt": FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Apply the plan's gate bundle now that payment landed. Look the plan up
  // fresh so a gate edit between assignment and payment still applies.
  try {
    const planSnap = await db
      .doc(`agencies/${agencyId}/plans/${planId}`)
      .get();
    const gates = planSnap.exists
      ? normalizePlanGates(planSnap.data()?.gates)
      : null;
    if (gates) {
      const { skippedMetaGates } = await applyFeatureGates(subAccountId, gates);
      if (skippedMetaGates.length > 0) {
        console.warn(
          `[billing] plan ${planId} wants Meta gates but the deployment lacks META_APP_ID/SECRET — left off for ${subAccountId}`,
        );
      }
    }
  } catch (err) {
    // Activation must not fail because a gate write blipped — the agency
    // can re-apply from the Manage dialog.
    console.error("[billing] gate application on activation failed", err);
  }

  recordBillingEvent({
    agencyId,
    subAccountId,
    event: "activated",
    detail: {
      planId,
      planName: billing?.planName ?? null,
      priceCents: billing?.priceCents ?? null,
      stripeSubscriptionId: (session.subscription as string | null) ?? null,
    },
  });
  void emitWebhookEvent({
    subAccountId,
    agencyId,
    mode: "live",
    type: "billing.activated",
    payload: {
      subAccountId,
      planId,
      planName: billing?.planName ?? null,
      priceCents: billing?.priceCents ?? null,
      currency: billing?.currency ?? null,
    },
  });
}

/**
 * customer.subscription.updated / .deleted with metadata.kind ===
 * "subAccountPlan". Maps Stripe's status to ours and stamps/clears the
 * dunning grace window.
 */
export async function handleSubAccountSubscriptionEvent(
  subscription: Stripe.Subscription,
  opts: { deleted: boolean },
): Promise<void> {
  const db = getAdminDb();

  // Fast path: metadata carries the sub-account id. Fallback: look the
  // subscription id up (covers subscriptions whose metadata was stripped
  // in the Stripe dashboard).
  let subAccountId: string | null =
    subscription.metadata?.subAccountId ?? null;
  if (!subAccountId) {
    const match = await db
      .collection("subAccounts")
      .where("billing.stripeSubscriptionId", "==", subscription.id)
      .limit(1)
      .get();
    subAccountId = match.empty ? null : match.docs[0].id;
  }
  if (!subAccountId) {
    console.error(
      `[billing] no sub-account found for subscription ${subscription.id}`,
    );
    return;
  }

  const ref = db.doc(`subAccounts/${subAccountId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as Record<string, unknown>;
  const agencyId = String(data.agencyId ?? "");
  const billing = readBilling(data);
  if (!billing || billing.status === "comped") return;
  // Ignore events from a superseded subscription (e.g. the old sub's
  // cancellation arriving after a re-checkout already created a new one).
  if (
    billing.stripeSubscriptionId &&
    billing.stripeSubscriptionId !== subscription.id
  ) {
    return;
  }

  // While pending (client hasn't completed checkout), only a transition to
  // "active" is meaningful — half-finished checkout sessions emit
  // incomplete/incomplete_expired subscription noise that must not flip a
  // never-paid workspace into dunning or cancellation.
  if (
    billing.status === "pending" &&
    subscription.status !== "active" &&
    subscription.status !== "trialing"
  ) {
    return;
  }

  let nextStatus: SubAccountBillingStatus;
  if (opts.deleted) {
    nextStatus = "canceled";
  } else {
    switch (subscription.status) {
      case "active":
      case "trialing":
        nextStatus = "active";
        break;
      case "past_due":
      case "unpaid":
      case "incomplete":
        nextStatus = "past_due";
        break;
      case "canceled":
      case "incomplete_expired":
        nextStatus = "canceled";
        break;
      default:
        nextStatus = billing.status;
    }
  }

  const updates: Record<string, unknown> = {
    "billing.stripeSubscriptionId": opts.deleted ? null : subscription.id,
    "billing.updatedAt": FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (nextStatus !== billing.status) {
    updates["billing.status"] = nextStatus;
  }
  if (nextStatus === "past_due") {
    // Stamp the grace window ONCE per dunning episode — repeat past_due
    // events (Stripe retries) must not keep pushing the paywall out.
    const alreadyStamped = billing.status === "past_due" && billing.graceUntil;
    if (!alreadyStamped) {
      updates["billing.graceUntil"] = Timestamp.fromMillis(
        Date.now() + BILLING_GRACE_DAYS * 24 * 60 * 60 * 1000,
      );
    }
  }
  if (nextStatus === "active") {
    updates["billing.graceUntil"] = null;
  }

  await ref.update(updates);

  if (nextStatus !== billing.status) {
    recordBillingEvent({
      agencyId,
      subAccountId,
      event: "status.changed",
      detail: {
        previousStatus: billing.status,
        status: nextStatus,
        stripeStatus: subscription.status,
        deleted: opts.deleted,
      },
    });
    const eventType =
      nextStatus === "past_due"
        ? "billing.past_due"
        : nextStatus === "canceled"
          ? "billing.canceled"
          : nextStatus === "active"
            ? "billing.activated"
            : null;
    if (eventType) {
      void emitWebhookEvent({
        subAccountId,
        agencyId,
        mode: "live",
        type: eventType,
        payload: {
          subAccountId,
          planId: billing.planId,
          planName: billing.planName,
          previousStatus: billing.status,
          status: nextStatus,
        },
      });
    }
  }
}
