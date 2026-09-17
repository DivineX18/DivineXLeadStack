import { NextResponse } from "next/server";
import { requireUid, requireContactAccessible } from "@/lib/comms/route-auth";
import { phoneIdentity } from "@/lib/comms/phone-identity";
import { isSmsSuppressed, recordSmsAttestation, smsConsentState } from "@/lib/comms/sms-gate";

export const dynamic = "force-dynamic";

/**
 * A NAMED HUMAN VOUCHES FOR PERMISSION, ONCE, PER PHONE LINE.
 *
 * Most contacts carry no consent evidence — imported, API-created, or typed in
 * by hand. This is how a manual message to one of them becomes attributable
 * rather than merely permitted: an operator affirms they have permission, and
 * that affirmation is stored as THEIR assertion, with their uid and the time.
 *
 * It is not recipient consent and is never written as such: `smsConsent` still
 * means the recipient agreed, and stays untouched here. A dispute can then
 * tell "they opted in" apart from "an operator said we could", which is the
 * distinction the old model had no way to express.
 *
 * NOTHING AUTHORITATIVE COMES FROM THE CLIENT. The workspace, the canonical
 * phone identity, the actor and the timestamp are all derived server-side, so
 * a forged payload has nothing to forge: posting `attested: true` is not a
 * thing this route accepts.
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
          "This number needs a country code before it can be texted. Enter it in full, for example +1 415 555 2671.",
      },
      { status: 400 },
    );
  }

  // Attesting over a STOP would be an operator overruling the recipient. The
  // gate refuses it at send time regardless; refusing it here too means the
  // record never exists to be misread later.
  if (await isSmsSuppressed(contact.subAccountId, e164)) {
    return NextResponse.json(
      { error: "This number has opted out of SMS from this workspace. It can't be texted." },
      { status: 409 },
    );
  }

  // A recipient who was asked and declined has already answered. An operator
  // may not attest past that.
  if (smsConsentState(contact) === "declined") {
    return NextResponse.json(
      { error: "This contact was asked for SMS consent and declined, so they can't be texted." },
      { status: 409 },
    );
  }

  await recordSmsAttestation({
    subAccountId: contact.subAccountId,
    e164,
    contactId,
    actorUid: auth.uid,
  });

  return NextResponse.json({ ok: true, e164, basis: "operator_attestation" });
}
