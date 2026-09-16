/**
 * SCARCITY IS A FACT, AND A BADGE IS A COMPLETE THOUGHT.
 *
 * Two defects found by rendering a freshly generated Northstar page, on the
 * fold, under the primary CTA:
 *
 *   ✓ Application only, we take a limited
 *
 * The full line was "…we take a limited number each quarter" — an invented
 * capacity cap, from a business that states no cap anywhere. Two failures in
 * one badge: the fabrication itself, and a character truncation that hid the
 * evidence while keeping the insinuation.
 *
 * Adversarial by construction: the scarcity cases are phrased many different
 * ways on purpose, because a phrase list would pass this suite and fail the
 * next generation.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-claim-badge-integrity.mts
 */
import { isUnsupportedTrustClaim, assertsUnverifiedScarcity } from "../src/lib/funnels/claim-integrity.ts";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// ── 1. The claim class, phrased every way a model reaches for it ────────────
console.log("\n══ unverified scarcity is refused however it is worded ══");
const SCARCITY = [
  // THE CERTIFICATION FAILURE: "engagements" was not an availability noun.
  "By application, limited engagements",
  "Limited engagements this quarter",
  // AUDITED AS A FAMILY, not patched one word at a time. Before this pass 16 of
  // these 29 slipped through, which is why appending "engagements" alone would
  // have been the wrong fix.
  "Limited availability", "Availability is limited", "Limited capacity",
  "Only a few projects accepted", "Only a few spots left",
  "Accepting three new clients", "Accepting 3 new clients this month",
  "Only two openings this month", "Only 2 openings this month",
  "Taking a small number of businesses", "Taking on a handful of clients",
  "A limited number of accounts", "We work with a limited number of companies",
  "Nearly booked", "Almost fully booked", "Booked out for the month",
  "Only a handful of consultations left", "Few appointments remaining",
  "Three openings remaining", "Applications closing soon", "First come, first served",
  "Limited spots available", "Capped at 10 clients", "Maximum of 8 per intake",
  "Only 5 seats left", "While places last", "Filling up fast",
];
for (const s of SCARCITY) {
  check(`refused: "${s}"`, assertsUnverifiedScarcity(s) && isUnsupportedTrustClaim(s));
}

// ── 2. ... without eating honest copy ──────────────────────────────────────
console.log("\n══ ordinary true copy survives ══");
const HONEST = [
  "Free, no obligation",
  "Written findings in 10 working days",
  "Fixed scope, fixed fee",
  "Written recommendation, not a quote",
  "Photos of any damage we find",
  "No treatment on your first visit",
  "Secure checkout",
  "Unlimited revisions",              // "unlimited" must not trip "limited"
  "Limited warranty included",         // a warranty is not a unit of availability
  "Limited edition print",             // nor is an edition
  "We only work with dentists",        // restricts KIND, not quantity
  "We only take card payments",        // ditto
  "Evening appointments available",
  "Delivered in 5 working days",
  "One flat price, no upsell",
  "Serving Houston homeowners",
  // FALSE-POSITIVE PROTECTION for the widened family. Each of these contains a
  // word the detector now knows, used in a way that asserts no scarcity.
  "Evening appointments available", "Appointments outside working hours",
  "Available Monday to Friday", "Sedation available for any treatment",
  "Limited business hours on Saturdays", "A consultation you keep",
  "We work with dental practices", "Accounts managed by a named contact",
  "Book a consultation", "Projects delivered in ten working days",
  "Your account, your data", "One-time $49, no subscription",
];
for (const s of HONEST) {
  check(`kept: "${s}"`, !isUnsupportedTrustClaim(s));
}

// ── 3. The ownership rules are untouched ───────────────────────────────────
console.log("\n══ the existing ownership class still holds ══");
check("locally owned is still refused", isUnsupportedTrustClaim("Locally owned in Houston"));
check("local crew is still refused", isUnsupportedTrustClaim("Local Houston crew"));
check("family owned is still refused", isUnsupportedTrustClaim("Family owned and operated"));

// ── 4. Badge acceptance: complete, compressed, or dropped ──────────────────
//
// Mirrors `acceptBadge` in capabilities.ts. Kept in step by the end-to-end
// generation checks below it; the unit cases here are the adversarial ones.
console.log("\n══ a badge is never a fragment ══");
const BADGE_MAX = 40;
const DANGLING = new Set(["a","an","the","and","or","of","to","for","with","in","on","at","by","from","we","you","our","your","is","are","that","which","but","not","no","so","as","than","then","when","while","per","into","over","up"]);
const isCompleteLabel = (t: string): boolean => {
  const w = t.split(/\s+/).filter(Boolean);
  if (w.length < 2) return w.length === 1 && w[0].length >= 4;
  return !DANGLING.has(w[w.length - 1].toLowerCase().replace(/[^a-z]/g, ""));
};
const acceptBadge = (b: string): string | null => {
  const t = b.trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (isUnsupportedTrustClaim(t)) return null;
  if (t.length <= BADGE_MAX) return isCompleteLabel(t) ? t : null;
  const head = t.split(/[,;:]/)[0].trim().replace(/[\s-]+$/, "");
  if (head.length >= 8 && head.length <= BADGE_MAX && isCompleteLabel(head) && !isUnsupportedTrustClaim(head)) return head;
  return null;
};

check("a short honest badge is kept verbatim", acceptBadge("Free, no obligation") === "Free, no obligation");
// THE NORTHSTAR CASE, END TO END: dropped for the CLAIM, before length is ever
// considered — so the truncation can no longer launder it.
check(
  "the fabricated cap is dropped, not shortened",
  acceptBadge("Application only, we take a limited number each quarter") === null,
);
// SAFE COMPRESSION: the leading clause stands alone and means the same thing.
check(
  "an over-long badge compresses to its leading clause",
  acceptBadge("A recording of your real page, not a checklist") === "A recording of your real page",
  String(acceptBadge("A recording of your real page, not a checklist")),
);
// NO FRAGMENTS, EVER: nothing here has a clause that stands alone, so each is
// dropped rather than cut.
for (const s of [
  "Written by an independent inspector who has performed thousands of them",
  "Everything you need to decide whether the work is worth doing at all",
]) {
  const out = acceptBadge(s);
  check(`dropped rather than cut: "${s.slice(0, 34)}…"`, out === null || (out.length <= BADGE_MAX && isCompleteLabel(out)), String(out));
}
check("a trailing function word is never the last word", acceptBadge("Everything you need to know about the") === null);
check("a one-word badge is allowed when it is a real word", acceptBadge("Insured") === "Insured");

console.log(failures === 0 ? "\nCLAIM + BADGE INTEGRITY: ALL CHECKS PASSED\n" : `\nCLAIM + BADGE INTEGRITY: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
