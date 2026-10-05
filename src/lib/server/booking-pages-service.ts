import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveBookingHosts } from "@/lib/booking/hosts";
import { validateBookingPageFormData } from "@/lib/booking/validation";
import { GLOBAL_TERRITORY_ID } from "@/types";
import type { BookingPage } from "@/types/booking";

/**
 * Booking-page creation, extracted from the POST route so Zeno and the
 * editor create pages through the SAME code.
 *
 * Extracted rather than reimplemented for the reason that matters: the guards
 * here are not incidental. The PayPal check stops a page rendering a Pay
 * button that goes nowhere; host resolution refuses to trust client-supplied
 * names and drops members who are no longer active; the doc id IS the slug, so
 * `create()` is the uniqueness check. A second creation path would have to
 * re-earn every one of those, and would drift the first time one changed.
 */

export class BookingPageError extends Error {
  constructor(message: string, readonly code: "invalid" | "conflict" | "not_configured" = "invalid") {
    super(message);
  }
}

export async function createBookingPageServerSide(opts: {
  subAccountId: string;
  createdByUid: string;
  /** Raw form data — validated here, by the same validator the route uses. */
  data: unknown;
}): Promise<{ slug: string }> {
  const validated = validateBookingPageFormData(opts.data);
  if (!validated.ok) throw new BookingPageError(validated.error);
  const data = validated.value;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  if (!subSnap.exists) throw new BookingPageError("Sub-account not found.");
  const sub = subSnap.data() ?? {};
  const agencyId = (sub.agencyId as string | undefined) ?? null;
  if (!agencyId) throw new BookingPageError("Sub-account is missing tenancy metadata.");

  // A paid page without a payment method would show the visitor a Pay button
  // that goes nowhere — refuse rather than publish a dead end.
  if (data.payment && !sub.paypalConfig) {
    throw new BookingPageError(
      "Connect a PayPal.me username under Settings → Payments before requiring payment on a booking page.",
      "not_configured",
    );
  }

  const territoryId =
    data.defaultTerritoryId && data.defaultTerritoryId !== GLOBAL_TERRITORY_ID
      ? data.defaultTerritoryId
      : GLOBAL_TERRITORY_ID;

  // Live membership decides the hosts — never the caller's list.
  const hosts = await resolveBookingHosts(opts.subAccountId, data.hosts);

  const ref = db.doc(`subAccounts/${opts.subAccountId}/bookingPages/${data.slug}`);
  const now = FieldValue.serverTimestamp();
  try {
    await ref.create({
      ...data,
      hosts,
      id: data.slug,
      agencyId,
      subAccountId: opts.subAccountId,
      createdByUid: opts.createdByUid,
      territoryId,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: number | string }).code
      : null;
    if (code === 6 || code === "already-exists") {
      throw new BookingPageError(
        `A booking page with the slug "${data.slug}" already exists. Pick another.`,
        "conflict",
      );
    }
    throw err;
  }

  return { slug: data.slug };
}

/** This workspace's booking pages — what Zeno reads to wire a page's CTA to a
 *  real calendar instead of inventing a link. */
