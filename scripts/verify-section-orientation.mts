/**
 * EVERY VISIBLE SECTION TELLS THE READER WHAT IT IS.
 *
 * Two pages shipped sections nobody had named. Booking's CONVERSION CARD opened
 * with blank space above a bullet list, because its corePromise was 110
 * characters with no comma in it, so the clause-splitting fallback returned null
 * and left the headline empty. Northstar put a browser-framed five-item
 * document directly below the fold with no heading at all, because nothing
 * seeded a benefits grid the model had left unheaded.
 *
 * Neither was caught by anything: completeness asks whether a section HAS
 * content, and both had plenty. What was missing is whether a reader can tell
 * what the content is.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-section-orientation.mts
 */
import { applySalesArgument, stampArgumentRoles, fitCompleteThought } from "../src/lib/funnels/art-direction.ts";
import { completeThoughtWithin } from "../src/lib/funnels/display-text.ts";
import { findUnorientedSections } from "../src/lib/funnels/page-composition.ts";
import type { FunnelSection } from "../src/types/funnels";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const sec = (id: string, type: string, config: Record<string, unknown>): FunnelSection =>
  ({ id, type, config }) as unknown as FunnelSection;

const plan = (corePromise: string) => ({
  beliefChain: ["You cannot fix what you have not measured", "A written finding is a decision you can act on"],
  corePromise,
  closeReason: "Fixed scope, no retainer",
  currentBelief: "We need to hire our way out of this",
  whyOldWayFails: "Headcount multiplies an unclear process",
  mechanism: "A delivery-path map",
  oldWay: "Hire another lead",
});

// ── 1. The promise-to-heading ladder ───────────────────────────────────────
console.log("\n══ a heading is a complete thought, by whichever route ══");
{
  // SHORT PROMISE: used whole, untouched.
  const short = "Know what to fix before you hire again";
  check("a short promise is used verbatim", fitCompleteThought(short, 80) === short);

  // LONG WITH PUNCTUATION: the clause seam wins, as before.
  const punctuated = "Know exactly where your delivery breaks at twice your current volume, in writing, before you spend anything on hiring";
  const viaClause = fitCompleteThought(punctuated, 80);
  check("a punctuated promise cuts at its clause seam", !!viaClause && viaClause.length <= 80, String(viaClause));
  check("... and does not end mid-thought", !/\b(and|or|the|a|to|of|for|with|your)$/i.test(viaClause ?? ""), String(viaClause));

  // LONG WITHOUT PUNCTUATION: no author-terminated boundary exists, so there is
  // NO safe shortening and the caller must fall back to a label. A
  // word-boundary prefix used to be attempted here and produced
  // "…the most conversions on your specific" on a live conversion card.
  const unpunctuated = "Find out what's going on in your mouth without anything being done to you and without being judged for waiting";
  check("an unpunctuated promise has no clause seam to use", fitCompleteThought(unpunctuated, 80) === null);
  check("... and the shared contract refuses to invent one", completeThoughtWithin(unpunctuated, 80) === null);
}

// ── 2. The offer card always says what it is ───────────────────────────────
console.log("\n══ the conversion card is never blank ══");
{
  const offerOf = (sections: FunnelSection[]) =>
    (sections.find((s) => s.type === "offer")!.config as { headline?: string }).headline ?? "";

  const base = [sec("h", "hero", { headline: "A headline" }), sec("o", "offer", { bullets: ["One", "Two"], ctaLabel: "Go" })];

  // THE BOOKING CASE, END TO END.
  const booking = applySalesArgument(
    stampArgumentRoles(base),
    plan("Find out what's going on in your mouth without anything being done to you and without being judged for waiting"),
  );
  const h = offerOf(booking);
  check("an unpunctuated promise still heads the offer", h.length > 0, h);
  // It heads it with a LABEL, not with a cut sentence. Losing the operator's
  // specific promise is the accepted cost of never shipping a half-sentence.
  check("... using a truthful label rather than a cut sentence", h === "What you get", h);
  check("... and reads as a complete thought", !/\b(and|without|to|the|a|your|specific)$/i.test(h), h);

  // A PRICE IS ITS OWN ORIENTATION: a tripwire leading with "$49" keeps its
  // deliberate silence rather than gaining a generic heading.
  const priced = applySalesArgument(
    stampArgumentRoles([sec("h", "hero", { headline: "A headline" }), sec("o", "offer", { bullets: ["One"], priceCents: 4900 })]),
    { ...plan(""), corePromise: "" },
  );
  check("a priced card is left alone", offerOf(priced) === "", offerOf(priced));
  check("... and the quality check accepts it", findUnorientedSections(priced).length === 0);

  // NEITHER PROMISE NOR PRICE: a deterministic label, never a blank card.
  const bare = applySalesArgument(stampArgumentRoles(base), { ...plan(""), corePromise: "" });
  check("a card with neither promise nor price gets a plain label", offerOf(bare) === "What you get", offerOf(bare));
}

