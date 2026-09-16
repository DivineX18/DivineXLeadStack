/**
 * A PRICE OF ZERO IS A FACT TOO.
 *
 * Certification failure, Booking run 3, on the fold and again in the closing
 * band:
 *
 *   "Free first assessment"
 *   "A free first assessment. Tell us your worries in advance..."
 *
 * The brief says the first visit is assessment only with no treatment on the
 * day. It never says what the visit costs. LOW COMMITMENT became ZERO PRICE.
 *
 * Adversarial by construction: the unsupported cases are phrased as adjectives,
 * as predicates, as idiom and as currency, because a phrase blacklist would
 * pass this suite and fail the next generation. The supported cases are the
 * free offers that were on CERTIFIED pages, taken from the real briefs.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-zero-price-integrity.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] ??= v;
}

const {
  buildCopyGrounding,
  stripUngroundedClaims,
  unsupportedZeroPriceClaims,
  extractZeroPriceMentions,
  operatorFigureStatements,
  isUnsupportedTrustClaim,
} = await import("../src/lib/funnels/claim-integrity.ts");
const { FIXTURES } = await import("./fixtures/landing-page-fixtures.mts");

/**
 * The generated payload these checks read back out of create_funnel.validate.
 *
 * Only the fields this suite actually inspects, typed for real rather than
 * reached through `any`: a wrong field name is then a compile error here
 * instead of an `undefined` that quietly turns a check green.
 */
interface GeneratedFunnelArgs {
  headline: string;
  bullets: string[];
  heroTrustBadges: string[];
  trustBadges: string[];
  ctaBannerSubtext: string;
  confirmationEmailBody: string;
  faqItems: { question: string; answer: string }[];
  stageContent: { sectionType: string; text: string; secondaryText: string }[];
  processSteps: { title?: string; description?: string }[];
  operatorStatedFigures?: string[];
}
const asGenerated = (args: unknown) => args as GeneratedFunnelArgs;

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const askOf = (id: string) => FIXTURES.find((f) => f.id === id)!.ask;
const groundingFor = (id: string, priceCents?: number) =>
  buildCopyGrounding({ operatorStatements: operatorFigureStatements([askOf(id)]), priceCents });

const SUMMIT = groundingFor("summit-roofing");
const BOOKING = groundingFor("booking");
const LEAD_MAGNET = groundingFor("lead-magnet");
const CONSULTANT = groundingFor("consultant");
const PAID = groundingFor("paid-offer", 4900);

const refused = (g: ReturnType<typeof buildCopyGrounding>, s: string) => unsupportedZeroPriceClaims(s, g).length > 0;

// ── 1. The certified failure, and the family it belongs to ─────────────────
console.log("\n══ the booking brief never priced anything ══");
check("the brief grounds no zero-price fact", BOOKING.zeroPrice.length === 0);
const BOOKING_REFUSED = [
  // THE EXACT CERTIFICATION STRINGS.
  "Free first assessment",
  "A free first assessment. Tell us your worries in advance, and we will take it from there at your pace.",
  // SEMANTIC EQUIVALENTS — the same claim, worded differently.
  "Book your free consultation",
  "Your first visit is free",
  "Your inspection is on us",
  "No-cost evaluation",
  "No cost evaluation",
  "Complimentary strategy session",
  "There is no charge for the first visit",
  "The first appointment is free of charge",
  "A zero cost first visit",
  "$0 for your first visit",
  "First visit: $0",
  "Come in for free",
  "Nothing to pay on the first visit",
  "You pay nothing to be seen",
  "Your first assessment, at no cost",
  "Gratis first appointment",
  "Without charge on your first visit",
];
for (const s of BOOKING_REFUSED) check(`refused: "${s}"`, refused(BOOKING, s));

