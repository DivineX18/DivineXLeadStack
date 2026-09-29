import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { sendEmail, workspaceSender } from "@/lib/comms/resend";
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
        ${
          input.attendeeEmailFailed
            ? `<p style="margin:16px 0 0;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:13px;color:#991b1b;">The confirmation email to the attendee could not be sent, so they have <strong>not</strong> received the details or a reschedule link. Please contact them directly.</p>`
            : ""
        }
      </div>`;

    // sendEmail takes one recipient. Sent individually and settled
    // independently so one bad address cannot suppress everyone else's copy.
    const results = await Promise.allSettled(
      to.map((recipient) =>
        sendEmail({
          to: recipient,
          subject: `New booking: ${input.attendeeName}, ${input.whenLabel}`,
          text: lines.join("\n"),
          html,
          ...workspaceSender(input.sub),
          // Replying should reach the person who booked, not the workspace.
          replyTo: input.attendeeEmail,
        }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error(
        `[booking/notify] ${failed.length}/${to.length} operator notifications failed`,
        (failed[0] as PromiseRejectedResult).reason,
      );
    }
  } catch (err) {
    console.error("[booking/notify] operator notification failed", err);
  }
}
