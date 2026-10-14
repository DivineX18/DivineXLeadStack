import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  EMAIL_STATUS_RANK,
  type EmailEventDoc,
  type EmailSource,
  type EmailStatus,
} from "@/types/email-events";

/**
 * Writes for the sent-email log. See `types/email-events.ts` for why this
 * exists alongside the per-contact activity row.
 *
 * Every function here is best-effort and never throws. Recording that an email
 * was sent must not be able to fail the send that already happened — the
 * message is gone, and turning that into a 502 would tell the operator their
 * email failed when it did not.
 */

const COLLECTION = "emailEvents";

export interface RecordEmailSentInput {
  messageId: string;
  agencyId: string;
  subAccountId: string;
  contactId: string | null;
  toEmail: string;
  subject: string;
  sentByUid: string | null;
  sentByEmail: string | null;
  source: EmailSource;
  sourceId?: string | null;
  replyTo?: string | null;
}

export async function recordEmailSent(
  input: RecordEmailSentInput,
): Promise<void> {
  try {
    // Doc id is the provider message id, so the webhook can find this row
    // without a query and a duplicated send cannot produce two rows.
    await getAdminDb()
      .collection(COLLECTION)
      .doc(input.messageId)
      .set(
        {
          messageId: input.messageId,
          agencyId: input.agencyId,
          subAccountId: input.subAccountId,
          contactId: input.contactId ?? null,
          toEmail: input.toEmail,
          subject: input.subject,
          sentByUid: input.sentByUid ?? null,
          sentByEmail: input.sentByEmail ?? null,
          source: input.source,
          sourceId: input.sourceId ?? null,
          replyTo: input.replyTo ?? null,
          status: "sent" satisfies EmailStatus,
          sentAt: FieldValue.serverTimestamp(),
          openedAt: null,
          clickedAt: null,
          bouncedAt: null,
          complainedAt: null,
          openCount: 0,
          clickCount: 0,
          failureDetail: null,
        },
        // Merge, because the provider can deliver an `opened` webhook before
        // this write lands on a fast open. Without merge, the send record
        // would wipe the open that arrived first.
        { merge: true },
      );
  } catch (err) {
    console.warn("[email-events] send record failed", err);
  }
}

/** The provider event kinds this service understands. */
export type ProviderEventKind =
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained";

/**
 * Apply one provider event to its row.
 *
 * Runs in a transaction and respects EMAIL_STATUS_RANK, because providers do
 * not guarantee ordering: a `delivered` can arrive after an `opened`, and a
 * naive write would erase the open. Engagement never downgrades a bounce or a
 * complaint either, since those are the states an operator has to act on.
 */
export async function applyProviderEmailEvent(input: {
  messageId: string;
  kind: ProviderEventKind;
  detail?: string | null;
}): Promise<{ applied: boolean; reason?: string }> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(input.messageId);

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        // A message we have no record of — most often mail sent before this
        // log existed, or from another product on the same Resend account.
        // Not an error, and deliberately not created here: a row with no
        // tenancy could not be shown in any workspace anyway.
        return { applied: false, reason: "unknown_message" };
      }

      const current = snap.data() as EmailEventDoc;
      const next = statusFor(input.kind);

      const patch: Record<string, unknown> = {};

      // Timestamps record the FIRST occurrence; counts record repeats. An
      // operator wants "when did they open it" and "did they come back",
      // which is two different questions.
      if (input.kind === "opened") {
        patch.openCount = FieldValue.increment(1);
        if (!current.openedAt) patch.openedAt = FieldValue.serverTimestamp();
      } else if (input.kind === "clicked") {
        patch.clickCount = FieldValue.increment(1);
        if (!current.clickedAt) patch.clickedAt = FieldValue.serverTimestamp();
        // A click implies an open, and some providers report the click
        // without a preceding open event.
        if (!current.openedAt) patch.openedAt = FieldValue.serverTimestamp();
      } else if (input.kind === "bounced") {
        if (!current.bouncedAt) patch.bouncedAt = FieldValue.serverTimestamp();
        if (input.detail) patch.failureDetail = input.detail.slice(0, 500);
      } else if (input.kind === "complained") {
        if (!current.complainedAt) {
          patch.complainedAt = FieldValue.serverTimestamp();
        }
        if (input.detail) patch.failureDetail = input.detail.slice(0, 500);
      }

      // Forward-only. See EMAIL_STATUS_RANK.
      if (next && EMAIL_STATUS_RANK[next] > EMAIL_STATUS_RANK[current.status]) {
        patch.status = next;
      }

      if (Object.keys(patch).length === 0) {
        return { applied: false, reason: "no_change" };
      }
      tx.update(ref, patch);
      return { applied: true };
    });
  } catch (err) {
    console.warn("[email-events] provider event failed", err);
    return { applied: false, reason: "error" };
  }
}

/** `delivered` carries no status of its own — "sent" already covers it. */
function statusFor(kind: ProviderEventKind): EmailStatus | null {
  switch (kind) {
    case "opened":
      return "opened";
    case "clicked":
      return "clicked";
    case "bounced":
      return "bounced";
    case "complained":
      return "complained";
    case "delivered":
      return null;
  }
}