{
  // END TO END on the certified strings: the claim goes, the rest stands.
  const band = stripUngroundedClaims(
    "A free first assessment. Tell us your worries in advance, and we will take it from there at your pace.",
    BOOKING,
  );
  check("the price claim is removed from the closing band", !/free/i.test(band.text), band.text);
  check("... and the rest of the band survives", band.text.startsWith("Tell us your worries"), band.text);
  const badge = stripUngroundedClaims("Free first assessment", BOOKING);
  check("the badge is removed whole", badge.text === "", JSON.stringify(badge.text));
}

// ── 2. What the booking brief DID say is untouched ─────────────────────────
console.log("\n══ absence of pressure is not absence of price ══");
for (const s of [
  "No treatment on the first visit",
  "Nothing gets done to you on the day",
  "No obligation to book treatment",
  "No commitment, no pressure",
  "Risk-free first appointment",
  "Cancel anytime",
  "No credit card required",
  "No hidden fees",
  "No setup fee",
  "No judgement, ever",
  "No lecture about how long it has been",
  "Sedation available for any treatment",
  "Evening appointments twice a week",
]) {
  check(`kept: "${s}"`, !refused(BOOKING, s));
}

console.log("\n══ 'free' is not always a price word ══");
for (const s of [
  "A stress-free first visit",
  "Hands-free scheduling",
  "Gluten-free options in the waiting room",
  "Worry-free aftercare",
  "Free from the lecture you are expecting",
  "We free you from the dread of the chair",
  "It frees up your evenings",
  "Feel free to tell us what scares you",
  "Toll-free number",
  "A visit free of judgement",
]) {
  check(`kept: "${s}"`, !refused(BOOKING, s));
}

// ── 3. Supplied free offers survive, on the object they were supplied for ──
console.log("\n══ what the operator said was free stays free ══");
const SUPPORTED: [string, ReturnType<typeof buildCopyGrounding>, string][] = [
  ["summit", SUMMIT, "Free 25-Point Roof Inspection for Houston Homeowners"],
  ["summit", SUMMIT, "Book my free inspection"],
  ["summit", SUMMIT, "Free, no obligation"],
  ["summit", SUMMIT, "Is the inspection really free?"],
  ["summit", SUMMIT, "The inspection is free whether or not you ever hire us."],
  ["summit", SUMMIT, "Free 25-point inspection, photos of anything we find, and a written recommendation."],
  ["lead magnet", LEAD_MAGNET, "Free 18-page guide for parents of 1 to 3 year olds"],
  ["lead magnet", LEAD_MAGNET, "Send me the free guide"],
  ["lead magnet", LEAD_MAGNET, "The Free Guide That Explains Why Every Sleep Method Failed Your Toddler"],
  ["lead magnet", LEAD_MAGNET, "Free, nothing to buy"],
  ["lead magnet", LEAD_MAGNET, "Download the free guide tonight"],
];
for (const [who, g, s] of SUPPORTED) check(`kept (${who}): "${s}"`, !refused(g, s));

// ── 4. Free on one object does not authorise free on another ───────────────
console.log("\n══ grounding keeps the object it was given ══");
check("a free guide does not make the consultation free", refused(LEAD_MAGNET, "Book your free consultation"));
check("a free guide does not make a call free", refused(LEAD_MAGNET, "Your free strategy call"));
check("a free inspection does not make the repair free", refused(SUMMIT, "Your first repair is free"));
check("a free inspection does not make a roof replacement free", refused(SUMMIT, "A complimentary roof replacement quote visit"));
check("... while the inspection itself stays free", !refused(SUMMIT, "The 25-point inspection is free"));
{
  // The example from the brief, verbatim.
  const guideOnly = buildCopyGrounding({ operatorStatements: ["We give away a free guide."] });
  check("operator said 'free guide' -> 'free guide' is kept", !refused(guideOnly, "Download the free guide"));
  check("operator said 'free guide' -> 'free consultation' is refused", refused(guideOnly, "Book a free consultation"));
}

