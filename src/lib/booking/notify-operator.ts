import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { Resend } from "resend";

import { sendEmail, workspaceSender, tenantFrom } from "@/lib/comms/resend";
import { generateIcs } from "@/lib/booking/ics";
import { buildCalendarLinks } from "@/lib/booking/add-to-calendar";
import type { SubAccountMemberDoc } from "@/types/tenancy";

/**
 * TELL THE OPERATOR SOMEBODY BOOKED.
 *
 * The booking route notified the attendee, wrote the activity row, fired the
 * automation trigger and emitted the webhook, and told the person whose
 * calendar it lands on precisely nothing. The only path that reached them was
 * web push, which needs VAPID keys, a subscribed device, and on iPhone an
 * app installed to the home screen. When any of those is missing a real
 * booking arrives in silence, which is how this was reported.
 *
 * Email is the floor. It needs no device, no install and no opt-in.
 *
 * Best-effort by design: a booking that is already committed must never fail
 * because a notification could not be sent. Failures are logged, loudly.
 */

interface NotifyInput {
  subAccountId: string;
  sub: Parameters<typeof workspaceSender>[0];
  assignedHostUid?: string | null;
  pageName: string;
  eventTitle: string;
  whenLabel: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  /** Deep link to the event inside the workspace. */
  eventUrl: string;
  /** True when the attendee's confirmation email could NOT be sent, so the
   *  operator knows to reach out by hand instead of assuming it arrived. */
  attendeeEmailFailed: boolean;
  /** Calendar invite for the operator. Without this the booking never
   *  reaches their calendar at all, so there is nothing for a later
   *  reschedule or cancellation to update. */
  ics?: OperatorIcs | null;
}

export interface OperatorIcs {
  eventId: string;
  startAt: Date;
  endAt: Date;
  title: string;
  description?: string;
  location?: string;
  domain: string;
  organizerEmail?: string;
  organizerName?: string;
  attendeeEmail: string;
  attendeeName?: string;
  method: "REQUEST" | "CANCEL";
  /**
   * Must INCREASE on every update or calendar apps ignore the newer copy.
   * Seconds since the epoch, computed once per change and shared by the
   * attendee and operator copies so both describe the same revision.
   */
  sequence: number;
}

/** A monotonic SEQUENCE. Reschedule previously hardcoded 1, so a SECOND
 *  reschedule was not newer than the first and calendar clients kept the
 *  stale time. */
export function icsSequenceNow(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Who hears about it: the assigned host when the page runs as a team,
 * otherwise every active admin. Falling back to admins matters because a
 * single-host page has no assignment and would otherwise notify nobody.
 */
/** The selection rule, pure so it can be tested without Firestore. */
export function selectBookingNotifyRecipients(
  members: Array<Pick<SubAccountMemberDoc, "uid" | "email" | "status" | "role">>,
  assignedHostUid?: string | null,
): string[] {
  const active = members.filter(
    (m) => m.status === "active" && typeof m.email === "string" && m.email.includes("@"),
  );
  // A team page assigns the booking, and only that host needs it. A host who
  // has since been removed falls through to the admins rather than silently
  // notifying nobody.
  if (assignedHostUid) {
    const host = active.find((m) => m.uid === assignedHostUid);
    if (host) return [host.email];
  }
  const admins = active.filter((m) => m.role === "admin");
  // No admin at all still has to reach someone, so any active member will do.
  return [...new Set((admins.length > 0 ? admins : active).map((m) => m.email))].slice(0, 10);
}

/**
 * Who hears about it: the assigned host when the page runs as a team,
 * otherwise every active admin.
 */
export async function resolveBookingNotifyRecipients(
  subAccountId: string,
  assignedHostUid?: string | null,
): Promise<string[]> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/subAccountMembers`)
    .get();
  const members = snap.docs.map((d) => {
    const m = d.data() as SubAccountMemberDoc;
    // Legacy rows key the member only by document id.
    return { ...m, uid: m.uid ?? d.id };
  });
  return selectBookingNotifyRecipients(members, assignedHostUid);
}



/** Same one-click row the attendee gets. The ICS covers Apple and desktop
 *  Outlook; Google and Outlook web need a URL. */
function operatorCalendarHtml(ics: OperatorIcs | null | undefined): string {
  if (!ics || ics.method === "CANCEL") return "";
  const links = buildCalendarLinks({
    title: ics.title,
    startAt: ics.startAt,
    endAt: ics.endAt,
    details: ics.description,
    location: ics.location,
  });
  if (!links) return "";
  const a = (href: string, label: string) =>
    `<a href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" style="display:inline-block;border:1px solid #d7d9e0;border-radius:8px;padding:8px 14px;margin:0 8px 8px 0;font-size:13px;color:#0F766E;text-decoration:none;">${label}</a>`;
  return `<p style="margin:18px 0 6px;font-size:13px;color:#6a6a74;">Add it to your calendar</p><p style="margin:0 0 4px;">${a(links.google, "Google Calendar")}${a(links.outlook, "Outlook")}</p><p style="margin:0 0 8px;font-size:12px;color:#9a9aa4;">Apple Calendar and Outlook desktop: open the attached invite.</p>`;
}

