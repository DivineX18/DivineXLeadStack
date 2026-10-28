/**
 * Bitrupt QA BUG-030 — the public lead-capture form's phone field had no
 * validation at all: "abc", "###", and "12" all submitted straight into
 * the CRM as the contact's phone number.
 *
 * Deliberately NOT full E.164 validation — see isPlausiblePhone's own doc
 * comment for why this codebase's existing strict validator
 * (lib/comms/phone-identity.ts::toE164, which requires a leading + and
 * refuses to guess a country) is the wrong tool for a public form a
 * visitor fills in without a country code. This is a lenient,
 * country-agnostic digit-count sanity check instead.
 *
 * Direct-execution, same class as every other verify-*.mts here.
 *
 * Run: npx tsx scripts/verify-phone-field-validation.mts
 */
import { isPlausiblePhone, validateFormValues } from "../src/lib/forms/submit-client";
import type { FormField } from "../src/types/forms";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}

// ── 1. The exact reported garbage inputs are all rejected ─────────────────
check('1a. letters ("abc") rejected', !isPlausiblePhone("abc"));
check('1b. symbols ("###") rejected', !isPlausiblePhone("###"));
check('1c. a too-short fragment ("12") rejected', !isPlausiblePhone("12"));
check('1d. empty string rejected', !isPlausiblePhone(""));
check('1e. letters mixed with digits rejected', !isPlausiblePhone("555abc1234"));

// ── 2. Real phone numbers, in typical local (no country code) formatting
// from several countries, are all accepted -- the whole point of NOT
// requiring E.164 ─────────────────────────────────────────────────────────
check("2a. a plain US-format number (no country code)", isPlausiblePhone("713-555-1234"));
check("2b. a parenthesized US-format number", isPlausiblePhone("(713) 555-1234"));
check("2c. a dotted format", isPlausiblePhone("713.555.1234"));
check("2d. a number WITH a leading + and country code also still works", isPlausiblePhone("+17135551234"));
check("2e. a UK-style local number", isPlausiblePhone("020 7946 0958"));
check("2f. a bare digit run with no formatting", isPlausiblePhone("7135551234"));

// ── 3. Boundary cases around the 7-15 digit window ─────────────────────────
check("3a. exactly 7 digits (shortest real-world numbers) accepted", isPlausiblePhone("1234567"));
check("3b. 6 digits rejected (below the floor)", !isPlausiblePhone("123456"));
check("3c. exactly 15 digits (E.164 ceiling) accepted", isPlausiblePhone("123456789012345"));
check("3d. 16 digits rejected (above the ceiling)", !isPlausiblePhone("1234567890123456"));

// ── 4. Wired into the real form validator, scoped to phone-type fields only ─
{
  const fields: FormField[] = [
    { id: "phone1", type: "phone", label: "Phone", required: false } as FormField,
    { id: "email1", type: "email", label: "Email", required: false } as FormField,
  ];
  const badPhone = validateFormValues(fields, { phone1: "abc", email1: "a@b.com" });
  check("4a. a garbage phone value produces a field error", !!badPhone.phone1);
  check("4b. a valid email alongside it is untouched", !badPhone.email1);

  const goodPhone = validateFormValues(fields, { phone1: "713-555-1234", email1: "a@b.com" });
  check("4c. a real phone value produces no error", !goodPhone.phone1);

  const emptyOptional = validateFormValues(fields, { phone1: "", email1: "" });
  check("4d. an empty, non-required phone field is not flagged (optional fields stay optional)", !emptyOptional.phone1);
}

console.log(
  failures === 0
    ? `\nverify-phone-field-validation: all checks passed`
    : `\nverify-phone-field-validation: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
