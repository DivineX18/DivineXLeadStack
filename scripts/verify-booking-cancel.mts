/**
 * Attendee cancellation, against the real implementation.
 *
 * Reported from production: the attendee opens Manage Booking, confirms
 * cancel, and gets "Couldn't cancel." every time. The cause was not in the
 * cancel route at all. Middleware never published
 * /api/events/{token}/cancel, so a logged-out attendee was 307'd to /login,
 * the browser got HTML, res.json() threw, and the UI fell back to its own
 * message with no server error to show because there was no server response.
 *
 * Reschedule was broken identically and only looked healthy because an
 * operator tested it with a session cookie already in the browser.
 */
import { isPublicPath } from "../src/middleware";
import { eventStatus, eventOccupiesSlot, isCancelledEvent } from "../src/types/events";
import { buildEventPublicUrl, hashEventToken, verifyEventToken, issueEventToken } from "../src/lib/booking/event-token";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? `, ${detail}` : ""}`);
}

console.log("══ the attendee can reach the endpoints at all ══");
{
  // The actual bug. A real attendee has no session.
  check("cancel is public", isPublicPath("/api/events/abc.def.ghi/cancel"));
  check("reschedule is public", isPublicPath("/api/events/abc.def.ghi/reschedule"));
  check("the /e page stays public", isPublicPath("/e/abc.def.ghi"));

  // The reason this is a regex and not an "/api/events" prefix. Each of
  // these must STAY behind the session cookie.
  check("the events list/create route is NOT public", !isPublicPath("/api/events"));
  check("a trailing-slash events route is NOT public", !isPublicPath("/api/events/"));
  check("operator mark-paid is NOT public", !isPublicPath("/api/events/by-id/evt_1/mark-paid"));
  check("operator assign is NOT public", !isPublicPath("/api/events/by-id/evt_1/assign"));
  check("operator mark-status is NOT public", !isPublicPath("/api/events/by-id/evt_1/mark-status"));
  // /api/v1 is deliberately public at the middleware layer: it authenticates
  // with a bearer API key inside the route, not a session cookie. Asserted so
  // a future prefix change here cannot quietly move it either way.
  check("the v1 API stays public, as it already was", isPublicPath("/api/v1/events/evt_1"));
  check("a made-up sibling action is NOT public", !isPublicPath("/api/events/tok/delete"));
  check("a nested path under cancel is NOT public", !isPublicPath("/api/events/tok/cancel/all"));
  // A crafted path that DOES match the regex still dies in the route,
  // because "by-id" is not a valid signed token.
  check("'/api/events/by-id/cancel' matches but carries no valid token", isPublicPath("/api/events/by-id/cancel") && verifyEventToken("by-id") === null);

  // Existing public callbacks must not regress.
  check("the reminder callback stays public", isPublicPath("/api/events/reminder/step"));
  check("the payment-expire callback stays public", isPublicPath("/api/events/payment/expire-step"));
}

console.log("\n══ the token is the credential ══");
{
  const minted = issueEventToken("evt_real");
  const parsed = verifyEventToken(minted.token);
  check("a freshly minted token verifies", parsed?.eventId === "evt_real", String(parsed?.eventId));
  check("its stored hash matches what the route recomputes", hashEventToken(minted.token) === minted.hash);

  check("a malformed token is rejected", verifyEventToken("nonsense") === null);
  check("an empty token is rejected", verifyEventToken("") === null);
  check("a tampered signature is rejected", verifyEventToken(minted.token.slice(0, -4) + "0000") === null);

  // Cross-tenant: a token signed for one event can never address another,
  // and the route's hash comparison is the second, independent gate.
  const other = issueEventToken("evt_other");
  check("a token for another event resolves to that other event, not this one", verifyEventToken(other.token)?.eventId === "evt_other");
  check("and its hash does not match this event's stored hash", hashEventToken(other.token) !== minted.hash);
}

console.log("\n══ the cancelled state ══");
{
  check("a cancelled event reads as cancelled", eventStatus({ status: "cancelled" }) === "cancelled");
  check("a legacy event with no status reads as scheduled", eventStatus({}) === "scheduled");

  // Slot restoration: the availability scan only treats occupying statuses
  // as busy, so cancelling frees the time without any extra bookkeeping.
  check("a cancelled event no longer occupies its slot", !eventOccupiesSlot("cancelled"));
  check("a scheduled event still occupies its slot", eventOccupiesSlot("scheduled"));
  check("an unpaid hold still occupies its slot", eventOccupiesSlot("awaiting_payment"));
  check("a completed meeting does not occupy a future slot", !eventOccupiesSlot("completed"));
}

console.log("\n══ the operator's calendar ══");
{
  // Reported after the cancel fix shipped: the cancellation email arrived and
  // the event showed "Cancelled" in the editor, but the calendar still drew
  // it exactly like a live meeting, so it read as "still on the booking page
  // even after refreshing".
  check("a cancelled booking is recognised as cancelled", isCancelledEvent({ status: "cancelled" }));
  check("a scheduled booking is not", !isCancelledEvent({ status: "scheduled" }));
  check("an unpaid hold is not", !isCancelledEvent({ status: "awaiting_payment" }));
  check("a legacy event with no status is not", !isCancelledEvent({}));
  check("a completed meeting is not cancelled", !isCancelledEvent({ status: "completed" }));

  // The month header counts what is still happening. Counting a cancelled
  // booking there is what makes it look live.
  const month = [
    { status: "scheduled" as const },
    { status: "cancelled" as const },
    { status: "awaiting_payment" as const },
    {},
  ];
  const active = month.filter((e) => !isCancelledEvent(e)).length;
  check("the active count excludes cancelled", active === 3, String(active));
  check("the cancelled count is the remainder", month.length - active === 1);
}

console.log("\n══ the manage link survives cancellation ══");
{
  // Reopening the same URL after cancelling must still resolve, so the
  // attendee sees the cancelled state rather than a 404.
  const minted = issueEventToken("evt_real");
  check(
    "the same token still builds the same URL",
    buildEventPublicUrl(minted.token, "https://crm.divinex.io") === `https://crm.divinex.io/e/${minted.token}`,
  );
  check("cancelling does not rotate the token", verifyEventToken(minted.token)?.eventId === "evt_real");
}

console.log(`\n${failures === 0 ? "BOOKING CANCEL: ALL CHECKS PASSED" : `BOOKING CANCEL: ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
