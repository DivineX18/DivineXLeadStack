import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * ONE CANONICAL PHONE IDENTITY FOR SMS.
 *
 * Contacts are stored with whatever the lead typed: "(555) 123-4567",
 * "555.123.4567", "+1 555 123 4567". Twilio always delivers inbound `From` in
 * E.164. The inbound STOP handler matched with an exact string equality, so a
 * contact whose stored phone was not already E.164 could be texted
 * successfully (Twilio tolerates loose formats outbound) but could never opt
 * out: their STOP matched nothing and was logged and discarded. The failure
 * was silent in exactly the direction nobody watches.
 *
 * So SMS gets one identity, E.164, computed by one function, used for sending,
 * for inbound lookup and as the suppression key.
 *
 * NO DEFAULT COUNTRY, DELIBERATELY. An audit of this repo found no country
 * context anywhere that could justify one: sub-accounts carry a timezone and
 * nothing else, and `contact.countryCode` is derived from the submitter's IP,
 * which is the location of a browser rather than the country of a phone line.
 * Guessing "US" would be inventing a fact, and the number it invents is a real
 * phone belonging to someone else. A number that is not unambiguously E.164 is
 * therefore not sendable, which is a refusal the operator can see and fix, not
 * a message delivered to a stranger.
 */

export type PhoneIdentityFailure =
  /** Nothing usable was supplied. */
  | "empty"
  /** Present, but not parseable as a real number. */
  | "unparseable"
  /** Parsed, but no country code, so the line it names is ambiguous. */
  | "ambiguous_country";

export type PhoneIdentity =
  | { ok: true; e164: string }
  | { ok: false; reason: PhoneIdentityFailure };

/**
 * The E.164 identity of a raw phone string, or the reason there isn't one.
 *
 * Accepts only input that already carries its country: a leading `+`, or the
 * `00` international prefix, which is the same statement written differently.
 * Everything else is ambiguous by definition and refused.
 */
export function toE164(raw: string | null | undefined): PhoneIdentity {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  // `00` is the international access prefix; it means the same thing as `+`.
  const candidate = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  if (!candidate.startsWith("+")) return { ok: false, reason: "ambiguous_country" };

  const parsed = parsePhoneNumberFromString(candidate);
  if (!parsed || !parsed.isValid()) return { ok: false, reason: "unparseable" };
  return { ok: true, e164: parsed.number };
}

/** The E.164 identity, or null. For callers that only need the happy path. */
export function phoneIdentity(raw: string | null | undefined): string | null {
  const r = toE164(raw);
  return r.ok ? r.e164 : null;
}

/**
 * The suppression key for an E.164 number: digits only.
 *
 * Firestore document ids may not be empty and are easier to reason about
 * without punctuation, so `+15551234567` keys as `15551234567`. Derived from
 * the E.164 form and nothing else, so two spellings of one line can never
 * produce two keys.
 */
export function suppressionKey(e164: string): string {
  return e164.replace(/\D/g, "");
}

/**
 * Whether two raw phone strings name the same line.
 *
 * Both must resolve to an identity; two unparseable strings are NOT equal
 * however similar they look, because "equal and unknown" is what let a STOP
 * get matched against the wrong contact.
 */
export function isSamePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ia = phoneIdentity(a);
  const ib = phoneIdentity(b);
  return ia !== null && ia === ib;
}