function operatorCalendarText(ics: OperatorIcs | null | undefined): string[] {
  if (!ics || ics.method === "CANCEL") return [];
  const links = buildCalendarLinks({
    title: ics.title,
    startAt: ics.startAt,
    endAt: ics.endAt,
    details: ics.description,
    location: ics.location,
  });
  if (!links) return [];
  return ["", "Add it to your calendar:", `Google: ${links.google}`, `Outlook: ${links.outlook}`];
}

/** sendEmail() cannot carry attachments, so an ICS goes through Resend
 *  directly. Falls back to the plain path when there is nothing to attach
 *  or the direct send is not possible. */
async function sendToOperator(input: {
  to: string[];
  subject: string;
  text: string;
  html: string;
  sub: Parameters<typeof workspaceSender>[0];
  replyTo?: string;
  ics?: OperatorIcs | null;
}): Promise<void> {
  const sender = workspaceSender(input.sub);
  const attachments = input.ics
    ? [
        {
          filename: input.ics.method === "CANCEL" ? "cancel.ics" : "invite.ics",
          content: Buffer.from(
            generateIcs({
              uid: input.ics.eventId,
              domain: input.ics.domain,
              startAt: input.ics.startAt,
              endAt: input.ics.endAt,
              summary: input.ics.title,
              description: input.ics.description ?? "",
              location: input.ics.location ?? "",
              method: input.ics.method,
              status: input.ics.method === "CANCEL" ? "CANCELLED" : "CONFIRMED",
              sequence: input.ics.sequence,
              attendeeEmail: input.ics.attendeeEmail,
              attendeeName: input.ics.attendeeName,
              organizerEmail: input.ics.organizerEmail,
              organizerName: input.ics.organizerName,
            }),
            "utf-8",
          ).toString("base64"),
        },
      ]
    : undefined;

  const key = process.env.RESEND_API_KEY;
  const from = tenantFrom(input.sub) ?? sender.from ?? process.env.EMAIL_FROM;
  const canAttach = Boolean(attachments && key && from);

  // Sent per recipient and settled independently, so one bad address cannot
  // suppress everyone else's copy.
  const results = await Promise.allSettled(
    input.to.map(async (recipient) => {
      if (canAttach) {
        const client = new Resend(key);
        await client.emails.send({
          from: from as string,
          to: recipient,
          subject: input.subject,
          text: input.text,
          html: input.html,
          replyTo: input.replyTo,
          attachments,
        });
        return;
      }
      await sendEmail({
        to: recipient,
        subject: input.subject,
        text: input.text,
        html: input.html,
        ...sender,
        replyTo: input.replyTo,
      });
    }),
  );
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(
      `[booking/notify] ${failed.length}/${input.to.length} operator notifications failed`,
      (failed[0] as PromiseRejectedResult).reason,
    );
  }
}

