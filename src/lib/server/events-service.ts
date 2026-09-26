import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import {
  serializeEventForApi,
  type EventApiObject,
} from "@/lib/api/serializers/events";
import { GLOBAL_TERRITORY_ID } from "@/types";

/**
 * Server-side calendar-event create — fires `event.created` from the
 * dashboard calendar (it used to be a direct client Firestore write).
 * Event edits + deletes have no webhook event, so they stay client-side.
 * Booking-page events go through the booking lifecycle (booking.created),
 * not this path.
 */

type Mode = "live" | "test";

async function territoryForContact(contactId: string | null): Promise<string> {
  if (!contactId) return GLOBAL_TERRITORY_ID;
  try {
    const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
    const raw = snap.data()?.territoryId;
    return typeof raw === "string" ? raw : GLOBAL_TERRITORY_ID;
  } catch {
    return GLOBAL_TERRITORY_ID;
  }
}

function formatShort(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface CreateEventInput {
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  mode: Mode;
  title: string;
  startAt: Date;
  endAt: Date;
  contactId: string | null;
  location: string;
  notes: string;
  meetingUrl?: string | null;
}

export interface EventWriteResult {
  id: string;
  event: EventApiObject;
}

/** Create a manual calendar event + activity row + emit `event.created`. */
export async function createEventServerSide(
  input: CreateEventInput,
): Promise<EventWriteResult> {
  const db = getAdminDb();
  const territoryId = await territoryForContact(input.contactId);
  const ref = db.collection("events").doc();

  const doc = {
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
    contactId: input.contactId,
    location: input.location,
    notes: input.notes,
    meetingUrl: input.meetingUrl ?? null,
    status: "scheduled",
    source: "manual",
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    createdByUid: input.createdByUid,
    territoryId,
    mode: input.mode,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(doc);

  // Mirror the client's activity write so the contact timeline is unchanged.
  if (input.contactId) {
    try {
      await db
        .collection("contacts")
        .doc(input.contactId)
        .collection("activities")
        .add({
          type: "booking_created",
          createdBy: input.createdByUid,
          content: `Event "${input.title}" scheduled for ${formatShort(input.startAt)}`,
          meta: { bookingId: ref.id },
          createdAt: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      console.warn("[events-service] activity write failed", err);
    }
  }

  const now = new Date();
  const event = serializeEventForApi(
    ref.id,
    { ...doc, createdAt: now, updatedAt: now },
    input.mode,
  );

  void emitWebhookEvent({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    mode: input.mode,
    type: "event.created",
    payload: { event },
  });

  return { id: ref.id, event };
}

/** This workspace's calendar events, soonest first. */
export async function listEventsServerSide(
  subAccountId: string,
  opts: { limit?: number } = {},
): Promise<{ id: string; title: string; startAt: Date | null; endAt: Date | null; location: string | null; contactId: string | null; status: string }[]> {
  const snap = await getAdminDb()
    .collection("events")
    .where("subAccountId", "==", subAccountId)
    .get();
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        title: String(x.title ?? ""),
        startAt: x.startAt?.toDate?.() ?? (x.startAt instanceof Date ? x.startAt : null),
        endAt: x.endAt?.toDate?.() ?? (x.endAt instanceof Date ? x.endAt : null),
        location: (x.location as string) ?? null,
        contactId: (x.contactId as string) ?? null,
        status: String(x.status ?? "scheduled"),
      };
    })
    .sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0))
    .slice(0, opts.limit ?? 50);
}

/**
 * Move or rename a calendar event.
 *
 * `expectedSubAccountId` is required, not optional: every id this will see
 * comes from a model, and a foreign id returns null exactly as a missing one
 * does, so guessing an id cannot confirm it exists.
 *
 * Deliberately refuses an event that came from a BOOKING. Those carry their
 * own lifecycle, reschedule and cancellation emails, ICS sequencing and
 * reminder jobs; moving the row underneath that would leave the attendee
 * holding a confirmation for a time nobody will be there.
 */
