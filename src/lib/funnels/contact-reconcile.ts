import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitContactCreatedById } from "@/lib/server/contacts-service";
import { GLOBAL_TERRITORY_ID } from "@/types";
import type { Contact } from "@/types/contacts";

/**
 * Reconcile a Stripe Checkout customer to a Contact — cloned from
 * lib/booking/contact-reconcile.ts's email-first-match shape. Stripe
 * Checkout Sessions always carry `customer_details.email`, so email is a
 * reliable reconciliation key here the same way it is for bookings.
 */

interface ReconcileInput {
  agencyId: string;
  subAccountId: string;
  email: string;
  name: string;
}

export interface ReconciledContact {
  id: string;
  created: boolean;
}

export async function reconcileFunnelCheckoutContact(
  input: ReconcileInput,
): Promise<ReconciledContact> {
  const db = getAdminDb();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  const existing = await db
    .collection("contacts")
    .where("subAccountId", "==", input.subAccountId)
    .where("email", "==", email)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    const data = doc.data() as Contact;
    if (name && !data.name) {
      try {
        await doc.ref.update({ name, updatedAt: FieldValue.serverTimestamp() });
      } catch {
        // Non-fatal — surface the order even if the patch blips.
      }
    }
    return { id: doc.id, created: false };
  }

  const ref = await db.collection("contacts").add({
    name,
    email,
    phone: "",
    company: "",
    address: "",
    source: "funnel-checkout",
    tags: [],
    pipelineStage: null,
    attribution: null,
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    createdByUid: "funnel-checkout",
    emailOptedOut: false,
    smsOptedOut: false,
    countryCode: null,
    country: null,
    city: null,
    lat: null,
    lng: null,
    territoryId: GLOBAL_TERRITORY_ID,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  void emitContactCreatedById({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    contactId: ref.id,
  });

  return { id: ref.id, created: true };
}