export async function notifyOperatorOfBooking(input: NotifyInput): Promise<void> {
  try {
    const to = await resolveBookingNotifyRecipients(input.subAccountId, input.assignedHostUid);
    if (to.length === 0) {
      console.error(
        `[booking/notify] no active member with an email in ${input.subAccountId}; nobody was told about this booking`,
      );
      return;
    }

    const warn = input.attendeeEmailFailed
      ? "\n\nHEADS UP: the confirmation email to the attendee could not be sent, so they have NOT received the details or a reschedule link. Please contact them directly."
      : "";

    const lines = [
      `${input.attendeeName} booked ${input.pageName}.`,
      "",
      `When:    ${input.whenLabel}`,
      `Name:    ${input.attendeeName}`,
      `Email:   ${input.attendeeEmail}`,
      ...(input.attendeePhone ? [`Phone:   ${input.attendeePhone}`] : []),
      ...(input.meetingUrl ? [`Meeting: ${input.meetingUrl}`] : []),
      ...(input.notes ? ["", `Notes: ${input.notes}`] : []),
      "",
      `Open it here: ${input.eventUrl}`,
      ...operatorCalendarText(input.ics),
      warn,
    ];

    const esc = (v: string) =>
      v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const row = (k: string, v: string) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#6a6a74;font-size:14px;">${k}</td><td style="padding:4px 0;font-size:14px;"><strong>${esc(v)}</strong></td></tr>`;

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;">
        <h2 style="margin:0 0 4px;font-size:18px;">New booking</h2>
        <p style="margin:0 0 16px;color:#6a6a74;font-size:14px;">${esc(input.attendeeName)} booked ${esc(input.pageName)}.</p>
        <table style="border-collapse:collapse;margin-bottom:16px;">
          ${row("When", input.whenLabel)}
          ${row("Name", input.attendeeName)}
          ${row("Email", input.attendeeEmail)}
          ${input.attendeePhone ? row("Phone", input.attendeePhone) : ""}
          ${input.meetingUrl ? `<tr><td style="padding:4px 12px 4px 0;color:#6a6a74;font-size:14px;">Meeting</td><td style="padding:4px 0;font-size:14px;"><a href="${esc(input.meetingUrl)}">${esc(input.meetingUrl)}</a></td></tr>` : ""}
        </table>
        ${input.notes ? `<p style="margin:0 0 16px;font-size:14px;"><span style="color:#6a6a74;">Notes:</span> ${esc(input.notes)}</p>` : ""}
        <p style="margin:0 0 16px;"><a href="${esc(input.eventUrl)}" style="background:#0F766E;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;">Open the booking</a></p>
        ${operatorCalendarHtml(input.ics)}
        ${
          input.attendeeEmailFailed
            ? `<p style="margin:16px 0 0;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:13px;color:#991b1b;">The confirmation email to the attendee could not be sent, so they have <strong>not</strong> received the details or a reschedule link. Please contact them directly.</p>`
            : ""
        }
      </div>`;

    await sendToOperator({
      to,
      subject: `New booking: ${input.attendeeName}, ${input.whenLabel}`,
      text: lines.join("\n"),
      html,
      sub: input.sub,
      // Replying should reach the person who booked, not the workspace.
      replyTo: input.attendeeEmail,
      ics: input.ics ?? null,
    });
  } catch (err) {
    console.error("[booking/notify] operator notification failed", err);
  }
}

/**
 * Tell the operator a booking MOVED or was CANCELLED.
 *
 * Reported after the new-booking notification shipped: the attendee's
 * updated confirmation went out on reschedule and the operator heard
 * nothing, so the new time never reached the person who has to be there.
 * Cancellation had the same gap and only looked covered because the
 * operator had booked as the attendee while testing.
 *
 * The ICS carries the SAME uid as the original with a higher SEQUENCE, so
 * the operator's calendar moves the existing entry instead of adding a
 * second one. Best-effort: the change is already committed and must not be
 * undone by a mail failure.
 */
export async function notifyOperatorOfBookingChange(input: {
  subAccountId: string;
  sub: Parameters<typeof workspaceSender>[0];
  assignedHostUid?: string | null;
  change: "rescheduled" | "cancelled";
  pageName: string;
  attendeeName: string;
  attendeeEmail: string;
  /** The time it moved TO, or the time that was cancelled. */
  whenLabel: string;
  /** Only for a reschedule: the time it moved FROM. */
  previousWhenLabel?: string | null;
  cancelReason?: string | null;
  eventUrl: string;
  ics?: OperatorIcs | null;
}): Promise<void> {
  try {
    const to = await resolveBookingNotifyRecipients(input.subAccountId, input.assignedHostUid);
    if (to.length === 0) {
      console.error(
        `[booking/notify] no active member with an email in ${input.subAccountId}; nobody was told this booking was ${input.change}`,
      );
      return;
    }

    const moved = input.change === "rescheduled";
    const headline = moved
      ? `${input.attendeeName} moved ${input.pageName}.`
      : `${input.attendeeName} cancelled ${input.pageName}.`;

    const lines = [
      headline,
      "",
      ...(moved && input.previousWhenLabel ? [`Was:  ${input.previousWhenLabel}`] : []),
      `${moved ? "Now: " : "When:"} ${input.whenLabel}`,
      `Name:  ${input.attendeeName}`,
      `Email: ${input.attendeeEmail}`,
      ...(input.cancelReason ? ["", `Reason: ${input.cancelReason}`] : []),
      "",
      moved
        ? "The attached invite updates the entry already on your calendar."
        : "The attached update removes it from your calendar.",
      "",
      `Open it here: ${input.eventUrl}`,
      ...operatorCalendarText(input.ics),
    ];

    const esc = (v: string) =>
      v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const row = (k: string, v: string, strike = false) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#6a6a74;font-size:14px;">${k}</td><td style="padding:4px 0;font-size:14px;${strike ? "text-decoration:line-through;color:#6a6a74;" : ""}"><strong>${esc(v)}</strong></td></tr>`;

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;">
        <h2 style="margin:0 0 4px;font-size:18px;">${moved ? "Booking moved" : "Booking cancelled"}</h2>
        <p style="margin:0 0 16px;color:#6a6a74;font-size:14px;">${esc(headline)}</p>
        <table style="border-collapse:collapse;margin-bottom:16px;">
          ${moved && input.previousWhenLabel ? row("Was", input.previousWhenLabel, true) : ""}
          ${row(moved ? "Now" : "When", input.whenLabel)}
          ${row("Name", input.attendeeName)}
          ${row("Email", input.attendeeEmail)}
        </table>
        ${input.cancelReason ? `<p style="margin:0 0 16px;font-size:14px;"><span style="color:#6a6a74;">Reason:</span> ${esc(input.cancelReason)}</p>` : ""}
        <p style="margin:0 0 16px;font-size:13px;color:#6a6a74;">${moved ? "The attached invite updates the entry already on your calendar." : "The attached update removes it from your calendar."}</p>
        <p style="margin:0 0 4px;"><a href="${esc(input.eventUrl)}" style="background:#0F766E;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;">Open the booking</a></p>
        ${operatorCalendarHtml(input.ics)}
      </div>`;

    await sendToOperator({
      to,
      subject: moved
        ? `Moved: ${input.attendeeName}, now ${input.whenLabel}`
        : `Cancelled: ${input.attendeeName}, ${input.whenLabel}`,
      text: lines.join("\n"),
      html,
      sub: input.sub,
      replyTo: input.attendeeEmail,
      ics: input.ics ?? null,
    });
  } catch (err) {
    console.error(`[booking/notify] operator ${input.change} notification failed`, err);
  }
}