// ── 5. The model cannot ground its own price ───────────────────────────────
console.log("\n══ the model is not a source ══");
{
  // A brief that never mentions price, with the model's own copy offered as
  // if it were operator input, still grounds nothing: grounding is built only
  // from operator turns (attached by the chat route) and typed channels.
  const consultantFree = refused(CONSULTANT, "A free scoping call before the review");
  check("an application brief does not make a call free", consultantFree);
  check("a priced offer is not free", refused(PAID, "A free teardown of your pricing page"));
  const typedZero = buildCopyGrounding({ operatorStatements: [], priceCents: 0 });
  check("a typed price of zero does ground it", !refused(typedZero, "Free for you today"));
  check("a typed price of $49 does not", refused(PAID, "Yours for $0 today"));
}

// ── 6. Object reading works from either side of the claim ──────────────────
console.log("\n══ the object is read on both sides ══");
{
  // Offer nouns are canonicalised (assessment/inspection/evaluation are one
  // offer under different names), so the object reads back as the group name.
  const m = extractZeroPriceMentions("Free first assessment");
  check("adjective form names the object", m.length === 1 && m[0].object.includes("inspection"), JSON.stringify(m));
  const p = extractZeroPriceMentions("The first assessment is free");
  check("predicate form names it too", p.length === 1 && p[0].object.includes("inspection"), JSON.stringify(p));
  const guide = extractZeroPriceMentions("Free PDF");
  check("a synonym of the same offer canonicalises", guide[0].object.includes("guide"), JSON.stringify(guide));
  const purpose = extractZeroPriceMentions("Nothing to buy to use it");
  check("a purpose clause is not an object", purpose.length === 1 && purpose[0].object.length === 0, JSON.stringify(purpose));
  const bare = extractZeroPriceMentions("Free, no obligation");
  check("a comma ends the object", bare.length === 1 && bare[0].object.length === 0, JSON.stringify(bare));
}