/** Firestore hands back a Timestamp, a Date, or nothing. */
function toDateOrNull(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date };
  return typeof t.toDate === "function" ? t.toDate() : null;
}

/**
 * MOVING AN EVENT MOVES BOTH ENDS.
 *
 * "Preserve everything the caller did not ask to change" is right for
 * independent fields and wrong for these two, because they are one interval.
 * Preserving endAt literally while startAt moved produced a 30-minute meeting
 * that started at 18:00 and ended at 16:30 - an event that ends before it
 * begins, which no calendar can render and nothing downstream was catching.
 * It was found by reading the stored document after a live edit, not by any
 * test, because every field had been "preserved" exactly as asked.
 *
 * "Move it to 6pm" means the same meeting, later, so a new start with no new
 * end carries the existing duration with it. An explicit end is honoured as
 * given, and an interval that runs backwards is refused rather than stored.
 *
 * Exported and pure so the rule can be tested without Firestore.
 */
export function resolveEventInterval(input: {
  currentStart: Date | null;
  currentEnd: Date | null;
  nextStart?: Date;
  nextEnd?: Date;
}): { startAt?: Date; endAt?: Date } | { refused: "interval" } {
  const { currentStart, currentEnd, nextStart, nextEnd } = input;
  let endAt = nextEnd;
  if (endAt === undefined) {
    endAt =
      nextStart && currentStart && currentEnd
        ? new Date(nextStart.getTime() + (currentEnd.getTime() - currentStart.getTime()))
        : (currentEnd ?? undefined);
  }
  const startAt = nextStart ?? currentStart;
  if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
    return { refused: "interval" };
  }
  return {
    ...(nextStart !== undefined ? { startAt: nextStart } : {}),
    ...(endAt !== undefined ? { endAt } : {}),
  };
}

export async function updateEventServerSide(opts: {
  eventId: string;
  expectedSubAccountId: string;
  title?: string;
  startAt?: Date;
  endAt?: Date;
  location?: string | null;
  notes?: string | null;
}): Promise<{ id: string; title: string } | { refused: "booking" | "interval" } | null> {
  const db = getAdminDb();
  const ref = db.doc(`events/${opts.eventId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const existing = snap.data()!;
  if (existing.subAccountId !== opts.expectedSubAccountId) return null;
  if (existing.bookingPageId || existing.source === "booking") return { refused: "booking" };

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (opts.title !== undefined) patch.title = opts.title;
  if (opts.location !== undefined) patch.location = opts.location;
  if (opts.notes !== undefined) patch.notes = opts.notes;

  /**
   * MOVING AN EVENT MOVES BOTH ENDS.
   *
   * "Preserve what was not asked about" is right for independent fields and
   * wrong for these two: they are one interval. Preserving endAt literally
   * while startAt moved produced a 30-minute meeting that started at 18:00
   * and ended at 16:30 — an event that ends before it begins, which no
   * calendar can render and no validator downstream was catching.
   *
   * "Move it to 6pm" means the same meeting, later. So a start with no end
   * carries the existing duration with it. An explicit end is still honoured
   * exactly as given, and an interval that runs backwards is refused rather
   * than stored.
   */
  if (opts.startAt !== undefined || opts.endAt !== undefined) {
    const moved = resolveEventInterval({
      currentStart: toDateOrNull(existing.startAt),
      currentEnd: toDateOrNull(existing.endAt),
      nextStart: opts.startAt,
      nextEnd: opts.endAt,
    });
    if ("refused" in moved) return { refused: "interval" };
    if (moved.startAt !== undefined) patch.startAt = moved.startAt;
    if (moved.endAt !== undefined) patch.endAt = moved.endAt;
  }
  await ref.set(patch, { merge: true });

  const title = String(patch.title ?? existing.title ?? "");
  void emitWebhookEvent({
    subAccountId: opts.expectedSubAccountId,
    agencyId: String(existing.agencyId ?? ""),
    mode: (existing.mode as Mode) ?? "live",
    type: "event.updated",
    payload: { event: { id: opts.eventId, title } },
  });
  return { id: opts.eventId, title };
}
