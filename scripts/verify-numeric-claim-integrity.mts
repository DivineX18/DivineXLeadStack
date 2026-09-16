/**
 * A NUMBER IS A FACT, AND A FACT NEEDS A SOURCE.
 *
 * Certification failure, Summit run 1, in the before-panel:
 *
 *   "You called a roofer once and got a $18k quote before they were even off
 *    the ladder."
 *
 * No $18k anywhere in the brief, no quote the visitor received, no competitor
 * pricing. The existing rules only knew badges, scarcity and "save $X".
 *
 * Adversarial by construction: the unsupported cases are phrased with and
 * without currency, spelled and in digits, as ratios, multiples, vague
 * magnitudes and durations, because a "$" pattern would pass this suite and
 * fail the next generation. The supported cases are the figures that were on
 * CERTIFIED pages, taken from the real fixture briefs, so the rule is proven
 * not to eat them.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-numeric-claim-integrity.mts
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
  stripUnsupportedNumericClaims,
  unsupportedNumericClaims,
  operatorFigureStatements,
  isUnsupportedTrustClaim,
  assertsUnverifiedScarcity,
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
  subheadline: string;
  bullets: string[];
  heroTrustBadges: string[];
  storyParagraphs: string[];
  faqItems: { question: string; answer: string }[];
  stageContent: { sectionType: string; text: string; secondaryText: string }[];
  operatorStatedFigures?: string[];
}
const asGenerated = (args: unknown) => args as GeneratedFunnelArgs;

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const askOf = (id: string) => FIXTURES.find((f) => f.id === id)!.ask;
const groundingFor = (id: string, extra: { priceCents?: number; typedValues?: number[] } = {}) =>
  buildCopyGrounding({ operatorStatements: operatorFigureStatements([askOf(id)]), ...extra });

const SUMMIT = groundingFor("summit-roofing");
const CONSULTANT = groundingFor("consultant");
const LEAD_MAGNET = groundingFor("lead-magnet");
const BOOKING = groundingFor("booking");
const PAID = groundingFor("paid-offer", { priceCents: 4900 });

const refused = (g: ReturnType<typeof buildCopyGrounding>, s: string) => unsupportedNumericClaims(s, g).length > 0;

// ── 1. The certified failure ───────────────────────────────────────────────
console.log("\n══ the Summit before-panel ══");
{
  const panel =
    "After a storm you spot a few missing shingles. You called a roofer once and got a $18k quote before they were even off the ladder. You never see what they saw, and you're asked to decide on the spot.";
  const r = stripUnsupportedNumericClaims(panel, SUMMIT);
  check("the invented quote sentence is removed", !r.text.includes("18k"), r.text);
  check("... and only that sentence", r.dropped.length === 1, JSON.stringify(r.dropped));
  check("... the surrounding argument survives", r.text.startsWith("After a storm") && r.text.endsWith("on the spot."), r.text);
}

// ── 2. Unsupported figures, however they are written ───────────────────────
console.log("\n══ unsupported figures are refused in every shape ══");
const UNSUPPORTED_SUMMIT = [
  // Currency.
  "You called a roofer once and got a $18k quote.",
  "You know something is wrong, but not whether it's a $400 repair or a real problem.",
  "A replacement usually runs $12,000 to $18,000.",
  "Most crews quote a $300-$800 patch.",
  "That's 18 grand for a roof you may not need.",
  "Eighteen thousand dollars for a roof you may not need.",
  // WITHOUT currency symbols — named in the brief.
  "Most homeowners spend 12,000 on a roof they didn't need.",
  "9 out of 10 roofs we see only need a repair.",
  "Nine out of ten roofs only need a repair.",
  "Repairs usually take 3 weeks.",
  "Repairs usually take three weeks.",
  "You lost 20 leads last month.",
  // Percentages and multiples.
  "30% of storm claims are denied.",
  "Thirty percent of storm claims are denied.",
  "Homeowners who inspect first save 3x as much.",
  // Numerical social proof and history.
  "Trusted by hundreds of Houston homeowners.",
  "Over 1,200 roofs inspected.",
  "Serving Houston since 2009.",
  "Rated 4.9 stars by our customers.",
  // Timelines and response promises.
  "We're on your roof within 48 hours.",
  "Available 24/7 after a storm.",
  "Your report arrives in 2 days.",
  // Invented events involving the visitor.
  "Last year you paid for 2 inspections that told you nothing.",
];
for (const s of UNSUPPORTED_SUMMIT) check(`refused: "${s}"`, refused(SUMMIT, s));

// A UNIT IS PART OF THE FACT. The lead-magnet brief says "1 to 3 year olds";
// that grounds the 3 in "3 year olds", not a 3 counting weeks or parents.
console.log("\n══ grounding a value does not ground every use of it ══");
check("\"3 year olds\" is grounded", !refused(LEAD_MAGNET, "Written for parents of 1 to 3 year olds."));
check("\"3 weeks\" is not", refused(LEAD_MAGNET, "Most toddlers need 3 weeks to settle."));
check("\"3 parents\" is not", refused(LEAD_MAGNET, "3 parents in our group fixed it in a night."));
check("\"30 nights\" is grounded", !refused(LEAD_MAGNET, "The first 30 nights, planned out."));
check("\"30 days\" is not", refused(LEAD_MAGNET, "Results in 30 days."));
check("\"ten working days\" grounds \"10 days\"", !refused(CONSULTANT, "Written findings back in 10 days."));
check("... but not \"10 years\"", refused(CONSULTANT, "Built from 10 years of operations work."));
check("\"twice a week\" does not ground \"two years\"", refused(BOOKING, "Two years of avoidance is common."));
check("a $49 price does not ground a $49 saving elsewhere as $490", refused(PAID, "Worth $490 in consulting time."));

// ── 3. Supported figures survive ───────────────────────────────────────────
console.log("\n══ figures the operator supplied are kept ══");
const SUPPORTED: [string, ReturnType<typeof buildCopyGrounding>, string][] = [
  ["summit", SUMMIT, "Our free 25-point roof inspection ends with photos and a written recommendation."],
  ["summit", SUMMIT, "What is the 25-point inspection?"],
  ["consultant", CONSULTANT, "Written findings in 10 working days."],
  ["consultant", CONSULTANT, "Written findings in ten working days, fixed scope and fee."],
  ["lead magnet", LEAD_MAGNET, "A free 18-page guide for parents of 1 to 3 year olds who haven't slept through in months."],
  ["lead magnet", LEAD_MAGNET, "The 2am wake-up pattern most parents misread completely."],
  ["booking", BOOKING, "Evening appointments twice a week."],
  // Restatements found by auditing surviving generated pages: the operator's
  // words, the page's digits.
  ["booking", BOOKING, "Two evenings a week means you don't have to explain a daytime absence."],
  ["consultant", CONSULTANT, "Where your delivery breaks at 2x volume, in writing."],
  ["paid offer", PAID, "Back in 5 working days for $49."],
  ["paid offer", PAID, "Get my teardown, $49"],
  ["paid offer", PAID, "You'll know the 3 highest-leverage changes to make."],
];
for (const [who, g, s] of SUPPORTED) check(`kept (${who}): "${s}"`, !refused(g, s));

// Operator-stated facts of every class the brief names as legitimate.
{
  const g = buildCopyGrounding({
    operatorStatements: operatorFigureStatements([
      "We've served Houston since 2009 and have inspected over 1,200 roofs. First-time customers get 20% off. Our Google rating is 4.8 from 312 reviews. The plan is $29 a month or $290 a year. Call us on (713) 555-0142.",
    ]),
  });
  for (const s of [
    "Serving Houston since 2009.",
    "Over 1,200 roofs inspected.",
    "20% off your first inspection.",
    "Rated 4.8 from 312 reviews.",
    "$29 a month, or $290 a year.",
    "Call (713) 555-0142 for a same-week inspection.",
  ]) {
    check(`an operator-stated figure is kept: "${s}"`, !refused(g, s));
  }
  check("a DIFFERENT year is still refused", refused(g, "Serving Houston since 2005."));
  check("a rounded-up count is still refused", refused(g, "Over 1,500 roofs inspected."));
  check("a bigger discount is still refused", refused(g, "25% off your first inspection."));
}

// Typed channels carry values, not phrases.
{
  const g = buildCopyGrounding({ operatorStatements: [], priceCents: 9700, typedValues: [4.7, 6287, 2026, 3, 18, 19, 7, 0] });
  check("the typed price is grounding", !refused(g, "One payment of $97."));
  check("a supplied rating is grounding", !refused(g, "4.7 stars from 6287 reviews."));
  check("the event time is grounding", !refused(g, "Live on March 18 at 7pm."));
  check("a price that is not the typed price is refused", refused(g, "Normally $197."));
}

// ── 4. Structure is not a claim ────────────────────────────────────────────
console.log("\n══ structural numbers are not claims ══");
const EMPTY = buildCopyGrounding({ operatorStatements: [] });
for (const s of [
  "Step 1: tell us about the roof. Step 2: we inspect it.",
  "Phase 3 is the written recommendation.",
  "A 1-on-1 walkthrough of your page.",
  "A 1:1 call, not a webinar.",
  "Your 1st visit is a conversation.",
  "Call (713) 555-0142.",
  "The three that matter, in the order to do them.",   // enumerating the page's own points
  "Two things change on your first visit.",
  "One call, one visit, one written answer.",
  "Unlimited revisions.",
  "No numbers here at all.",
]) {
  check(`not a claim: "${s}"`, !refused(EMPTY, s));
}

// ── 5. What the operator said is the only source ───────────────────────────
console.log("\n══ grounding comes from operator text only ══");
{
  const statements = operatorFigureStatements([
    "We do roof inspections in Houston.",
    "It's a free 25-point inspection.",
  ]);
  check("only sentences with a figure are carried", statements.length === 1 && statements[0].includes("25-point"), JSON.stringify(statements));
  check("carrying is bounded", operatorFigureStatements(Array.from({ length: 200 }, (_, i) => `Item ${i + 2} costs $${i + 2}.`)).length <= 60);
}

// ── 6. The existing claim families are untouched ───────────────────────────
console.log("\n══ scarcity and ownership rules unchanged ══");
check("scarcity still refused", assertsUnverifiedScarcity("Only 3 openings this month") && isUnsupportedTrustClaim("Only 3 openings this month"));
check("ownership still refused", isUnsupportedTrustClaim("Family owned and operated"));
check("honest badge still kept", !isUnsupportedTrustClaim("Written findings in 10 working days"));

// ── 7. End to end through create_funnel's own validate ─────────────────────
console.log("\n══ create_funnel validate enforces it on every copy field ══");
{
  const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities.ts");
  const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === "create_funnel")!;
  const figures = operatorFigureStatements([askOf("summit-roofing")]);
  const payload = {
    headline: "Storm damage or not? Get a written answer",
    subheadline: "Our free 25-point roof inspection ends with photos and a written recommendation.",
    bullets: "Free 25-point roof inspection, Saves the average homeowner $4,000, Photos of every issue we find",
    hero_trust_badges: ["Free, no obligation", "Serving Houston since 2009"],
    faq_items: [
      { question: "Is the inspection really free?", answer: "Yes. It ends with a written recommendation, not a quote." },
      { question: "How long does a repair take?", answer: "Most repairs take 3 days." },
    ],
    stage_content: [
      {
        section_type: "problem_solution",
        headline: "You can't tell how bad it is",
        text: "After a storm you spot a few missing shingles. You called a roofer once and got a $18k quote before they were even off the ladder. You never see what they saw.",
        secondary_headline: "We check first, document everything",
        secondary_text: "Summit runs a fixed 25-point inspection and photographs every issue we find.",
      },
    ],
    story_paragraphs: ["9 out of 10 roofs only need a repair.", "The inspection shows you which kind yours is."],
    operator_stated_figures: figures,
  };
  const r = cap.validate(payload);
  check("validate succeeds", r.ok, r.ok ? "" : r.error);
  if (r.ok) {
    const a = asGenerated(r.args);
    const ps = a.stageContent.find((s) => s.sectionType === "problem_solution")!;
    check("the $18k sentence is gone from the belief shift", !ps.text.includes("18k"), ps.text);
    check("... the rest of the problem copy stays", ps.text.includes("missing shingles") && ps.text.includes("never see what they saw"), ps.text);
    check("... the section's solution side is untouched", ps.secondaryText.includes("25-point"), ps.secondaryText);
    check("an invented bullet is removed, the others kept", a.bullets.length === 2 && !a.bullets.some((b) => b.includes("4,000")), JSON.stringify(a.bullets));
    check("the supported bullet survives", a.bullets.some((b) => b.includes("25-point")));
    check("an invented tenure badge is removed", !a.heroTrustBadges.some((b) => b.includes("2009")), JSON.stringify(a.heroTrustBadges));
    check("an FAQ whose answer was the invented figure is dropped whole", a.faqItems.length === 1 && a.faqItems[0].question.includes("free"), JSON.stringify(a.faqItems));
    check("an invented story paragraph is dropped", a.storyParagraphs.length === 1 && !a.storyParagraphs[0].includes("9 out of 10"), JSON.stringify(a.storyParagraphs));
    check("the supported subheadline is untouched", a.subheadline.includes("25-point"), a.subheadline);
    check("grounding travels with the proposal for the confirm round-trip", Array.isArray(a.operatorStatedFigures) && a.operatorStatedFigures.length === figures.length);

    // CONFIRM re-validates the camelCase output. It must be stable.
    const again = cap.validate(a);
    check("re-validation at confirm succeeds", again.ok, again.ok ? "" : again.error);
    if (again.ok) {
      const b = asGenerated(again.args);
      check("... and changes nothing", JSON.stringify(b.stageContent) === JSON.stringify(a.stageContent) && JSON.stringify(b.bullets) === JSON.stringify(a.bullets) && JSON.stringify(b.faqItems) === JSON.stringify(a.faqItems));
    }
  }

  // A HEADLINE THAT IS ONLY AN INVENTED FIGURE is sent back to the model to
  // rewrite, through the existing repair loop, rather than shipped blank.
  const h = cap.validate({ headline: "Save $4,000 on your next roof", bullets: "Free 25-point roof inspection", operator_stated_figures: figures });
  check("an invented-figure headline is returned for rewrite", !h.ok && /figure nobody supplied/.test(h.ok ? "" : h.error), h.ok ? "accepted" : h.error.slice(0, 80));

  // A model cannot ground its own figure: the chat route overwrites the field
  // from user turns. Proven at the route boundary below; here, an EMPTY list
  // (a brief with no numbers) still enforces.
  // (The filler bullet here is deliberately not a price claim: with an empty
  // grounding list the zero-price rule would refuse "Free inspection" too, and
  // this case is about the NUMERIC rule. See verify-zero-price-integrity.mts.)
  const none = cap.validate({ headline: "Find out what your roof needs", bullets: "Photos of any damage we find, Repairs in 3 days", operator_stated_figures: [] });
  check("an empty grounding list still enforces", none.ok && asGenerated(none.args).bullets.length === 1, JSON.stringify(none.ok ? asGenerated(none.args).bullets : none.error));
}

// ── 8. The chat route attaches operator figures to EVERY write validation ──
console.log("\n══ the route boundary ══");
{
  const route = readFileSync(new URL("../src/app/api/ai-suite/chat/route.ts", import.meta.url), "utf8");
  const writeValidations = route.match(/cap\.validate\(withOperatorFigures\(/g)?.length ?? 0;
  check("both write-validation sites ground against operator figures", writeValidations === 2, `${writeValidations} sites`);
  check("figures are taken from user turns only", /messages\.filter\(\(m\) => m\.role === "user"\)/.test(route));
  check("the field is overwritten, never trusted from the model", /\.\.\.args,\s*operator_stated_figures: operatorFigures/.test(route));
}

console.log(failures === 0 ? "\nNUMERIC CLAIM INTEGRITY: ALL CHECKS PASSED\n" : `\nNUMERIC CLAIM INTEGRITY: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
