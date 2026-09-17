import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUid, requireContactAccessible } from "@/lib/comms/route-auth";
import { phoneIdentity } from "@/lib/comms/phone-identity";
import { findContactsByPhoneIdentity, suppressSms } from "@/lib/comms/sms-gate";

export const dynamic = "force-dynamic";

/**
 * THE OPERATOR CAN STOP TEXTING SOMEONE. THEY CANNOT START.
 *
 * Until now the only thing in the entire product that could set
 * `smsOptedOut: true` was the Twilio webhook. Somebody who asked to be taken
 * off the list by phone, by email, or in person could not be honoured at all
 * without an engineer opening the Firestore console. That is the common case,
 * not the edge case.
 *
 * So this is deliberately one-directional. Suppressing is an operator
 * recording a request they received, which is theirs to record. Re-subscribing
 * is a claim about what the RECIPIENT wants, and an operator clicking a button
 * is not evidence of that — it is exactly the fabricated consent this whole
 * layer exists to prevent. Lifting a suppression therefore happens only when
 * the recipient themselves sends an explicit START.
 *
 * The suppression is written against sub-account + canonical phone line, so it
 * survives the contact being deleted, duplicated, reformatted or re-imported.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: contactId } = await params;
  const auth = await requireUid(request);
  if (auth instanceof NextResponse) return auth;

  const contact = await requireContactAccessible(auth.uid, contactId);
  if (contact instanceof NextResponse) return contact;

  const e164 = phoneIdentity(contact.phoneE164 ?? contact.phone);
  if (!e164) {
    return NextResponse.json(
      {
        error:
          "This contact's phone number has no country code, so it can't be matched to a phone line. Fix the number first.",
      },
      { status: 400 },
    );
  }

  await suppressSms({
    subAccountId: contact.subAccountId,
    e164,
    source: "operator",
    actorUid: auth.uid,
  });

  // Mirror onto every contact in this workspace naming the same line, so the
  // UI agrees with the index even when the person exists more than once.
  const db = getAdminDb();
  const docs = await findContactsByPhoneIdentity(contact.subAccountId, e164);
  const batch = db.batch();
  for (const d of docs) {
    batch.update(d.ref, { smsOptedOut: true, updatedAt: FieldValue.serverTimestamp() });
    batch.set(d.ref.collection("activities").doc(), {
      type: "automation_step_skipped",
      content: `SMS suppressed for ${e164} by an operator.`,
      createdBy: auth.uid,
      meta: { kind: "sms_opt_out", optedOut: true, source: "operator", e164 },
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  return NextResponse.json({ ok: true, e164, contactsUpdated: docs.length });
}
