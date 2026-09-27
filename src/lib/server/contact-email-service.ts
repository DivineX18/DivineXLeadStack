import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emailIsConfigured, sendEmail, tenantFrom } from "@/lib/comms/resend";
import { recordSend } from "@/lib/comms/usage";
import { renderBodyHtml, renderBodyText } from "@/lib/email/body";
import type { SubAccountDoc } from "@/types";

/**
 * ONE PLACE THAT SENDS AN EMAIL TO A CONTACT.
 *
 * /api/comms/email/send has done this since the beginning: resolve the
 * contact, pick the sender, send through Resend, write the activity, count
 * the usage. It was written as a route, so the only way to reach it was an
 * HTTP request from a browser. Zeno needs the same behaviour, and the wrong
 * way to get it is a second implementation that drifts.
 *
 * So the logic moved here and the route calls it. Zeno calls it too. There
 * is one sender resolution, one activity shape, one usage counter.
 *
 * THE COMMIT BOUNDARY IS PROVIDER ACCEPTANCE, and it is the reason this
 * function is shaped the way it is. Everything before the send may fail and
 * be reported as a failure, because nothing has left. The moment Resend
 * returns a message id, an external side effect has happened and cannot be
 * undone. Nothing after that line is allowed to turn the outcome into
 * "it failed, try again", because the retry would send a second email to a
 * real person. The activity write and the usage counter therefore happen
 * after the boundary, and their failures are recorded on the result rather
 * than thrown.
 *
 * WHAT ACCEPTANCE MEANS, precisely: Resend has taken responsibility for
 * delivering the message and issued an id. It does not mean the recipient
 * received it, or that it passed their spam filter. Delivery, bounce and
 * complaint are later events on Resend's side, which this codebase does not
 * currently consume. Callers must say "sent", never "received".
 */

export type ContactEmailFailure =
  | { reason: "not_configured" }
  | { reason: "no_contact" }
  | { reason: "no_address" }
  | { reason: "invalid"; detail: string }
  | { reason: "provider_rejected"; detail: string };

export interface ContactEmailSent {
  ok: true;
  /** Resend's id for the accepted message. Internal, not customer prose. */
  providerMessageId: string;
  contactId: string;
  contactName: string;
  /** Where it actually went, which on a dev send is the provider's sink. */
  to: string;
  subject: string;
  from: string;
  replyTo: string | null;
  /**
   * Bookkeeping that failed AFTER the message was accepted. The send still
   * happened; these are things to reconcile, never grounds to retry.
   */
  postAcceptanceProblems: string[];
}

export type ContactEmailResult = ContactEmailSent | ({ ok: false } & ContactEmailFailure);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendContactEmailServerSide(opts: {
  subAccountId: string;
  contactId: string;
  subject: string;
  /** Plain body. Button syntax is rendered, exactly as everywhere else. */
  body: string;
  /** Who is sending, for Reply-To fallback and the activity row. */
  actorUid: string;
  actorEmail?: string | null;
  /**
   * Passed to Resend so one approved action cannot become two messages even
   * if this function is somehow entered twice. Independent of, and in
   * addition to, the confirmation claim upstream.
   */
  idempotencyKey?: string;
  /**
   * Overrides the recipient with a provider test sink. Only ever set by
   * development certification, never by a capability: a real customer send
   * must go where the contact actually is.
   */
  overrideRecipient?: string;
}): Promise<ContactEmailResult> {
  if (!emailIsConfigured()) return { ok: false, reason: "not_configured" };

  const subject = opts.subject.trim();
  const body = opts.body.trim();
  if (!subject) return { ok: false, reason: "invalid", detail: "The email needs a subject." };
  if (!body) return { ok: false, reason: "invalid", detail: "The email needs a body." };

  const db = getAdminDb();
  const snap = await db.doc(`contacts/${opts.contactId}`).get();
  // A contact in another workspace resolves exactly as one that is not
  // there. Nothing distinguishes them, including timing.
  if (!snap.exists || snap.data()!.subAccountId !== opts.subAccountId) {
    return { ok: false, reason: "no_contact" };
  }
  const contact = snap.data()!;
  const address = opts.overrideRecipient ?? String(contact.email ?? "").trim();
  if (!address) return { ok: false, reason: "no_address" };
  if (!EMAIL_RE.test(address)) return { ok: false, reason: "invalid", detail: "That isn't a usable email address." };

  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  const sub = subSnap.data() as SubAccountDoc | undefined;
  // The same precedence the route has always used: the workspace's own
  // reply address first, the person acting second.
  const replyTo = sub?.replyToEmail ?? opts.actorEmail ?? undefined;
  const from = tenantFrom(sub) ?? process.env.EMAIL_FROM ?? "";

  let providerMessageId: string;
  try {
    const result = await sendEmail({
      to: address,
      subject,
      text: renderBodyText(body),
      html: renderBodyHtml(body),
      ...(replyTo ? { replyTo } : {}),
      ...(from ? { from } : {}),
      ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
    });
    providerMessageId = result.id;
  } catch (err) {
    // Nothing left. Reporting a failure here is truthful and a retry is safe.
    return { ok: false, reason: "provider_rejected", detail: err instanceof Error ? err.message : "The email provider rejected it." };
  }

  // ---- PAST THIS LINE THE EMAIL HAS GONE. Nothing below may fail the send.
  const postAcceptanceProblems: string[] = [];
  try {
    await db.collection("contacts").doc(opts.contactId).collection("activities").add({
      type: "email_sent",
      content: `Email: ${subject}`,
      createdBy: opts.actorUid,
      // "sent" is what is known. Delivery is a later event this codebase
      // does not consume, so it is not claimed.
      meta: { messageId: providerMessageId, subject, deliveryState: "sent" },
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    postAcceptanceProblems.push(`activity not recorded: ${err instanceof Error ? err.message : "unknown"}`);
  }
  try {
    await recordSend(opts.actorUid, "email");
  } catch {
    postAcceptanceProblems.push("usage not counted");
  }
  if (postAcceptanceProblems.length > 0) {
    console.error(
      `[contact-email] sent ${providerMessageId} to contact ${opts.contactId} but bookkeeping failed:`,
      postAcceptanceProblems.join("; "),
    );
  }

  return {
    ok: true,
    providerMessageId,
    contactId: opts.contactId,
    contactName: String(contact.name ?? "this contact"),
    to: address,
    subject,
    from,
    replyTo: replyTo ?? null,
    postAcceptanceProblems,
  };
}
