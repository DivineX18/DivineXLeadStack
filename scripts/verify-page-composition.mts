/**
 * PAGE-LEVEL COMPOSITION — deterministic regression.
 *
 * Every case here is a shape that actually shipped on a rendered fixture, not
 * an invented input. The rendered battery (verify-landing-page-quality.mts)
 * proves the page a visitor sees; this proves the rules that produce it, fast
 * and without a model call, so a regression is caught before anything renders.
 *
 *   npx tsx scripts/verify-page-composition.mts
 */
import type { FunnelSection } from "../src/types/funnels.ts";
import { composePage, describePageRhythm, layoutFamilyOf } from "../src/lib/funnels/page-composition.ts";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const sec = (id: string, type: string, config: Record<string, unknown>): FunnelSection =>
  ({ id, type, config } as unknown as FunnelSection);

const hero = (headline = "Find out what condition your roof is actually in") =>
  sec("s1", "hero", { headline, ctaLabel: "Schedule My Free Roof Inspection", mediaType: "none" });
const benefits = (rich: boolean) =>
  sec("s2", "benefits_grid", {
    items: [
      { title: "Free 25-point roof inspection", ...(rich ? { description: "Every slope, flashing and penetration." } : {}) },
      { title: "Photo documentation", ...(rich ? { description: "You see what we saw." } : {}) },
      { title: "Written recommendations", ...(rich ? { description: "Before any work begins." } : {}) },
    ],
  });
const offer = (headline: string) =>
  sec("s3", "offer", { headline, bullets: ["A written report"], ctaLabel: "Schedule My Free Roof Inspection" });
const close = (over: Record<string, unknown> = {}) =>
  sec("s4", "cta_banner", { headline: "Ready?", ctaLabel: "Get started", ctaHref: "", ...over });
const footer = () => sec("s9", "business_footer", { businessName: "Summit Roofing" });

// ── 1. The close closes ─────────────────────────────────────────────────────
console.log("\n══ the close closes ══");
{
  const out = composePage([hero(), offer("Know the condition first"), close(), footer()], {
    primaryCtaLabel: "Schedule My Free Roof Inspection",
    corePromise: "Know exactly what condition your roof is in before spending anything",
    closeReason: "The inspection is free and ends with a written recommendation, not a quote",
  });
  const banner = out.find((s) => s.type === "cta_banner")!.config as { headline: string; ctaLabel: string };
  check("the seeded 'Get started' button takes the page's own CTA label", banner.ctaLabel === "Schedule My Free Roof Inspection", banner.ctaLabel);
  check("the seeded 'Ready?' heading takes the plan's reason to act", banner.headline === "The inspection is free and ends with a written recommendation, not a quote", banner.headline);
}
{
  // THE REGRESSION THIS SECTION EXISTS FOR. The offer is already headed with
  // the core promise (applySalesArgument seeds it there), so a close that also
  // reaches for the promise prints one sentence twice — which is exactly what
  // the first version of this pass shipped on four of five fixtures.
  const promise = "Know exactly what condition your roof is in";
  const out = composePage([hero(), offer(promise), close(), footer()], {
    primaryCtaLabel: "Book it",
    corePromise: promise,
    closeReason: "The inspection is free and ends with a recommendation, not a quote",
  });
  const headings = out
    .map((s) => (s.config as { headline?: string }).headline?.trim())
    .filter((h): h is string => !!h);
  check("the close does not repeat the offer's heading", new Set(headings.map((h) => h.toLowerCase())).size === headings.length, headings.join(" | "));
  const banner = out.find((s) => s.type === "cta_banner")!.config as { headline: string; subtext?: string };
  check("the close is headed by the reason to act", banner.headline.startsWith("The inspection is free"), banner.headline);
}
{
  // With the reason carrying the heading, the seeded subtext must not say it
  // again inside the same box.
  const out = composePage(
    [hero(), close({ subtext: "Know the condition. The inspection is free and ends with a recommendation." }), footer()],
    { primaryCtaLabel: "Book it", corePromise: "Know the condition", closeReason: "The inspection is free and ends with a recommendation" },
  );
  const banner = out.find((s) => s.type === "cta_banner")!.config as { headline: string; subtext?: string };
  check("the close subtext does not echo its own heading", !banner.subtext?.toLowerCase().includes("the inspection is free"), banner.subtext ?? "");
}
{
  // No plan material at all: the placeholder stays rather than inventing a close.
  const out = composePage([hero(), close(), footer()], { primaryCtaLabel: "Book it" });
  const banner = out.find((s) => s.type === "cta_banner")!.config as { headline: string; ctaLabel: string };
  check("with nothing honest to say the close heading is left alone", banner.headline === "Ready?", banner.headline);
  check("the button is still fixed even with no plan", banner.ctaLabel === "Book it", banner.ctaLabel);
}
{
  // Authored copy is never overwritten.
  const out = composePage([hero(), close({ headline: "Two slots left this week", ctaLabel: "Claim a slot" }), footer()], {
    primaryCtaLabel: "Schedule My Free Roof Inspection",
    corePromise: "Know exactly what condition your roof is in",
  });
  const banner = out.find((s) => s.type === "cta_banner")!.config as { headline: string; ctaLabel: string };
  check("authored close heading survives", banner.headline === "Two slots left this week");
  check("authored close CTA survives", banner.ctaLabel === "Claim a slot");
}
{
  // A promise too long to head a banner leaves the placeholder rather than
  // shipping a truncated sentence.
  const long = "Know exactly what condition your roof is in before you spend a single dollar on anything at all anywhere";
  const out = composePage([hero(), close(), footer()], { primaryCtaLabel: "Book it", corePromise: long });
  const banner = out.find((s) => s.type === "cta_banner")!.config as { headline: string };
  check("an over-long promise does not become a truncated heading", banner.headline === "Ready?", banner.headline);
}

