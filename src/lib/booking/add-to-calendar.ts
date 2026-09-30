/**
 * One-click "add to calendar" links for the booking emails.
 *
 * The .ics attachment already covers Apple Calendar, iPhone and desktop
 * Outlook, where tapping the file adds the event. It does nothing for the
 * two biggest web calendars: Google and Outlook on the web both need a URL.
 * So the emails carry both, and between the attachment and these links
 * every common calendar is one or two clicks away.
 *
 * Pure and dependency-free: no dates are formatted for display here, only
 * encoded, so this is testable without a timezone database.
 */

export interface AddToCalendarInput {
  title: string;
  /** UTC instant. */
  startAt: Date;
  /** UTC instant. */
  endAt: Date;
  details?: string;
  location?: string;
}

export interface CalendarLinks {
  google: string;
  outlook: string;
}

/** Google and Outlook both want UTC basic-format: 20261001T140000Z. */
function toUtcBasic(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Returns null when the dates are unusable, so a caller renders nothing
 * rather than a link that opens an empty calendar entry.
 */
export function buildCalendarLinks(input: AddToCalendarInput): CalendarLinks | null {
  const { startAt, endAt } = input;
  if (
    !(startAt instanceof Date) ||
    !(endAt instanceof Date) ||
    Number.isNaN(startAt.getTime()) ||
    Number.isNaN(endAt.getTime()) ||
    endAt <= startAt
  ) {
    return null;
  }

  const title = input.title?.trim() || "Meeting";
  const details = input.details?.trim() ?? "";
  const location = input.location?.trim() ?? "";

  const google = new URL("https://calendar.google.com/calendar/render");
  google.searchParams.set("action", "TEMPLATE");
  google.searchParams.set("text", title);
  google.searchParams.set("dates", `${toUtcBasic(startAt)}/${toUtcBasic(endAt)}`);
  if (details) google.searchParams.set("details", details);
  if (location) google.searchParams.set("location", location);

  const outlook = new URL("https://outlook.live.com/calendar/0/deeplink/compose");
  outlook.searchParams.set("path", "/calendar/action/compose");
  outlook.searchParams.set("rru", "addevent");
  outlook.searchParams.set("subject", title);
  // Outlook wants ISO-8601 with offset; the UTC "Z" form is accepted.
  outlook.searchParams.set("startdt", startAt.toISOString());
  outlook.searchParams.set("enddt", endAt.toISOString());
  if (details) outlook.searchParams.set("body", details);
  if (location) outlook.searchParams.set("location", location);

  return { google: google.toString(), outlook: outlook.toString() };
}
