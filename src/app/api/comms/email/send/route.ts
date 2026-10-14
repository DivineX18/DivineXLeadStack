import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emailIsConfigured, sendEmail, tenantFrom } from "@/lib/comms/resend";
import { requireContactAccessible, requireUid } from "@/lib/comms/route-auth";
import { buildReplyAddress } from "@/lib/comms/email-threading";
import { upsertConversationForMessage } from "@/lib/server/conversations-service";
import { recordSend } from "@/lib/comms/usage";
import type { SubAccountDoc } from "@/types";

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

  if (!contact.email) {
    return NextResponse.json(
      { error: "This contact has no email address." },
      { status: 400 },
    );
  }

  const subAccountSnap = await getAdminDb()
    .doc(`subAccounts/${contact.subAccountId}`)
    .get();
  const subAccount = subAccountSnap.data() as SubAccountDoc | undefined;

  /**
   * Where the prospect's reply goes, best option first.
   *
   * 1. An address we own and route (`reply+<token>@<inbound domain>`), so the
   *    reply lands in this contact's thread in the CRM. Everyone with
   *    workspace access can then read it and answer, and the conversation
   *    survives the sender leaving.
   * 2. The teammate who clicked Send. Used when inbound email is not set up
   *    on the deployment. They at least see the reply in their own mailbox,
   *    which is what a one-to-one email should do — a rep chasing a booking
   *    needs the answer, and routing it to a shared address they may not
   *    watch is how replies get missed.
   * 3. The workspace's nominated address, as a last resort.
   *
   * Note this is the one-to-one path only. Broadcasts, workflow steps and
   * transactional mail go through `workspaceSender()` and keep replying to
   * the workspace address, which is correct for bulk: nobody wants 2,000
   * out-of-office replies in their personal inbox.
   */
  const crmReplyAddress = await buildReplyAddress({
    contactId,
    subAccountId: contact.subAccountId,
    agencyId: contact.agencyId,
  });
  const replyTo =
    crmReplyAddress ?? auth.email ?? subAccount?.replyToEmail ?? undefined;

  let messageId: string;
  try {
    const result = await sendEmail({
      billing: { kind: "customer", subAccountId: contact.subAccountId },
      to: contact.email,
      subject,
      text: body,
      replyTo,
      from: tenantFrom(subAccount),
      log: {
        agencyId: contact.agencyId,
        subAccountId: contact.subAccountId,
        contactId,
        source: "manual",
        sentByUid: auth.uid,
        sentByEmail: auth.email ?? null,
      },
    });
    messageId = result.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Put the send on the contact's inbox thread, so an emailed contact appears
  // in Conversations instead of only on their profile — and so the reply,
  // when it arrives, lands on a thread that already has context.
  void upsertConversationForMessage({
    contactId,
    subAccountId: contact.subAccountId,
    agencyId: contact.agencyId,
    contactName: contact.name || contact.email,
    contactPhone: contact.phone || null,
    channel: "email",
    direction: "outbound",
    body: `${subject}\n\n${body}`,
    // A human wrote this, so hold the bot off this thread.
    pauseBot: true,
  });

  try {
    await getAdminDb()
      .collection("contacts")
      .doc(contactId)
      .collection("activities")
      .add({
        type: "email_sent",
        content: `Email: ${subject}`,
        createdBy: auth.uid,
        meta: { messageId, subject },
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[email/send] activity write failed", err);
  }

  await recordSend(auth.uid, "email");

  return NextResponse.json({ ok: true, id: messageId });
}
