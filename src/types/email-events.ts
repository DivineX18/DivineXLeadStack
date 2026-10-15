import type { FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * One row per email this workspace sends, and what happened to it.
 *
 * WHY A TOP-LEVEL COLLECTION. Sends were already recorded as an `email_sent`
 * activity under the contact, which is right for reading one person's history
 * and useless for every other question: "what did my team send this week",
 * "is anyone opening these", "how is this rep doing". Those need a query
 * across contacts, and activities carry no tenancy field, so a collection-
 * group query over them could not be scoped to a workspace safely.
 *
 * The activity write stays — the contact timeline is still the right place to
 * read one conversation. This is the queryable mirror, and the row the Resend
 * webhook updates when the message is opened, clicked, bounced or complained
 * about.
 *
 * Doc id is the Resend message id, so a webhook delivered twice updates one
 * row rather than creating two, and a send that never got an id never
 * collides with one that did.
 */
export interface EmailEventDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  /** Resend's message id. Also the doc id; duplicated for serialization. */
  messageId: string;

  contactId: string | null;
  toEmail: string;
  subject: string;

  /** Who sent it. Null for automated sends, which no person triggered. */
  sentByUid: string | null;
  sentByEmail: string | null;

  /**
   * Which part of the product sent it, so a rep's one-to-one outreach is never
   * averaged together with a 2,000-recipient broadcast.
   */
  source: EmailSource;
  /** Broadcast or workflow id, when the send came from one. */
  sourceId: string | null;

  /** Where a reply goes. Recorded because it varies per source and is the
   *  single most confusing thing about email in a shared workspace. */
  replyTo: string | null;

  status: EmailStatus;

  sentAt: Timestamp | FieldValue;
  /** First open. Null until Resend reports one, which needs the webhook. */
  openedAt: Timestamp | FieldValue | null;
  clickedAt: Timestamp | FieldValue | null;
  bouncedAt: Timestamp | FieldValue | null;
  complainedAt: Timestamp | FieldValue | null;
  /** Opens after the first. A single number, because the useful question is
   *  "did they come back to it", not a full event log per recipient. */
  openCount: number;
  clickCount: number;
  /** Bounce or complaint detail from the provider, for the one case where an
   *  operator needs to know WHY a send failed. */
  failureDetail: string | null;

  /**
   * True when this row was RECOVERED from an older record (a contact's
   * `email_sent` activity, or a broadcast send row) rather than written at
   * send time.
   *
   * It exists to stop the log lying. Nothing was watching those sends, so
   * their engagement is UNKNOWN, not zero — and a row with `openedAt: null`
   * is otherwise indistinguishable from one that was tracked and genuinely
   * never opened. Without this flag a backfill would quietly drag every open
   * rate towards zero and make a team look worse than it is.
   *
   * Absent on rows written at send time, which read as false.
   */
  backfilled?: boolean;
  /** Where a recovered row came from, for anyone auditing the backfill. */
  backfillSource?: "activity" | "broadcast";
}

export const EMAIL_SOURCES = [
  /** A person wrote this to one contact from the contact profile. */
  "manual",
  /** Bulk send to a filtered audience. */
  "broadcast",
  /** A workflow step fired it. */
  "workflow",
  /** Quote, invoice, booking confirmation and the like. */
  "transactional",
] as const;
export type EmailSource = (typeof EMAIL_SOURCES)[number];

export const EMAIL_STATUSES = [
  "sent",
  "opened",
  "clicked",
  "bounced",
  "complained",
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/**
 * Status only ever moves forward, and engagement never overwrites a failure.
 * Resend does not guarantee ordering, so a delivered-then-opened pair can
 * arrive reversed; without a rank, a late "sent" would erase a recorded open.
 */
export const EMAIL_STATUS_RANK: Record<EmailStatus, number> = {
  sent: 0,
  opened: 1,
  clicked: 2,
  // Terminal. A bounce or complaint outranks engagement because it is the
  // thing an operator has to act on.
  bounced: 3,
  complained: 4,
};
