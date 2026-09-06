import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveBookingHosts } from "@/lib/booking/hosts";
import { validateBookingPageFormData } from "@/lib/booking/validation";
import { GLOBAL_TERRITORY_ID } from "@/types";
import type { BookingPage } from "@/types/booking";

/**
 * Booking-page creation, extracted from the POST route so Zeno and the
 * editor create pages through the SAME code.
 *
 * Extracted rather than reimplemented for the reason that matters: the guards
 * here are not incidental. The PayPal check stops a page rendering a Pay
 * button that goes nowhere; host resolution refuses to trust client-supplied
 * names and drops members who are no longer active; the doc id IS the slug, so
 * `create()` is the uniqueness check. A second creation path would have to
 * re-earn every one of those, and would drift the first time one changed.
 */

export class BookingPageError extends Error {
  constructor(message: string, readonly code: "invalid" | "conflict" | "not_configured" = "invalid") {
    super(message);
  }
}

export async function createBookingPageServerSide(opts: {
  subAccountId: string;
  createdByUid: string;
  /** Raw form data — validated here, by the same validator the route uses. */
  data: unknown;
}): Promise<{ slug: string }> {
  const validated = validateBookingPageFormData(opts.data);
  if (!validated.ok) throw new BookingPageError(validated.error);
  const data = validated.value;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  if (!subSnap.exists) throw new BookingPageError("Sub-account not found.");
  const sub = subSnap.data() ?? {};
  const agencyId = (sub.agencyId as string | undefined) ?? null;
  if (!agencyId) throw new BookingPageError("Sub-account is missing tenancy metadata.");

  // A paid page without a payment method would show the visitor a Pay button
  // that goes nowhere — refuse rather than publish a dead end.
  if (data.payment && !sub.paypalConfig) {
    throw new BookingPageError(
      "Connect a PayPal.me username under Settings → Payments before requiring payment on a booking page.",
      "not_configured",
    );
  }

  const territoryId =
    data.defaultTerritoryId && data.defaultTerritoryId !== GLOBAL_TERRITORY_ID
      ? data.defaultTerritoryId
      : GLOBAL_TERRITORY_ID;

  // Live membership decides the hosts — never the caller's list.
  const hosts = await resolveBookingHosts(opts.subAccountId, data.hosts);

  const ref = db.doc(`subAccounts/${opts.subAccountId}/bookingPages/${data.slug}`);
  const now = FieldValue.serverTimestamp();
  try {
    await ref.create({
      ...data,
      hosts,
      id: data.slug,
      agencyId,
      subAccountId: opts.subAccountId,
      createdByUid: opts.createdByUid,
      territoryId,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: number | string }).code
      : null;
    if (code === 6 || code === "already-exists") {
      throw new BookingPageError(
        `A booking page with the slug "${data.slug}" already exists. Pick another.`,
        "conflict",
      );
    }
    throw err;
  }

  return { slug: data.slug };
}

/** This workspace's booking pages — what Zeno reads to wire a page's CTA to a
 *  real calendar instead of inventing a link. */
export async function listBookingPages(subAccountId: string): Promise<BookingPage[]> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/bookingPages`)
    .limit(50)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BookingPage, "id">) }));
}
