/**
 * ZENO: FORMS + BOOKING (V1 requirement 4/13/14).
 *
 * These were the only hard gaps in Zeno's capability surface for the V1
 * journeys — Flow could execute both, Zeno just couldn't reach them.
 *
 * What matters here is not that a doc gets written. It's that Zeno cannot
 * produce something a business would be embarrassed to put in front of a
 * customer: a form with no way to contact anyone, a twenty-field
 * questionnaire, a dropdown with one option, or a booking page in the wrong
 * timezone. Those are the failures that look fine in a demo and cost real
 * leads afterwards, so each one is a refusal the model is told how to repair.
 *
 * Runs against real Firestore with disposable artifacts, and cleans up.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const SA = process.env.EDIT_SA ?? "gXQ6oH73xtvv7LsV1sQT";
const OTHER = "dx-loop-test";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const form = getCapability("create_form")!;
const booking = getCapability("create_booking_page")!;
check("create_form is registered", !!form);
check("create_booking_page is registered", !!booking);
check("both require admin — a collaborator cannot mint public surfaces",
  form.requiredRole === "subAccountAdmin" && booking.requiredRole === "subAccountAdmin");
check("both are confirm-gated writes, not silent actions", !form.readonly && !booking.readonly);

// ------------------------------------------------------------------ forms
const goodForm = {
  name: "Roof quote request",
  fields: [
    { label: "Your name", type: "text", required: true, maps_to: "name" },
    { label: "Email", type: "email", required: true, maps_to: "email" },
    { label: "What kind of roof?", type: "select", required: false, maps_to: "none", options: ["Tile", "Metal", "Flat"] },
  ],
  thank_you_message: "Thanks — we'll come back with a quote within one business day.",
  tags: ["Roof Quote"],
};
const v = form.validate(goodForm);
check("a sensible form validates", v.ok, v.ok ? "" : v.error);

// Idempotency: validate(validate(x)) must not drift. This is the class of bug
// that silently dropped 16 fields once already.
if (v.ok) {
  const again = form.validate(v.args);
  check("validate is idempotent (re-validating its own output is stable)",
    again.ok && JSON.stringify(again.args) === JSON.stringify(v.args));
}

const noContact = form.validate({
  name: "Survey", fields: [{ label: "How did you hear about us?", type: "text", required: true, maps_to: "none" }],
});
check("refuses a form with no way to contact the person", !noContact.ok, noContact.ok ? "" : noContact.error);
check("...and tells the model how to fix it, rather than asking the user",
  !noContact.ok && /maps_to 'email'|maps_to 'phone'/.test(noContact.error) && !/ask the user/i.test(noContact.error));

const tooMany = form.validate({
  name: "Long", fields: Array.from({ length: 9 }, (_, i) => ({ label: `Q${i}`, type: "text", required: true, maps_to: i === 0 ? "email" : "none" })),
});
check("refuses a questionnaire that would cost conversions", !tooMany.ok);

const badSelect = form.validate({
  name: "Bad", fields: [
    { label: "Email", type: "email", required: true, maps_to: "email" },
    { label: "Pick one", type: "select", required: true, maps_to: "none", options: ["Only one"] },
  ],
});
check("refuses a dropdown with nothing to choose between", !badSelect.ok);

check("summary is in the customer's language, not field ids",
  v.ok && /Roof quote request/.test(form.summarize(v.args)) && !/mapsTo|formId|subAccountId/.test(form.summarize(v.args)),
  v.ok ? form.summarize(v.args) : "");

// Execute for real.
let formId = "";
if (v.ok) {
  const res = await form.execute({ uid: OWNER, subAccountId: SA } as never, v.args);
  formId = res.ref!.id;
  const doc = (await db.doc(`forms/${formId}`).get()).data() as Record<string, unknown>;
  check("the form is real and in the right workspace", doc?.subAccountId === SA);
  check("it is live immediately — a form contacts nobody by itself", doc?.enabled === true);
  const fields = doc.fields as { mapsTo: string | null; label: string }[];
  check("field mapping reaches the contact record", fields.some((f) => f.mapsTo === "email"));
  const settings = doc.settings as { autoTags: string[]; thankYouMessage: string };
  check("the batch tag is stored bare, so follow-up can target it exactly",
    settings.autoTags.includes("roof-quote"), settings.autoTags.join(","));
  check("the thank-you is the copy Zeno wrote, not a default",
    settings.thankYouMessage.startsWith("Thanks"), settings.thankYouMessage);
  // House rule, enforced in code rather than by prompt: no em dashes reach a
  // customer-facing surface.
  check("customer-facing copy carries no em dash", !/—/.test(settings.thankYouMessage), settings.thankYouMessage);
  check("the result card tells the customer what to do next, in their words",
    /creates a contact/i.test(res.resultText) && !/formId|subAccountId/.test(res.resultText),
    res.resultText.slice(0, 90));
}

// ---------------------------------------------------------------- booking
const goodBooking = {
  name: "Free roof inspection",
  description: "We come out, look at the roof, and give you a written quote.",
  duration_minutes: 60,
  timezone: "Australia/Sydney",
};
const b = booking.validate(goodBooking);
check("a sensible booking page validates", b.ok, b.ok ? "" : b.error);
if (b.ok) {
  // Confirming a proposal re-validates the stored args, so validate MUST be
  // able to read back its own output — otherwise custom hours vanish between
  // proposing and confirming.
  const again = booking.validate(b.args);
  check("booking validate is idempotent", again.ok, again.ok ? "" : again.error);
  const custom = booking.validate({ ...goodBooking, working_hours: [{ day: "saturday", start_hour: 8, end_hour: 12 }] });
  const customAgain = custom.ok ? booking.validate(custom.args) : null;
  check("custom hours survive the proposal round-trip",
    !!customAgain?.ok && JSON.stringify((customAgain.args as { workingHours: unknown }).workingHours)
      === JSON.stringify((custom.ok ? custom.args : {} as { workingHours: unknown }).workingHours),
    JSON.stringify(customAgain?.ok ? (customAgain.args as { workingHours: unknown }).workingHours : customAgain));
}
check("refuses an invented timezone — the wrong hour is worse than no page",
  !booking.validate({ ...goodBooking, timezone: "Australia/Sidney" }).ok);
check("refuses an absurd duration", !booking.validate({ ...goodBooking, duration_minutes: 900 }).ok);
check("refuses hours that end before they start",
  !booking.validate({ ...goodBooking, working_hours: [{ day: "monday", start_hour: 17, end_hour: 9 }] }).ok);
check("summary says it will not be live yet",
  b.ok && /DRAFT|draft/.test(booking.summarize(b.args)) && /publish/i.test(booking.summarize(b.args)),
  b.ok ? booking.summarize(b.args) : "");
check("no em dash reaches the confirmation the customer reads",
  v.ok && b.ok && !/—/.test(form.summarize(v.args)) && !/—/.test(booking.summarize(b.args)),
  b.ok ? booking.summarize(b.args) : "");

let slug = "";
if (b.ok) {
  const res = await booking.execute({ uid: OWNER, subAccountId: SA } as never, b.args);
  slug = res.ref!.id;
  const doc = (await db.doc(`subAccounts/${SA}/bookingPages/${slug}`).get()).data() as Record<string, unknown>;
  check("the booking page is real and in the right workspace", doc?.subAccountId === SA);
  check("it is a DRAFT — nobody can book untrue availability", doc?.status === "draft");
  check("the slug is a clean URL", slug === "free-roof-inspection", slug);
  check("hours default to a working week rather than nothing",
    Array.isArray(doc?.workingHours) && (doc.workingHours as unknown[]).length === 5);
  check("the timezone is the one Zeno chose", doc?.timezone === "Australia/Sydney");

  // The same slug twice must not silently overwrite someone's live page.
  let conflicted = false;
  try { await booking.execute({ uid: OWNER, subAccountId: SA } as never, b.args); }
  catch (e) { conflicted = /already exists/i.test((e as Error).message); }
  check("a duplicate never overwrites an existing page", conflicted);
}

// ------------------------------------------------------------- isolation
const foreignForm = await db.doc(`forms/${formId}`).get();
check("the form carries exactly one workspace",
  (foreignForm.data() as { subAccountId?: string })?.subAccountId === SA &&
  (foreignForm.data() as { subAccountId?: string })?.subAccountId !== OTHER);

// --------------------------------------------------------------- cleanup
if (formId) await db.doc(`forms/${formId}`).delete();
if (slug) await db.doc(`subAccounts/${SA}/bookingPages/${slug}`).delete();

console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
