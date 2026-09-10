import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Step-1 trial leads.
 *
 * WHY A SEPARATE COLLECTION, AND WHY IT IS INERT
 *
 * The certified self-serve flow provisions everything from the Stripe webhook:
 * `checkout.session.completed` creates the Firebase user, the agency and the
 * workspace, then emails a set-password link. Nothing exists before payment,
 * on purpose — a half-finished signup can never become an account that has
 * access to anything.
 *
 * Capturing a lead before the card must not weaken that. So these records live
 * in their own top-level collection that NOTHING else reads: not auth, not
 * provisioning, not entitlements, not billing. Writing one grants nothing and
 * creates nothing. It is a note that somebody started, and only that.
 *
 * It also carries no rules block, which is deliberate rather than an omission.
 * Firestore denies by default, so a collection with no rule is unreachable
 * from any client, and the Admin SDK is the only writer. Adding a rule could
 * only widen that.
 *
 * NO PASSWORD IS COLLECTED OR STORED. The existing architecture never takes a
 * password at signup — provisioning mints a random one and emails a set-password
 * link — so accepting one here would mean either creating a real auth user
 * before payment, or storing a credential ourselves outside Firebase Auth.
 * Both are exactly the interference this collection exists to avoid.
 *
 * ACTIVATION IS NOT WRITTEN HERE. "Did this lead convert?" is already
 * answerable: a provisioned workspace for that email means it did. Recording
 * it a second time would mean editing certified provisioning code to serve a
 * marketing metric, so the join stays a read-time question.
 */

export type TrialSignupStatus = "started" | "checkout_started";

export interface TrialSignupInput {
  firstName: string;
  lastName: string;
  email: string;
  planId: string;
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Same shape the rest of the codebase validates emails with: present, one @,
 *  no whitespace. Deliberately permissive — Stripe re-collects and verifies the
 *  address that actually matters, so rejecting an unusual-but-valid address
 *  here would block a real customer to protect a marketing record. */
function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function parseTrialSignup(
  raw: unknown,
): { ok: true; value: TrialSignupInput } | { ok: false; error: string } {
  const body = (raw ?? {}) as Record<string, unknown>;
  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const email = clean(body.email, 200).toLowerCase();
  const planId = clean(body.planId, 200);

  if (!firstName) return { ok: false, error: "Enter your first name." };
  if (!lastName) return { ok: false, error: "Enter your last name." };
  if (!looksLikeEmail(email)) return { ok: false, error: "Enter a valid email address." };
  if (!planId) return { ok: false, error: "Missing plan." };

  return { ok: true, value: { firstName, lastName, email, planId } };
}

/**
 * Record the lead and return its id. Best-effort by design: if this write
 * fails the caller still sends the customer to checkout, because losing a
 * marketing record is a smaller harm than blocking a purchase.
 */
export async function recordTrialSignup(
  input: TrialSignupInput,
): Promise<string | null> {
  try {
    const ref = getAdminDb().collection("trialSignups").doc();
    await ref.set({
      id: ref.id,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      planId: input.planId,
      status: "started" satisfies TrialSignupStatus,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.warn("[trial-signup] could not record lead", err);
    return null;
  }
}

/** Mark that the customer reached Stripe. The gap between this and `started`
 *  is the drop-off the two-step exists to make visible. */
export async function markTrialSignupCheckoutStarted(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await getAdminDb().collection("trialSignups").doc(id).update({
      status: "checkout_started" satisfies TrialSignupStatus,
      checkoutStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("[trial-signup] could not mark checkout started", err);
  }
}
