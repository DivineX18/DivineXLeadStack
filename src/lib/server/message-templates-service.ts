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

/**
 * This workspace's templates, newest first.
 *
 * Scoped by subAccountId, which is the tenancy key on the doc, so a lookup
 * can never surface another workspace's copy.
 */
export async function listMessageTemplatesServerSide(
  subAccountId: string,
): Promise<MessageTemplateDoc[]> {
  const snap = await getAdminDb()
    .collection("message_templates")
    .where("subAccountId", "==", subAccountId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<MessageTemplateDoc, "id">) }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/**
 * Rewrite an existing template.
 *
 * Runs the SAME {{unsubscribeLink}} check the create path runs. Without that,
 * an edit becomes the way to strip the unsubscribe link from a template that
 * was compliant when it was written, which is the one thing the create-time
 * validation exists to prevent.
 *
 * The workspace is re-checked from the stored doc rather than trusted from
 * the caller, so a template id from another workspace cannot be edited by
 * guessing it.
 */
export async function updateMessageTemplateServerSide(opts: {
  subAccountId: string;
  templateId: string;
  name?: string;
  subject?: string | null;
  body?: string;
}): Promise<MessageTemplateDoc> {
  const db = getAdminDb();
  const ref = db.collection("message_templates").doc(opts.templateId);
  const snap = await ref.get();
  if (!snap.exists) throw new MessageTemplateValidationError("That template no longer exists.");
  const current = snap.data() as Omit<MessageTemplateDoc, "id">;
  if (current.subAccountId !== opts.subAccountId) {
    // Same shape as a missing doc on purpose: whether an id exists in some
    // other workspace is not something this caller gets to learn.
    throw new MessageTemplateValidationError("That template no longer exists.");
  }

  const body = opts.body ?? current.body;
  if (current.type === "email") {
    const err = validateEmailBody(body);
    if (err) throw new MessageTemplateValidationError(err);
  }

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (opts.name !== undefined) patch.name = opts.name.trim() || current.name;
  if (opts.subject !== undefined) patch.subject = current.type === "email" ? opts.subject : null;
  if (opts.body !== undefined) patch.body = body;
  await ref.set(patch, { merge: true });

  return { id: opts.templateId, ...current, ...(patch as Partial<MessageTemplateDoc>) } as MessageTemplateDoc;
}
