import "server-only";

import type Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  enrollClient,
  packageForStripePrice,
} from "@/lib/server/client-onboarding-service";
import { resolveCrmWorkspaceId } from "@/lib/onboarding/home-workspace";
import { notifyAccountOwner } from "@/lib/onboarding/staff-service";
import { getStripeServer } from "@/lib/stripe/server";

/**
 * STRIPE-TRIGGERED ENROLLMENT.
 *
 * This file is a GATE, not a second implementation. Every check below decides
 * whether to call `enrollClient()`, which is the same function the manual
 * admin path calls. There is deliberately nothing here that creates a record,
 * a contact, a checklist or an invite, so the two paths cannot drift.
 *
 * Six safeguards, each for a failure that has a real cost:
 *
 *   1. Persistent event idempotency. Stripe retries, and retries arrive out
 *      of order. A claimed event id means we have already decided.
 *   2. payment_status === "paid". A completed session is NOT a paid one for
 *      delayed methods, and enrolling an unpaid client starts work nobody
 *      has paid for.
 *   3. billing_reason === "subscription_create" when an invoice is present.
 *      Renewals must never re-enroll. Today no invoice event reaches this
 *      webhook at all, so this is belt and braces, and it stays because the
 *      day someone adds invoice handling for an unrelated reason, this is
 *      what stops a year of renewals from re-onboarding every client.
 *   4. A registered price. Eligibility is an explicit allowlist, never the
 *      amount and never the product name.
 *   5. A resolvable agency and workspace.
 *   6. enrollClient's own duplicate guard, which is the last line.
 */

const EVENTS = "onboardingStripeEvents";

export type StripeEnrollOutcome =
  | "enrolled"
  | "duplicate_event"
  | "unpaid"
  | "renewal"
  | "no_package"
  | "no_agency"
  | "no_workspace"
  | "already_onboarding"
  | "invalid";

/**
 * Claim an event id, once, forever.
 *
 * A create collision (Firestore code 6) is the duplicate signal, the same
 * mechanism the founders handler has used in production. Anything else
 * re-raises so the route 500s and Stripe retries against a clean slate.
 */