// ── 2. The page closes last ─────────────────────────────────────────────────
console.log("\n══ the page closes last ══");
{
  // The consultant fixture's exact shape: close at 3, offer at 4.
  const out = composePage([hero(), benefits(false), close(), offer("Know what to fix before you hire again"), footer()], {
    primaryCtaLabel: "Apply for a review",
    corePromise: "Know what to fix before you hire again",
  });
  const types = out.map((s) => s.type);
  check("a close that landed above the offer moves below it", types.indexOf("cta_banner") > types.indexOf("offer"), types.join(" → "));
  check("the footer still signs the page last", types[types.length - 1] === "business_footer", types.join(" → "));
}
{
  // A mid-page action beat above an FAQ is legitimate and must not be moved.
  const faq = sec("s5", "faq", { items: [{ question: "How long does it take?", answer: "About an hour." }] });
  const out = composePage([hero(), close(), faq, footer()], { primaryCtaLabel: "Book it", corePromise: "Know the condition" });
  check("a close above an FAQ is left where it is", out.map((s) => s.type).join(",") === "hero,cta_banner,faq,business_footer", out.map((s) => s.type).join(","));
}

// ── 3. No heading repeats another ───────────────────────────────────────────
console.log("\n══ no heading repeats another ══");
{
  // What the synthesized floor produced on every fixture: one sentence, three times.
  const repeated = "Find out what condition your roof is actually in";
  const ps = sec("s6", "problem_solution", { headline: repeated, problemHeadline: "The usual way", problemText: "A salesperson on the roof.", solutionHeadline: "Instead", solutionText: "A documented inspection." });
  const out = composePage([hero(repeated), ps, offer(repeated), footer()], { primaryCtaLabel: "Book it" });
  const psOut = out.find((s) => s.type === "problem_solution")!.config as { headline: string };
  const offerOut = out.find((s) => s.type === "offer")!.config as { headline: string };
  check("an optional duplicate heading is cleared", psOut.headline === "", `"${psOut.headline}"`);
  check("the offer keeps its heading rather than going headless", offerOut.headline === repeated);
  check("the hero keeps the original", (out[0].config as { headline: string }).headline === repeated);
}
{
  const rhythm = describePageRhythm([hero("Same words"), offer("Same words"), footer()]);
  check("the rhythm report names the repeat", rhythm.repeatedHeadings.length === 1, rhythm.repeatedHeadings.join("|"));
}