// ── 3. Benefits variants that render a framed artifact ─────────────────────
console.log("\n══ a framed artifact is named ══");
{
  const headlineOf = (sections: FunnelSection[], type: string) =>
    (sections.find((s) => s.type === type)!.config as { headline?: string }).headline ?? "";
  const withGrid = (variant: string | undefined) =>
    applySalesArgument(
      stampArgumentRoles([
        sec("h", "hero", { headline: "A headline" }),
        sec("g", "benefits_grid", { items: [{ title: "One" }, { title: "Two" }], ...(variant ? { variant } : {}) }),
      ]),
      plan("Know what to fix before you hire again"),
    );

  // THE NORTHSTAR CASE.
  check("an unheaded document showcase is named", headlineOf(withGrid("document_showcase"), "benefits_grid") === "What you get", headlineOf(withGrid("document_showcase"), "benefits_grid"));
  // ... and NOT all with the same word: the label follows the treatment.
  check("a process flow is named for what it shows", headlineOf(withGrid("process_flow"), "benefits_grid") === "How it works", headlineOf(withGrid("process_flow"), "benefits_grid"));
  check("a plain checklist is named too", headlineOf(withGrid(undefined), "benefits_grid").length > 0);

  // THE MODEL'S OWN HEADING ALWAYS WINS — the fallback is only for omission.
  const authored = applySalesArgument(
    stampArgumentRoles([
      sec("h", "hero", { headline: "A headline" }),
      sec("g", "benefits_grid", { headline: "What the inspection gives you", variant: "process_flow", items: [{ title: "One" }] }),
    ]),
    plan("Know what to fix"),
  );
  check("an authored heading is never overwritten", headlineOf(authored, "benefits_grid") === "What the inspection gives you");

  // An EMPTY grid gains nothing — pruning owns that, not heading seeding.
  const empty = applySalesArgument(
    stampArgumentRoles([sec("h", "hero", { headline: "A" }), sec("g", "benefits_grid", { items: [] })]),
    plan("Know what to fix"),
  );
  check("an itemless grid is left to pruning", headlineOf(empty, "benefits_grid") === "");
}

// ── 4. The invariant itself, including its exceptions ──────────────────────
console.log("\n══ orientation may come from the component itself ══");
{
  // KNOWN EXCEPTIONS: these print their own heading or are recognisable on
  // sight. Demanding one would manufacture generic copy.
  const selfOrienting = [
    sec("f", "faq", { items: [{ question: "Q", answer: "A" }] }),           // built-in "Frequently asked questions"
    sec("a", "agenda", { days: [{ title: "Day 1" }] }),                     // built-in "Everything you'll learn"
    sec("p", "problem_solution", { problemText: "x", solutionText: "y" }),  // prints "The problem" / "The fix"
    sec("c", "comparison", { rows: [{ label: "r" }], leftTitle: "Before" }),// labels its own columns
    sec("s", "story", { byline: "Why this works", paragraphs: ["p"] }),     // opens with a byline
    sec("t", "trust_badges", { items: [{ title: "Secure" }] }),
    sec("b", "cta_banner", { headline: "Ready?", ctaLabel: "Go" }),
    sec("hr", "hero", { headline: "A headline" }),
  ];
  const flagged = findUnorientedSections(selfOrienting);
  check("no heading is demanded where the component self-orients", flagged.length === 0, flagged.map((f) => f.sectionType).join(", "));

  // THE GENUINE FAILURE: visible, no heading, nothing self-identifying.
  const ambiguous = findUnorientedSections([sec("g", "benefits_grid", { items: [{ title: "One" }, { title: "Two" }] })]);
  check("an unheaded benefits grid IS flagged", ambiguous.length === 1, JSON.stringify(ambiguous));
  check("... with a reason a human can act on", (ambiguous[0]?.reason ?? "").includes("no heading"));

  // INVISIBLE SECTIONS ARE NOT AMBIGUOUS — the renderer drops them.
  const invisible = findUnorientedSections([sec("pg", "photo_gallery", { images: [], placeholderLabel: "Add photos" })]);
  check("an invisible section is not flagged", invisible.length === 0);

  // END TO END: a page that went through the argument engine is oriented.
  const composed = applySalesArgument(
    stampArgumentRoles([
      sec("h", "hero", { headline: "A headline" }),
      sec("g", "benefits_grid", { variant: "document_showcase", items: [{ title: "One" }] }),
      sec("i", "included", { items: [{ title: "Two" }] }),
      sec("o", "offer", { bullets: ["b"], ctaLabel: "Go" }),
      sec("f", "faq", { items: [{ question: "Q", answer: "A" }] }),
    ]),
    plan("Find out what's going on in your mouth without anything being done to you and without being judged for waiting"),
  );
  const left = findUnorientedSections(composed);
  check("a fully composed page leaves nothing ambiguous", left.length === 0, left.map((f) => f.sectionType).join(", "));
}

console.log(failures === 0 ? "\nSECTION ORIENTATION: ALL CHECKS PASSED\n" : `\nSECTION ORIENTATION: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
