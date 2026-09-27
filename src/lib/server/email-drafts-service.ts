import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * A DRAFT THAT SURVIVES THE TURN.
 *
 * "Send it" has to resolve against something that exists. The member
 * defect earlier in this project was exactly this shape: an id the model
 * had seen one turn ago was gone the next, because a tool result is not
 * part of the conversation the browser replays. An email is worse than a
 * role change to get wrong, so what gets sent is read from storage, not
 * reconstructed from what the model remembers writing.
 *
 * A draft is inert. It has no schedule, no recipient delivery, no side
 * effect of any kind; it is text with a contact attached, and only
 * send_contact_email causes anything to leave.
 */

export interface EmailDraft {
  id: string;
  subAccountId: string;
  contactId: string;
  subject: string;
  body: string;
  createdByUid: string;
  /** Set once the draft has actually been sent, so it cannot be sent twice. */
  sentAt: FirebaseFirestore.Timestamp | null;
  providerMessageId: string | null;
}

export async function createEmailDraftServerSide(opts: {
  subAccountId: string;
  contactId: string;
  subject: string;
  body: string;
  createdByUid: string;
}): Promise<{ ok: true; id: string } | { ok: false; reason: "no_contact" }> {
  const db = getAdminDb();
  const snap = await db.doc(`contacts/${opts.contactId}`).get();
  // A contact from another workspace reads as one that is not there.
  if (!snap.exists || snap.data()!.subAccountId !== opts.subAccountId) {
    return { ok: false, reason: "no_contact" };
  }
  const ref = db.collection(`subAccounts/${opts.subAccountId}/emailDrafts`).doc();
  await ref.set({
    subAccountId: opts.subAccountId,
    contactId: opts.contactId,
    subject: opts.subject.slice(0, 300),
    body: opts.body.slice(0, 20_000),
    createdByUid: opts.createdByUid,
    sentAt: null,
    providerMessageId: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, id: ref.id };
}

/** Path-scoped, so a draft id from elsewhere is simply not here. */
export async function getEmailDraftServerSide(
  subAccountId: string,
  draftId: string,
): Promise<EmailDraft | null> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}/emailDrafts/${draftId}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<EmailDraft, "id">) };
}

/** Marked after acceptance, so the same draft cannot be sent a second time. */
export async function markEmailDraftSentServerSide(opts: {
  subAccountId: string;
  draftId: string;
  providerMessageId: string;
}): Promise<void> {
  try {
    await getAdminDb().doc(`subAccounts/${opts.subAccountId}/emailDrafts/${opts.draftId}`).set(
      { sentAt: FieldValue.serverTimestamp(), providerMessageId: opts.providerMessageId, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    // The message has already gone. Failing to stamp the draft is worth
    // knowing about and is never grounds to report a failed send.
    console.error("[email-drafts] could not mark draft sent:", err instanceof Error ? err.message : err);
  }
}

/**
 * The unsent drafts in this workspace, newest first.
 *
 * Without this, "send it" in a new conversation cannot resolve: the draft
 * id lives in a tool result, and a tool result is not part of the history
 * the browser replays. That is exactly what made the member editor
 * unreachable a turn after a lookup, and here the consequence is worse,
 * because the customer is told there is nothing to send when there is.
 */
export async function listEmailDraftsServerSide(
  subAccountId: string,
): Promise<{ id: string; contactId: string; contactName: string; subject: string; body: string; sent: boolean }[]> {
  const db = getAdminDb();
  const snap = await db.collection(`subAccounts/${subAccountId}/emailDrafts`).limit(50).get();
  const rows = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      contactId: String(x.contactId ?? ""),
      subject: String(x.subject ?? ""),
      body: String(x.body ?? ""),
      sent: x.sentAt != null,
      createdAt: x.createdAt?.toDate?.()?.getTime?.() ?? 0,
    };
  });
  // Names are read here so the model can say who a draft is for without
  // being handed an id it would have to speak out loud.
  const names = new Map<string, string>();
  await Promise.all(
    [...new Set(rows.map((r) => r.contactId).filter(Boolean))].map(async (id) => {
      const c = await db.doc(`contacts/${id}`).get();
      if (c.exists && c.data()!.subAccountId === subAccountId) names.set(id, String(c.data()!.name ?? ""));
    }),
  );
  return rows
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ createdAt: _createdAt, ...r }) => ({ ...r, contactName: names.get(r.contactId) ?? "someone" }));
}