// ── 7. Enforcement reaches every model-authored field ──────────────────────
console.log("\n══ create_funnel validate enforces it everywhere ══");
{
  const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities.ts");
  const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;
  const figures = operatorFigureStatements([askOf("booking")]);
  const r = cap.validate({
    headline: "Dental care for people who have been dreading this call",
    subheadline: "Your first visit is an assessment only. No treatment, no lecture.",
    bullets: "Free first assessment, No treatment on the first visit, Sedation available for any treatment",
    hero_trust_badges: ["Free first assessment", "No judgment, ever"],
    trust_badges: ["Complimentary consultation"],
    cta_banner_subtext: "A free first assessment. Tell us your worries in advance, and we will take it from there at your pace.",
    faq_items: [
      { question: "Will you do any treatment on the first visit?", answer: "No. The first visit is a look and a conversation." },
      { question: "What does the first visit cost?", answer: "The first visit is on us." },
    ],
    process_steps: [
      { title: "Book", bullets: ["Ask for a first visit, it costs you nothing"] },
      { title: "Come in", bullets: ["We look and we talk, nothing is done on the day"] },
    ],
    stage_content: [
      {
        section_type: "problem_solution",
        headline: "You are not avoiding the dentist because you do not care",
        text: "You are avoiding what you expect to happen the moment you sit down. The first visit is free, so there is nothing to lose.",
        secondary_headline: "So we changed how the first visit works",
        secondary_text: "Your first visit here is an assessment only. Nothing gets done that day.",
      },
    ],
    confirmation_email_body: "Thanks for asking about a first visit. It is completely free of charge. We will confirm a time shortly.",
    operator_stated_figures: figures,
  });
  check("validate succeeds", r.ok, r.ok ? "" : r.error);
  if (r.ok) {
    const a = asGenerated(r.args);
    const { operatorStatedFigures: _operatorWords, ...generated } = a;
    const everything = JSON.stringify(generated);
    check("no zero-price claim survives anywhere in the payload", !/\bfree\b|complimentary|\bon us\b|costs you nothing/i.test(everything), everything.slice(0, 200));
    check("the invented bullet is gone, the truthful ones stay", a.bullets.length === 2 && a.bullets.every((b: string) => !/free/i.test(b)), JSON.stringify(a.bullets));
    check("the invented badge is gone, the truthful one stays", a.heroTrustBadges.length === 1 && a.heroTrustBadges[0] === "No judgment, ever", JSON.stringify(a.heroTrustBadges));
    check("the invented mid-page badge is gone", a.trustBadges.length === 0, JSON.stringify(a.trustBadges));
    check("the closing band keeps its instruction, loses the price", a.ctaBannerSubtext.startsWith("Tell us your worries") && !/free/i.test(a.ctaBannerSubtext), a.ctaBannerSubtext);
    check("the priced FAQ is dropped whole, the honest one stays", a.faqItems.length === 1 && /treatment/i.test(a.faqItems[0].question), JSON.stringify(a.faqItems));
    const ps = a.stageContent.find((x) => x.sectionType === "problem_solution")!;
    check("the belief shift loses only the priced sentence", !/free/i.test(ps.text) && ps.text.includes("the moment you sit down"), ps.text);
    check("... and its solution side is untouched", ps.secondaryText.includes("assessment only"), ps.secondaryText);
    check("the follow-up email loses the price claim", !/free/i.test(a.confirmationEmailBody), a.confirmationEmailBody);
    check("a step bullet that was only a price claim is dropped", JSON.stringify(a.processSteps).includes("nothing is done on the day") && !/costs you nothing/i.test(JSON.stringify(a.processSteps)), JSON.stringify(a.processSteps));

    // Confirm re-validates this same payload — it must be stable.
    const again = cap.validate(a);
    check("re-validation at confirm is stable", again.ok && JSON.stringify(asGenerated(again.args).bullets) === JSON.stringify(a.bullets));
  }

  // Summit keeps its supplied free offer through the same path.
  const summit = cap.validate({
    headline: "Free 25-Point Roof Inspection for Houston Homeowners",
    bullets: "Free 25-point roof inspection, Photos of any damage we find",
    hero_trust_badges: ["Free, no obligation"],
    operator_stated_figures: operatorFigureStatements([askOf("summit-roofing")]),
  });
  check("Summit's supplied free offer survives validate", summit.ok && asGenerated(summit.args).headline.startsWith("Free 25-Point"), summit.ok ? asGenerated(summit.args).headline : summit.error);
  check("... including its bullets and badge", summit.ok && asGenerated(summit.args).bullets.length === 2 && asGenerated(summit.args).heroTrustBadges.length === 1);

  // A headline that is ONLY an invented price goes back for rewrite rather
  // than shipping blank, and the instruction never suggests another price.
  const h = cap.validate({
    headline: "Your first dental visit is free",
    bullets: "No treatment on the first visit",
    operator_stated_figures: figures,
  });
  check("an invented-price headline is returned for rewrite", !h.ok && /never said it costs nothing/.test(h.ok ? "" : h.error), h.ok ? "accepted" : h.error.slice(0, 90));
  check("... and the repair instruction forbids substituting a price", !h.ok && /Never substitute a different price/.test(h.ok ? "" : h.error));
}

// ── 8. The neighbouring claim families are untouched ───────────────────────
console.log("\n══ existing families unchanged ══");
check("scarcity still refused", isUnsupportedTrustClaim("Only 3 openings this month"));
check("ownership still refused", isUnsupportedTrustClaim("Family owned and operated"));
check("an honest badge still kept", !isUnsupportedTrustClaim("Written findings in 10 working days"));
check("a supported free badge is not a trust-claim violation", !isUnsupportedTrustClaim("Free, no obligation"));

console.log(failures === 0 ? "\nZERO-PRICE INTEGRITY: ALL CHECKS PASSED\n" : `\nZERO-PRICE INTEGRITY: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
