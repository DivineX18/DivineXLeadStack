import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { validateEmailBody } from "@/lib/automations/merge-tags";
import type { MessageTemplateDoc, StepChannel } from "@/types/automations";

export class MessageTemplateValidationError extends Error {}

/** Admin-SDK message-template creation — the manual New Template page only
 *  writes via the client SDK. Enforces the same {{unsubscribeLink}}
 *  requirement (CAN-SPAM) the manual UI's save button enforces. */
export async function createMessageTemplateServerSide(opts: {
  subAccountId: string;
  createdByUid: string;
  name: string;
  type: StepChannel;
  subject?: string | null;
  body: string;
}): Promise<string> {
  if (opts.type === "email") {
    const err = validateEmailBody(opts.body);
    if (err) throw new MessageTemplateValidationError(err);
  }

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? "";

  const ref = db.collection("message_templates").doc();
  const doc: Omit<MessageTemplateDoc, "id"> = {
    agencyId,
    subAccountId: opts.subAccountId,
    type: opts.type,
    name: opts.name.trim() || "Untitled template",
    subject: opts.type === "email" ? (opts.subject ?? null) : null,
    body: opts.body,
    createdByUid: opts.createdByUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set({ id: ref.id, ...doc });
  return ref.id;
}