// ── 4. The page is not one shape repeated ───────────────────────────────────
console.log("\n══ the page is not one shape repeated ══");
{
  // Four centred columns in a row — the Summit silhouette.
  const col = (id: string, h: string) => sec(id, "faq", { headline: h, items: [{ question: `Q${id}`, answer: "A." }] });
  const before = [hero(), benefits(true), col("a", "One"), col("b", "Two"), footer()];
  const runBefore = describePageRhythm(before).longestRun;
  const after = composePage(before, { primaryCtaLabel: "Book it" });
  const runAfter = describePageRhythm(after).longestRun;
  check("a run of three identical shapes is broken", runAfter < runBefore || runAfter < 3, `${runBefore} → ${runAfter}`);
  check("breaking the run used a real variant", layoutFamilyOf(after[1]) === "alternating", layoutFamilyOf(after[1]));
}
{
  // Thin items cannot earn the zigzag, so the run stands and the page is
  // honestly repetitive rather than dishonestly varied.
  const col = (id: string, h: string) => sec(id, "faq", { headline: h, items: [{ question: `Q${id}`, answer: "A." }] });
  const after = composePage([hero(), benefits(false), col("a", "One"), col("b", "Two"), footer()], { primaryCtaLabel: "Book it" });
  check("a benefits grid with bare titles is NOT promoted to zigzag rows", layoutFamilyOf(after[1]) === "centered_column", layoutFamilyOf(after[1]));
}
{
  // An empty section must never count as a shape, or it breaks a run that a
  // reader still sees as unbroken.
  const empty = sec("s8", "faq", { items: [] });
  check("an empty section has no layout family", layoutFamilyOf(empty) === "none");
  check("an empty section is skipped by the rhythm report", describePageRhythm([hero(), empty, footer()]).families.length === 2);
}

// ── 5. A real photograph earns the fold's width ─────────────────────────────
console.log("\n══ a real photograph earns the fold's width ══");
{
  const withPhoto = sec("s1", "hero", { headline: "Find out what condition your roof is in", ctaLabel: "Book it", mediaType: "image", mediaUrl: "https://example.test/roof.jpg" });
  const out = composePage([withPhoto, footer()], { primaryCtaLabel: "Book it" });
  check("a centred hero with a real image becomes the split fold", (out[0].config as { layout: string }).layout === "split", String((out[0].config as { layout?: string }).layout));
}
{
  // A placeholder stretched across half the fold is a hole, not a design.
  const placeholder = sec("s1", "hero", { headline: "H", ctaLabel: "Book it", mediaType: "image", mediaPlaceholderLabel: "A roof inspection" });
  const out = composePage([placeholder, footer()], { primaryCtaLabel: "Book it" });
  check("a hero with only a placeholder stays centred", (out[0].config as { layout?: string }).layout === undefined, String((out[0].config as { layout?: string }).layout));
}
{
  // The urgent register's full-bleed hero is a deliberate decision.
  const urgent = sec("s1", "hero", { headline: "H", ctaLabel: "Book it", mediaType: "image", mediaUrl: "https://example.test/a.jpg", layout: "background_image" });
  const out = composePage([urgent, footer()], { primaryCtaLabel: "Book it" });
  check("an explicit hero layout is never overridden", (out[0].config as { layout: string }).layout === "background_image");
}

// ── 6. Purity ───────────────────────────────────────────────────────────────
console.log("\n══ purity ══");
{
  const input = [hero(), close(), footer()];
  const snapshot = JSON.stringify(input);
  composePage(input, { primaryCtaLabel: "Book it", corePromise: "Know the condition" });
  check("composePage does not mutate its input", JSON.stringify(input) === snapshot);
}
{
  const out = composePage([], {});
  check("an empty page composes to an empty page", out.length === 0);
}

console.log(failures === 0 ? "\nPAGE COMPOSITION: ALL CHECKS PASSED\n" : `\nPAGE COMPOSITION: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
