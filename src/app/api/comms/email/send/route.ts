import { NextResponse } from "next/server";
import { emailIsConfigured } from "@/lib/comms/resend";
import { requireContactAccessible, requireUid } from "@/lib/comms/route-auth";
import { sendContactEmailServerSide } from "@/lib/server/contact-email-service";

type Body = { contactId?: string; subject?: string; body?: string };

export async function POST(request: Request) {
  if (!emailIsConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured on this deployment." },
      { status: 503 },
    );
  }

  const auth = requireUid(request);
  if (auth instanceof NextResponse) return auth;

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contactId = payload.contactId?.trim();
  const subject = payload.subject?.trim();
  const body = payload.body?.trim();

  if (!contactId || !subject || !body) {
    return NextResponse.json(
      { error: "contactId, subject, and body are required" },
      { status: 400 },
    );
  }

  const contact = await requireContactAccessible(auth.uid, contactId);
  if (contact instanceof NextResponse) return contact;

  // The logic moved to a service so Zeno can call exactly what this route
  // calls. One sender resolution, one activity shape, one usage counter,
  // and one definition of what "sent" means.
  const sent = await sendContactEmailServerSide({
    subAccountId: contact.subAccountId,
    contactId,
    subject,
    body,
    actorUid: auth.uid,
    actorEmail: auth.email,
  });

  if (!sent.ok) {
    if (sent.reason === "no_address") {
      return NextResponse.json({ error: "This contact has no email address." }, { status: 400 });
    }
    if (sent.reason === "no_contact") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    if (sent.reason === "invalid") {
      return NextResponse.json({ error: sent.detail }, { status: 400 });
    }
    if (sent.reason === "not_configured") {
      return NextResponse.json({ error: "Email is not configured on this deployment." }, { status: 503 });
    }
    return NextResponse.json({ error: sent.detail }, { status: 502 });
  }

  // Bookkeeping may have failed, but the message has gone. Saying anything
  // other than success here would invite a second send.
  return NextResponse.json({ ok: true, id: sent.providerMessageId });
}