export async function listBookingPages(subAccountId: string): Promise<BookingPage[]> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/bookingPages`)
    .limit(50)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BookingPage, "id">) }));
}

/** The properties an assistant may change on a booking page. */
export interface BookingPagePatch {
  name?: string;
  description?: string;
  durationMinutes?: number;
  bufferMinutes?: number;
  visibleDays?: number;
  minNoticeHours?: number;
  maxPerDay?: number | null;
  status?: "draft" | "published";
  /** Replace ONE day's availability window, leaving the other days alone. */
  workingHour?: { dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; startMinute: number; endMinute: number } | null;
  /** The extra questions asked at booking time, edited one at a time so a
   *  generated payload cannot erase the ones it did not mention. The editor
   *  already configures these; this exposes the same field, not a new one. */
  addIntakeField?: { label: string; type: "text" | "textarea" | "select"; required?: boolean; options?: string[]; afterFieldId?: string };
  updateIntakeField?: { fieldId: string; label?: string; required?: boolean; options?: string[] };
  removeIntakeFieldId?: string;
  reorderIntakeFieldIds?: string[];
}

/**
 * PATCH a booking page: read the current one, change only what was named,
 * then validate the WHOLE thing the way the editor does.
 *
 * The PATCH route is a full replace, which is right for a form that submits
 * every field and wrong for a generated payload: anything the model omitted
 * would be erased. So this merges first and validates after, which keeps the
 * one validator rather than growing a second, weaker one.
 *
 * Deliberately NOT patchable here:
 *   - slug, because the doc id IS the slug and changing it orphans every
 *     public link already shared and the /e/[token] reschedule pages.
 *   - payment, because turning payment on has a PayPal precondition and
 *     money is an operator decision.
 *   - hosts, which are resolved against live membership, and territory.
 *
 * `workingHour` replaces one day rather than the whole week, so "open
 * Saturdays too" cannot silently clear Monday to Friday.
 */
export async function patchBookingPageServerSide(opts: {
  subAccountId: string;
  slug: string;
  patch: BookingPagePatch;
}): Promise<{ ok: true; slug: string; name: string; changed: string[] } | { ok: false; reason: "missing" | "nothing" | "invalid"; error?: string }> {
  const db = getAdminDb();
  // Path-scoped: a slug from another workspace resolves to a document that
  // does not exist here, so a foreign id behaves like a missing one.
  const ref = db.doc(`subAccounts/${opts.subAccountId}/bookingPages/${opts.slug}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "missing" };
  const current = { id: snap.id, ...(snap.data() as Omit<BookingPage, "id">) };

  const p = opts.patch;
  const changed: string[] = [];
  const next: Record<string, unknown> = {
    slug: opts.slug,
    name: current.name,
    description: current.description,
    status: current.status,
    durationMinutes: current.durationMinutes,
    bufferMinutes: current.bufferMinutes,
    workingHours: current.workingHours,
    timezone: current.timezone,
    visibleDays: current.visibleDays,
    minNoticeHours: current.minNoticeHours,
    maxPerDay: current.maxPerDay,
    intakeFields: current.intakeFields,
    hosts: current.hosts,
    logoUrl: current.logoUrl,
    accentColor: current.accentColor,
    meetingUrl: current.meetingUrl,
    confirmationMessage: current.confirmationMessage,
    redirectUrl: current.redirectUrl,
    redirectAppendParams: current.redirectAppendParams,
    remindersEnabled: current.remindersEnabled,
    reminderOffsetsMinutes: current.reminderOffsetsMinutes,
    payment: current.payment,
    defaultTerritoryId: current.defaultTerritoryId,
  };

  const scalars: (keyof BookingPagePatch)[] = [
    "name", "description", "durationMinutes", "bufferMinutes",
    "visibleDays", "minNoticeHours", "maxPerDay", "status",
  ];
  for (const key of scalars) {
    if (p[key] !== undefined) {
      next[key] = p[key];
      changed.push(key);
    }
  }

  if (p.workingHour !== undefined && p.workingHour !== null) {
    const day = p.workingHour.dayOfWeek;
    const rest = (current.workingHours ?? []).filter((w) => w.dayOfWeek !== day);
    next.workingHours = [...rest, p.workingHour].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    changed.push("availability");
  } else if (p.workingHour === null) {
    return { ok: false, reason: "invalid", error: "To close a day, send its hours as a zero-length window instead of null." };
  }

  // The intake questions, edited ONE at a time. The whole list is rewritten
  // on save, so a generated payload that named only the question it cared
  // about would otherwise erase the rest.
  {
    const fields = [...(current.intakeFields ?? [])];
    if (p.addIntakeField) {
      const label = p.addIntakeField.label.trim();
      if (!label) return { ok: false, reason: "invalid", error: "A question needs its wording." };
      if (fields.some((f) => f.label.trim().toLowerCase() === label.toLowerCase())) {
        return { ok: false, reason: "invalid", error: "This booking page already asks that question." };
      }
      const field = {
        id: `q_${Math.random().toString(36).slice(2, 10)}`,
        label,
        type: p.addIntakeField.type,
        required: p.addIntakeField.required === true,
        options: p.addIntakeField.type === "select" ? (p.addIntakeField.options ?? []) : null,
      };
      const at = p.addIntakeField.afterFieldId
        ? fields.findIndex((f) => f.id === p.addIntakeField!.afterFieldId)
        : -1;
      if (p.addIntakeField.afterFieldId && at === -1) {
        return { ok: false, reason: "invalid", error: "That question isn't on this booking page." };
      }
      if (at >= 0) fields.splice(at + 1, 0, field);
      else fields.push(field);
      next.intakeFields = fields;
      changed.push("questions");
    }
    if (p.updateIntakeField) {
      const i = fields.findIndex((f) => f.id === p.updateIntakeField!.fieldId);
      if (i === -1) return { ok: false, reason: "invalid", error: "That question isn't on this booking page." };
      fields[i] = {
        ...fields[i],
        ...(p.updateIntakeField.label !== undefined ? { label: p.updateIntakeField.label.trim() } : {}),
        ...(p.updateIntakeField.required !== undefined ? { required: p.updateIntakeField.required } : {}),
        ...(p.updateIntakeField.options !== undefined ? { options: p.updateIntakeField.options } : {}),
      };
      next.intakeFields = fields;
      changed.push("questions");
    }
    if (p.removeIntakeFieldId) {
      const i = fields.findIndex((f) => f.id === p.removeIntakeFieldId);
      if (i === -1) return { ok: false, reason: "invalid", error: "That question isn't on this booking page." };
      fields.splice(i, 1);
      next.intakeFields = fields;
      changed.push("questions");
    }
    if (p.reorderIntakeFieldIds?.length) {
      const named = p.reorderIntakeFieldIds
        .map((id) => fields.find((f) => f.id === id))
        .filter((f): f is (typeof fields)[number] => !!f);
      if (named.length === 0) return { ok: false, reason: "invalid", error: "None of those questions are on this booking page." };
      // Anything left out keeps its place at the end rather than vanishing.
      next.intakeFields = [...named, ...fields.filter((f) => !named.some((n) => n.id === f.id))];
      changed.push("questions");
    }
  }

  if (changed.length === 0) return { ok: false, reason: "nothing" };

  // The same validator the editor uses, run on the merged whole.
  const validated = validateBookingPageFormData(next);
  if (!validated.ok) return { ok: false, reason: "invalid", error: validated.error };

  await ref.update({
    ...validated.value,
    // Hosts and territory are resolved elsewhere and must survive untouched.
    hosts: current.hosts,
    territoryId: snap.data()?.territoryId ?? GLOBAL_TERRITORY_ID,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, slug: opts.slug, name: String(next.name), changed };
}