async function claimEvent(eventId: string): Promise<boolean> {
  try {
    await getAdminDb().collection(EVENTS).doc(eventId).create({
      eventId,
      claimedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (err) {
    if ((err as { code?: number })?.code === 6) return false;
    throw err;
  }
}

/**
 * The price actually bought.
 *
 * `checkout.session.completed` does NOT carry line_items: Stripe omits them
 * unless the session is retrieved with them expanded. Reading the webhook
 * payload alone would therefore find no price, resolve no package, and
 * silently enroll nobody while looking like it was working. So this fetches
 * them when they are absent.
 */
async function resolvePriceId(session: Stripe.Checkout.Session): Promise<string | null> {
  const fromPayload = session.line_items?.data?.[0]?.price;
  if (fromPayload) return typeof fromPayload === "string" ? fromPayload : (fromPayload.id ?? null);
  try {
    const stripe = getStripeServer();
    const full = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items"],
    });
    const price = full.line_items?.data?.[0]?.price;
    return price ? (typeof price === "string" ? price : (price.id ?? null)) : null;
  } catch (err) {
    console.error("[onboarding/stripe] could not read line items", err);
    return null;
  }
}

/**
 * The invoice's billing reason, fetched when the payload carries only an id.
 *
 * Same omission problem as line items. Returning null on any failure keeps
 * this a safeguard rather than a blocker: an unreadable invoice must not
 * prevent a legitimate first purchase from enrolling.
 */
async function resolveBillingReason(session: Stripe.Checkout.Session): Promise<string | null> {
  const invoice = session.invoice;
  if (!invoice) return null;
  if (typeof invoice !== "string") return (invoice as Stripe.Invoice).billing_reason ?? null;
  try {
    const full = await getStripeServer().invoices.retrieve(invoice);
    return full.billing_reason ?? null;
  } catch {
    return null;
  }
}

export async function handleDivinexOnboardingCheckout(opts: {
  event: Stripe.Event;
  session: Stripe.Checkout.Session;
  agencyId: string | null;
  packageId: string | null;
}): Promise<StripeEnrollOutcome> {
  const { event, session } = opts;

  if (!(await claimEvent(event.id))) {
    console.log(`[onboarding/stripe] duplicate event ${event.id}, ignoring`);
    return "duplicate_event";
  }

  // A completed session is not a paid session for delayed payment methods.
  if (session.payment_status !== "paid") {
    console.warn(
      `[onboarding/stripe] session ${session.id} completed with payment_status=` +
        `${session.payment_status}; not enrolling. See the async-payment note in this file.`,
    );
    return "unpaid";
  }

  // Renewal protection. Today no invoice event reaches this webhook at all,
  // so this is belt and braces. It stays because the day someone adds invoice
  // handling for an unrelated reason, this is what stops a year of renewals
  // from re-onboarding every client.
  const billingReason = await resolveBillingReason(session);
  if (billingReason && billingReason !== "subscription_create") {
    console.log(`[onboarding/stripe] billing_reason=${billingReason}, not an initial purchase`);
    return "renewal";
  }

  const agencyId = opts.agencyId;
  if (!agencyId) {
    console.error(`[onboarding/stripe] session ${session.id} carries no agencyId`);
    return "no_agency";
  }

  // The price decides eligibility, through an explicit allowlist. A
  // packageId in metadata is accepted only if it agrees with the price, so a
  // tampered or stale session cannot enroll onto a package it did not buy.
  const priceId = await resolvePriceId(session);
  const pkg = priceId ? await packageForStripePrice(agencyId, priceId) : null;
  if (!pkg) {
    console.warn(
      `[onboarding/stripe] price ${priceId ?? "(none)"} is registered to no package in ` +
        `agency ${agencyId}; not a managed-services purchase, ignoring.`,
    );
    return "no_package";
  }
  if (opts.packageId && opts.packageId !== pkg.id) {
    console.error(
      `[onboarding/stripe] metadata packageId ${opts.packageId} disagrees with the price's ` +
        `package ${pkg.id}; refusing rather than guessing.`,
    );
    return "invalid";
  }

  const email = session.customer_details?.email ?? session.customer_email ?? "";
  if (!email) {
    console.error(`[onboarding/stripe] session ${session.id} has no buyer email`);
    return "invalid";
  }
  const businessName =
    session.metadata?.businessName?.trim() ||
    session.customer_details?.name?.trim() ||
    email;

  const crmSubAccountId = await resolveCrmWorkspaceId({ agencyId });
  if (!crmSubAccountId) {
    console.error(`[onboarding/stripe] agency ${agencyId} has no workspace for the contact`);
    return "no_workspace";
  }

  const ownerUid =
    (await getAdminDb().doc(`agencies/${agencyId}`).get()).data()?.ownerUid ??
    (await getAdminDb().doc("appConfig/main").get()).data()?.firstAgencyOwnerUid ??
    "stripe";

  // THE SAME SERVICE THE MANUAL PATH USES.
  const result = await enrollClient({
    agencyId,
    crmSubAccountId,
    packageId: pkg.id,
    businessName,
    contactEmail: email,
    contactName: session.customer_details?.name ?? undefined,
    accountOwnerUid: String(ownerUid),
    createdByUid: "stripe",
    source: "stripe",
    stripe: {
      eventId: event.id,
      checkoutSessionId: session.id,
      customerId: typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null),
      subscriptionId:
        typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null),
      priceId,
    },
  });

  if (!result.ok) {
    if (result.reason === "duplicate") {
      console.log(`[onboarding/stripe] ${email} already has a live onboarding on ${pkg.name}`);
      return "already_onboarding";
    }
    console.error(`[onboarding/stripe] enrollment refused: ${result.reason} ${result.detail ?? ""}`);
    return "invalid";
  }

  await notifyAccountOwner({
    onboarding: result.onboarding,
    kind: "enrolled",
    // The invite link is NOT emailed from here. The welcome workflow owns
    // client email, so there is one place that decides what a client
    // receives and when.
    detail: `Paid via Stripe (${session.id}). Invite link is on the record.`,
  });

  console.log(`[onboarding/stripe] enrolled ${email} on ${pkg.name} as ${result.onboarding.id}`);
  return "enrolled";
}
