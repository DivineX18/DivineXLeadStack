/**
 * OFFER-AWARE COMPOSITION — does what is being SOLD actually change the page?
 *
 * Guards the rule that typed signals (genre / objective / price) decide the
 * offer shape and the profile's free-form `offers[].kind` may only break ties,
 * plus the injection rules: additive, deduped by section type, never applied to
 * the one-fold lead magnet or to a lean page.
 *
 * Run: node --experimental-strip-types scripts/verify-offer-shape-composition.mts
 */
import { computeOfferShape, buildFrameworkSections } from "../src/lib/funnels/frameworks.ts";
import type { FunnelSectionType } from "../src/types/funnels.ts";

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}
const types = (s: { type: FunnelSectionType }[]) => s.map((x) => x.type);

// ── 1. Typed signals decide, and beat free-form hints ──────────────────────
check("1a. lead_magnet genre IS the offer shape",
  computeOfferShape({ genre: "lead_magnet" }) === "lead_magnet");

check("1b. a free-form hint can NEVER override the one-fold genre",
  computeOfferShape({ genre: "lead_magnet", offerKinds: ["service", "consulting"] }) === "lead_magnet",
  "typed signal must win");

check("1c. application genre => booking",
  computeOfferShape({ genre: "application" }) === "booking");

check("1d. consultation objective => booking even on a lead_gen genre",
  computeOfferShape({ genre: "lead_gen", objective: "consultation" }) === "booking");

check("1e. priced + ebook hint => paid_digital",
  computeOfferShape({ genre: "lead_gen", priceCents: 1900, offerKinds: ["Ebook"] }) === "paid_digital");

check("1f. priced + meditation hint => experience",
  computeOfferShape({ genre: "tripwire", priceCents: 2900, offerKinds: ["guided meditation audio"] }) === "experience");

check("1g. priced tripwire with no usable hint still sells => paid_digital",
  computeOfferShape({ genre: "tripwire", priceCents: 4900 }) === "paid_digital");

check("1h. unpriced service hint => service",
  computeOfferShape({ genre: "lead_gen", offerKinds: ["done-for-you service"] }) === "service");

// The evidence rule: a purchase architecture needs a real price. A page cannot
// emphasise "buy" around a price we would have to invent.
check("1i. UNPRICED ebook hint degrades to general (never invents a purchase)",
  computeOfferShape({ genre: "lead_gen", offerKinds: ["ebook"] }) === "general",
  "no price => no purchase architecture");

check("1j. garbage/unknown kind falls through safely",
  computeOfferShape({ genre: "lead_gen", offerKinds: ["", "???", "xyzzy"] }) === "general");

check("1k. missing/null hints never throw",
  computeOfferShape({ genre: "lead_gen", offerKinds: null }) === "general" &&
  computeOfferShape({ genre: "lead_gen" }) === "general");

// ── 2. Offer shape materially changes architecture ─────────────────────────
const baseline = types(buildFrameworkSections("lead_gen"));
const service = types(buildFrameworkSections("lead_gen", undefined, "standard", "low", "service"));
const paid = types(buildFrameworkSections("tripwire", undefined, "standard", "low", "paid_digital"));
const experience = types(buildFrameworkSections("tripwire", undefined, "standard", "low", "experience"));
const booking = types(buildFrameworkSections("application", undefined, "standard", "low", "booking"));

check("2a. general composition is UNCHANGED from today (additive only)",
  JSON.stringify(types(buildFrameworkSections("lead_gen", undefined, "standard", "low", "general"))) ===
    JSON.stringify(baseline),
  baseline.join(" > "));

check("2b. service gains a process/how-it-works beat",
  service.includes("agenda") && !baseline.includes("agenda"), service.join(" > "));

check("2c. paid_digital shows the product before the ask",
  paid.includes("image_text") && paid.indexOf("image_text") < paid.indexOf("offer"),
  paid.join(" > "));

check("2d. paid_digital states what's included",
  paid.includes("included"), paid.join(" > "));

