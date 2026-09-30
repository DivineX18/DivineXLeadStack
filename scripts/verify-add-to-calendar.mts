/**
 * One-click add-to-calendar in the booking emails.
 *
 * The .ics attachment already covers Apple, iPhone and desktop Outlook.
 * Google Calendar and Outlook on the web need a URL, and those are the two
 * most people actually use, so the emails carry both.
 */
import { buildCalendarLinks } from "../src/lib/booking/add-to-calendar";
import { renderBookingConfirmationEmail } from "../src/lib/booking/email";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? `, ${detail}` : ""}`);
}

const START = new Date("2026-10-01T14:00:00.000Z");
const END = new Date("2026-10-01T14:30:00.000Z");

console.log("══ the links themselves ══");
{
  const l = buildCalendarLinks({ title: "30-minute consultation", startAt: START, endAt: END, details: "Join: https://meet.example/x", location: "https://meet.example/x" });
  if (!l) { check("links were built", false); }
  else {
    const g = new URL(l.google), o = new URL(l.outlook);
    check("google points at the real render endpoint", g.origin + g.pathname === "https://calendar.google.com/calendar/render");
    check("google is a TEMPLATE action", g.searchParams.get("action") === "TEMPLATE");
    // The format Google actually requires: UTC basic, start/end.
    check("google carries the exact window in UTC basic form", g.searchParams.get("dates") === "20261001T140000Z/20261001T143000Z", String(g.searchParams.get("dates")));
    check("google carries the title", g.searchParams.get("text") === "30-minute consultation");
    check("google carries the meeting location", g.searchParams.get("location") === "https://meet.example/x");

    check("outlook points at the compose deeplink", o.origin + o.pathname === "https://outlook.live.com/calendar/0/deeplink/compose");
    check("outlook is an addevent action", o.searchParams.get("rru") === "addevent");
    check("outlook carries ISO start and end", o.searchParams.get("startdt") === START.toISOString() && o.searchParams.get("enddt") === END.toISOString());
    check("outlook carries the subject", o.searchParams.get("subject") === "30-minute consultation");

    // A title with & and ? must survive as data, not break the URL.
    const tricky = buildCalendarLinks({ title: "Q&A ?session #1", startAt: START, endAt: END })!;
    check("a title with & and ? is encoded, not lost", new URL(tricky.google).searchParams.get("text") === "Q&A ?session #1");
  }
}

console.log("\n══ it refuses to build a broken entry ══");
{
  check("end before start returns nothing", buildCalendarLinks({ title: "x", startAt: END, endAt: START }) === null);
  check("equal start and end returns nothing", buildCalendarLinks({ title: "x", startAt: START, endAt: START }) === null);
  check("an invalid date returns nothing", buildCalendarLinks({ title: "x", startAt: new Date("nope"), endAt: END }) === null);
  const untitled = buildCalendarLinks({ title: "   ", startAt: START, endAt: END });
  check("a blank title falls back rather than sending an empty one", new URL(untitled!.google).searchParams.get("text") === "Meeting");
}

console.log("\n══ the confirmation email carries them ══");
{
  const rendered = renderBookingConfirmationEmail({
    recipientName: "Sam",
    businessName: "Acme",
    businessLogoUrl: null,
    page: { name: "30-minute consultation", durationMinutes: 30, timezone: "UTC", payment: null, confirmationMessage: "" },
    startAt: START,
    endAt: END,
    meetingUrl: "https://meet.example/x",
    publicEventUrl: "https://crm.divinex.io/e/tok",
  });
  check("the HTML offers Google", rendered.html.includes("calendar.google.com/calendar/render"));
  check("the HTML offers Outlook", rendered.html.includes("outlook.live.com/calendar/0/deeplink/compose"));
  check("the HTML says where Apple users should look", /attached invite/i.test(rendered.html));
  check("the plain-text body offers them too", rendered.text.includes("calendar.google.com") && rendered.text.includes("outlook.live.com"));
  // Ampersands in an href must be entity-escaped or the link truncates in
  // some mail clients.
  check("hrefs are entity-escaped in the HTML", !/href="[^"]*[^m;]&[a-z]+=/.test(rendered.html) || rendered.html.includes("&amp;"));
  check("the manage-booking link still renders", rendered.html.includes("https://crm.divinex.io/e/tok"));
  check("the join CTA still renders", rendered.html.includes("https://meet.example/x"));
}

console.log(`\n${failures === 0 ? "ADD TO CALENDAR: ALL CHECKS PASSED" : `ADD TO CALENDAR: ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
