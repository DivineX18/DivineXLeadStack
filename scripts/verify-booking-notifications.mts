/**
 * A booking that nobody hears about is the defect this covers.
 *
 * Reported from production: a real customer booked, the operator got no
 * notification, the attendee may have got nothing, and the attendee could
 * not reschedule or cancel. Three separate causes, all provable here.
 */
import { buildEventPublicUrl } from "../src/lib/booking/event-token";
import { selectBookingNotifyRecipients, icsSequenceNow } from "../src/lib/booking/notify-operator";
import { generateIcs } from "../src/lib/booking/ics";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? `, ${detail}` : ""}`);
}

console.log("══ the manage-booking link ══");
{
  const before = process.env.NEXT_PUBLIC_APP_URL;

  // The reported symptom: no configured URL meant an EMPTY link, and the
  // confirmation email then rendered no reschedule or cancel affordance.
  delete process.env.NEXT_PUBLIC_APP_URL;
  check("without any origin it still returns empty", buildEventPublicUrl("tok") === "");
  check(
    "but a request origin is enough on its own",
    buildEventPublicUrl("tok", "https://crm.divinex.io") === "https://crm.divinex.io/e/tok",
  );

  // This deployment answers on more than one host. The attendee must land on
  // the brand they booked with, not whichever host the env happens to name.
  process.env.NEXT_PUBLIC_APP_URL = "https://app.divinex.io";
  check(
    "the request origin beats the configured one",
    buildEventPublicUrl("tok", "https://crm.divinex.io") === "https://crm.divinex.io/e/tok",
  );
  check(
    "and the configured one is still the fallback with no request",
    buildEventPublicUrl("tok") === "https://app.divinex.io/e/tok",
  );
  check("a trailing slash does not double up", buildEventPublicUrl("tok", "https://x.io/") === "https://x.io/e/tok");

  if (before === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = before;
}

console.log("\n══ who gets told ══");
{
  // The REAL selection function, not a restatement of it.
  type M = Parameters<typeof selectBookingNotifyRecipients>[0][number];
  const m = (uid: string, email: string, status: string, role: string) =>
    ({ uid, email, status, role }) as unknown as M;

  const team = [
    m("a", "admin@x.io", "active", "admin"),
    m("b", "host@x.io", "active", "collaborator"),
    m("c", "gone@x.io", "removed", "admin"),
  ];
  const pick = selectBookingNotifyRecipients;
  check("a team booking notifies its assigned host", JSON.stringify(pick(team, "b")) === '["host@x.io"]', JSON.stringify(pick(team, "b")));
  check("an unassigned booking notifies the admins", JSON.stringify(pick(team, null)) === '["admin@x.io"]', JSON.stringify(pick(team, null)));
  check("a removed member is never notified", !pick(team, null).includes("gone@x.io"));
  check("an assigned host who was removed falls back to admins", JSON.stringify(pick(team, "c")) === '["admin@x.io"]', JSON.stringify(pick(team, "c")));
  check(
    "a workspace with no admin still notifies someone",
    JSON.stringify(pick([m("b", "solo@x.io", "active", "collaborator")], null)) === '["solo@x.io"]',
  );
  check("nobody active means nobody, not a crash", pick([m("c", "g@x.io", "removed", "admin")], null).length === 0);
  check("a member with no usable email is skipped", pick([m("a", "notanemail", "active", "admin"), m("b", "ok@x.io", "active", "admin")], null).join() === "ok@x.io");
  check("duplicate addresses are sent once", pick([m("a", "same@x.io", "active", "admin"), m("b", "same@x.io", "active", "admin")], null).length === 1);
  check("the fan-out is capped", pick(Array.from({ length: 30 }, (_, i) => m(`u${i}`, `u${i}@x.io`, "active", "admin")), null).length === 10);
}

console.log("\n══ the operator's calendar actually moves ══");
{
  // Reported: the attendee got the updated time, the operator got nothing,
  // so the new time never reached the person who has to attend.
  const base = {
    uid: "evt_1",
    domain: "crm.divinex.io",
    startAt: new Date("2026-10-01T14:00:00Z"),
    endAt: new Date("2026-10-01T14:30:00Z"),
    summary: "30-minute consultation",
    attendeeEmail: "a@x.io",
  };

  const invite = generateIcs({ ...base, method: "REQUEST", sequence: 0 });
  const moved = generateIcs({
    ...base,
    startAt: new Date("2026-10-02T09:00:00Z"),
    endAt: new Date("2026-10-02T09:30:00Z"),
    method: "REQUEST",
    sequence: icsSequenceNow(),
  });
  const killed = generateIcs({ ...base, method: "CANCEL", status: "CANCELLED", sequence: icsSequenceNow() });

  // Same UID is what makes a calendar MOVE the entry instead of adding a
  // second one next to it.
  const uidOf = (ics: string) => /UID:(.+)/.exec(ics)?.[1]?.trim();
  check("the update carries the original uid", uidOf(invite) === uidOf(moved), String(uidOf(moved)));
  check("the cancellation carries it too", uidOf(invite) === uidOf(killed));

  const seqOf = (ics: string) => Number(/SEQUENCE:(\d+)/.exec(ics)?.[1]);
  check("the update is a newer revision than the invite", seqOf(moved) > seqOf(invite), `${seqOf(invite)} -> ${seqOf(moved)}`);
  check("the cancellation is newer than the invite", seqOf(killed) > seqOf(invite));
  check("the update carries the NEW time", /DTSTART[^\n]*20261002T0900/.test(moved), "");
  check("METHOD:CANCEL removes rather than re-invites", /METHOD:CANCEL/.test(killed) && /STATUS:CANCELLED/.test(killed));

  // The bug behind a SECOND reschedule silently not updating: a hardcoded
  // sequence is never newer than the one before it.
  const first = icsSequenceNow();
  check("two reschedules never share a sequence they cannot beat", first >= seqOf(invite) && first > 1, String(first));
}

console.log(`\n${failures === 0 ? "BOOKING NOTIFICATIONS: ALL CHECKS PASSED" : `BOOKING NOTIFICATIONS: ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