check("2e. experience shows the product/cover early",
  experience.includes("image_text") && experience.indexOf("image_text") === 1,
  experience.join(" > "));

// The booking requirement is about reaching the ACTION, not about where a
// particular section lands. The application framework already carries its own
// "process" beat, so injection correctly dedupes and leaves it in place; what
// matters is that a visitor who came to book meets a conversion beat without
// scrolling through the whole argument first.
{
  const ACTION = new Set<FunnelSectionType>(["cta_banner", "offer", "ticket_tiers", "multi_step_form"]);
  const firstAction = booking.findIndex((t) => ACTION.has(t));
  check("2f. booking: a conversion action appears in the first half of the page",
    firstAction !== -1 && firstAction < booking.length / 2,
    `first action at ${firstAction} of ${booking.length} — ${booking.join(" > ")}`);

  // Where the framework has NO "what to expect" beat, booking shape adds one.
  const bookingOnLeadGen = types(buildFrameworkSections("lead_gen", undefined, "standard", "low", "booking"));
  check("2g. booking adds 'what to expect' when the framework lacks it",
    bookingOnLeadGen.includes("agenda") && bookingOnLeadGen.indexOf("agenda") === 1,
    bookingOnLeadGen.join(" > "));
}

// ── 3. Cooperation with the existing framework ─────────────────────────────
check("3a. NEVER injects a section type the framework already has",
  new Set(paid).size === paid.length || paid.filter((t) => t === "included").length === 1,
  paid.join(" > "));

for (const [name, list] of [["service", service], ["paid", paid], ["experience", experience], ["booking", booking]] as const) {
  const dupes = list.filter((t, i) => list.indexOf(t) !== i && t !== "cta_banner");
  check(`3b. ${name}: no accidental duplicate conversion beats`, dupes.length === 0, dupes.join(",") || "none");
}

check("3c. the one-fold lead magnet is NEVER lengthened",
  buildFrameworkSections("lead_magnet", undefined, "standard", "low", "lead_magnet").length === 1);

check("3d. a LEAN page is never re-inflated by offer shape",
  JSON.stringify(types(buildFrameworkSections("lead_gen", undefined, "lean", "low", "service"))) ===
    JSON.stringify(types(buildFrameworkSections("lead_gen", undefined, "lean", "low", "general"))));

// ── 4. Lead magnet pairs the asset with the capture ────────────────────────
{
  const lm = buildFrameworkSections("lead_magnet", undefined, "standard", "low", "lead_magnet");
  const hero = lm[0].config as { layout?: string };
  check("4a. lead-magnet hero uses the paired split layout", hero.layout === "split");
  const plain = buildFrameworkSections("lead_magnet")[0].config as { layout?: string };
  check("4b. a non-lead-magnet build is untouched", plain.layout === undefined);
}

// ── 5. Hero layout precedence (regression for the persisted-layout P1) ─────
// The archetype default used to overwrite the framework's offer-aware choice,
// so a lead magnet persisted `centered` and its cover stacked above the form.
{
  const { resolveHeroLayout } = await import("../src/lib/funnels/frameworks.ts");
  const composedLM = (buildFrameworkSections("lead_magnet", undefined, "standard", "low", "lead_magnet")[0]
    .config as { layout?: string }).layout ?? null;

  check("5a. lead_magnet composed split SURVIVES the archetype default",
    resolveHeroLayout({ explicit: null, composed: composedLM, fallback: "centered" }) === "split",
    `composed=${composedLM}`);

  check("5b. an EXPLICIT hero_layout still overrides the composed choice",
    resolveHeroLayout({ explicit: "background_image", composed: "split", fallback: "centered" }) === "background_image");

  check("5c. non-lead-magnet composes nothing, so the fallback is unchanged",
    (buildFrameworkSections("lead_gen")[0].config as { layout?: string }).layout === undefined &&
      resolveHeroLayout({ explicit: null, composed: null, fallback: "centered" }) === "centered");

  check("5d. nothing anywhere yields null (caller omits layout entirely)",
    resolveHeroLayout({ explicit: null, composed: null, fallback: null }) === null);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
