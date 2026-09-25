/**
 * VERIFIED BUSINESS INFORMATION — operator-supplied facts about a real place.
 *
 * Everything in this module is a CLAIM ABOUT A REAL BUSINESS: a street a
 * customer can drive to, a number they will dial, hours they will show up
 * during. The Apex build published an invented street address and an invented
 * CTA URL because nothing in the pipeline distinguished a fact from a phrase,
 * and a generator asked to fill a field will always fill it.
 *
 * So the rule this module exists to enforce is narrow and absolute: these
 * values are WRITTEN only by an operator through Settings, and READ by
 * generation. A model may never populate them, and a missing one stays
 * missing rather than becoming a plausible guess.
 *
 * Deliberately NOT in scope, and not to be added later without a source of
 * truth behind it: years in business, licensing, insurance, certifications,
 * awards, ratings, review counts, guarantees. Those are proof claims, and an
 * operator typing one into a form is not verification of it.
 *
 * Pure by design — no Firestore, no server-only imports — so the same
 * normalisation runs in the API route, in website generation, and in tests.
 */

import type {
  BusinessHours,
  BusinessHoursDay,
  BusinessProfile,
  BusinessWeekday,
} from "@/types";

export const BUSINESS_WEEKDAYS: readonly BusinessWeekday[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export const WEEKDAY_LABELS: Record<BusinessWeekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** 24-hour clock, the value an <input type="time"> produces. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;

/**
 * Fictional-by-reservation US numbers (ITU/NANP 555-01xx and the broader
 * NNN-555-NNNN block Hollywood uses). Shared intent with the create_website
 * guard: a number that cannot ring is worse than no number, because a
 * customer dials it.
 */
function isFictionalPhone(raw: string): boolean {
  return /^\+?1?\d{3}555\d{4}$/.test(raw.replace(/[^\d]/g, ""));
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const orNull = (v: string): string | null => (v === "" ? null : v);

export function blankBusinessHours(): BusinessHours {
  return BUSINESS_WEEKDAYS.reduce((acc, day) => {
    acc[day] = { closed: false, open: "", close: "" };
    return acc;
  }, {} as BusinessHours);
}

export function emptyBusinessProfile(): BusinessProfile {
  return {
    businessName: null,
    websiteUrl: null,
    street: null,
    street2: null,
    city: null,
    state: null,
    zip: null,
    country: null,
    // Default OPEN. A workspace that has saved an address has done so in
    // order to publish it; a service-area or remote business simply never
    // saves one, and hiding an address nobody entered changes nothing.
    addressPublic: true,
    hours: null,
  };
}

function normalizeDay(raw: unknown): BusinessHoursDay {
  const d = (raw ?? {}) as Record<string, unknown>;
  if (d.closed === true) return { closed: true, open: "", close: "" };
  const open = str(d.open);
  const close = str(d.close);
  // A half-filled row states nothing usable, so it states nothing.
  if (!TIME_RE.test(open) || !TIME_RE.test(close)) {
    return { closed: false, open: "", close: "" };
  }
  return { closed: false, open, close };
}

function normalizeHours(raw: unknown): BusinessHours | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const hours = BUSINESS_WEEKDAYS.reduce((acc, day) => {
    acc[day] = normalizeDay(src[day]);
    return acc;
  }, {} as BusinessHours);
  const stated = BUSINESS_WEEKDAYS.some(
    (d) => hours[d].closed || hours[d].open !== "",
  );
  return stated ? hours : null;
}

export type NormalizeResult =
  | { ok: true; value: BusinessProfile | null }
  | { ok: false; error: string };

/**
 * Validate and normalise an inbound business profile.
 *
 * A profile that states nothing normalises to null, so a sparse workspace
 * stays sparse instead of accumulating a record of empty strings that later
 * reads as "the operator said the address is blank".
 */
export function normalizeBusinessProfile(raw: unknown): NormalizeResult {
  // A workspace created before this field existed reads as undefined. That is
  // "nothing stated", the same as an explicit null — not a malformed body. The
  // save route has already distinguished "absent from the request" from "sent
  // as null" before calling, so nothing is lost by accepting both here.
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "businessProfile must be an object or null." };
  }
  const b = raw as Record<string, unknown>;

  const websiteUrl = str(b.websiteUrl);
  if (websiteUrl && !URL_RE.test(websiteUrl)) {
    return {
      ok: false,
      error: "Website must be a full URL starting with http:// or https://.",
    };
  }

  const value: BusinessProfile = {
    businessName: orNull(str(b.businessName)),
    websiteUrl: orNull(websiteUrl),
    street: orNull(str(b.street)),
    street2: orNull(str(b.street2)),
    city: orNull(str(b.city)),
    state: orNull(str(b.state)),
    zip: orNull(str(b.zip)),
    country: orNull(str(b.country)),
    addressPublic: b.addressPublic !== false,
    hours: normalizeHours(b.hours),
  };

  const statesSomething =
    value.businessName !== null ||
    value.websiteUrl !== null ||
    value.street !== null ||
    value.street2 !== null ||
    value.city !== null ||
    value.state !== null ||
    value.zip !== null ||
    value.country !== null ||
    value.hours !== null;

  return { ok: true, value: statesSomething ? value : null };
}

/**
 * The address as it may appear on a public site.
 *
 * "Show address publicly" is not cosmetic. A sole trader running a trade out
 * of their home has a legitimate address on file for invoicing and a real
 * safety interest in it never reaching a marketing page, so the flag is
 * enforced HERE, at the read that generation uses, rather than left to each
 * caller to remember.
 */
export function publicBusinessAddress(
  profile: BusinessProfile | null | undefined,
): { street: string; city: string; state: string; zip: string; country: string } {
  const blank = { street: "", city: "", state: "", zip: "", country: "" };
  if (!profile || profile.addressPublic === false) return blank;
  const line = [profile.street, profile.street2]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return {
    street: line,
    city: profile.city ?? "",
    state: profile.state ?? "",
    zip: profile.zip ?? "",
    country: profile.country ?? "",
  };
}

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function daySpec(day: BusinessHoursDay): string {
  if (day.closed) return "Closed";
  if (!day.open || !day.close) return "";
  return `${to12h(day.open)} - ${to12h(day.close)}`;
}

/**
 * Render structured hours as the single string downstream templates take.
 *
 * Consecutive days that share a spec collapse ("Mon-Fri 9:00 AM - 5:00 PM"),
 * and days the operator never filled in are omitted rather than guessed at.
 * An all-empty week returns "" — which is what reaches a generated site, so
 * that a 24/7 emergency trade is never given invented office hours a customer
 * acts on at 2am.
 */
export function formatBusinessHours(
  hours: BusinessHours | null | undefined,
): string {
  if (!hours) return "";
  const groups: { start: BusinessWeekday; end: BusinessWeekday; spec: string }[] = [];
  for (const day of BUSINESS_WEEKDAYS) {
    const spec = daySpec(hours[day]);
    if (!spec) continue;
    const last = groups[groups.length - 1];
    const contiguous =
      last &&
      last.spec === spec &&
      BUSINESS_WEEKDAYS.indexOf(day) === BUSINESS_WEEKDAYS.indexOf(last.end) + 1;
    if (contiguous) last.end = day;
    else groups.push({ start: day, end: day, spec });
  }
  return groups
    .map((g) => {
      const label =
        g.start === g.end
          ? WEEKDAY_LABELS[g.start]
          : `${WEEKDAY_LABELS[g.start]}-${WEEKDAY_LABELS[g.end]}`;
      return `${label} ${g.spec}`;
    })
    .join(", ");
}

export { isFictionalPhone };
