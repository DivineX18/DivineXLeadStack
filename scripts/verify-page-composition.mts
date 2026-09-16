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

// ── 6. Proof composes when a photograph would be counterfeit ────────────────
console.log("\n══ proof actually composes ══");
{
  // The consultant/lead-magnet/paid-offer shape: no image anywhere on the page.
  const out = composePage([hero(), benefits(true), offer("What you get"), footer()], {
    primaryCtaLabel: "Book it",
    proofVisual: "process_flow",
  });
  check("a page with no image is given a composed proof beat", layoutFamilyOf(out[1]) === "process", layoutFamilyOf(out[1]));
}
{
  const out = composePage([hero(), benefits(true), footer()], { primaryCtaLabel: "Book it", proofVisual: "document_showcase" });
  check("a deliverable offer is shown as a labelled example document", layoutFamilyOf(out[1]) === "showcase", layoutFamilyOf(out[1]));
}
{
  // A STEPPER OF BARE LABELS IS NOT PROCESS PROOF. The consultant page drew
  // three unexplained labels joined by a line and communicated less than the
  // checklist it replaced.
  const bare = sec("s2", "benefits_grid", { items: [{ title: "Apply" }, { title: "Strategy call" }, { title: "Roadmap" }] });
  const out = composePage([hero(), bare, footer()], { primaryCtaLabel: "Book it", proofVisual: "process_flow" });
  check("unexplained steps are not drawn as a process", layoutFamilyOf(out[1]) === "showcase", layoutFamilyOf(out[1]));
}
{
  // With real substance under each step, the flow earns its place.
  const explained = sec("s2", "benefits_grid", {
    items: [
      { title: "Apply", description: "You answer six questions about how delivery currently runs." },
      { title: "Delivery-path map", description: "We trace one live project end to end and mark where it stalls." },
      { title: "Written findings", description: "You get the constraint, the evidence, and what to fix first." },
    ],
  });
  const out = composePage([hero(), explained, footer()], { primaryCtaLabel: "Book it", proofVisual: "process_flow" });
  check("explained steps are drawn as a process", layoutFamilyOf(out[1]) === "process", layoutFamilyOf(out[1]));
}
{
  // PERSUASION-BEAT DIFFERENTIATION. A showcase above the offer card has
  // already done the "what's inside" job; the card repeating it is repetition,
  // not reinforcement.
  const bg = sec("s2", "benefits_grid", { items: [{ title: "One" }, { title: "Two" }, { title: "Three" }] });
  const card = sec("s3", "offer", { headline: "Know the three changes", bullets: ["One", "Two", "Three"], ctaLabel: "Get it", priceCents: 4900 });
  const out = composePage([hero(), bg, card, footer()], { primaryCtaLabel: "Get it", proofVisual: "document_showcase" });
  check("the showcase carried the contents", layoutFamilyOf(out[1]) === "showcase", layoutFamilyOf(out[1]));
  check("the offer card does not restate what the showcase just showed", ((out[2].config as { bullets?: string[] }).bullets ?? []).length === 0, `${((out[2].config as { bullets?: string[] }).bullets ?? []).length} bullets`);
  check("the offer card keeps the job only it can do", (out[2].config as { priceCents?: number }).priceCents === 4900 && !!(out[2].config as { ctaLabel?: string }).ctaLabel);
}
{
  // PHOTO AND PROOF ARE INDEPENDENT JOBS. A hero photograph used to stand proof
  // down for the whole page, which on the booking fixture left one image in the
  // fold and two bare checklists beneath it. A picture in the fold says this is
  // real; a proof beat says here is what happens. One does not answer the other.
  const withPhoto = sec("s1", "hero", { headline: "H", ctaLabel: "Book it", mediaType: "image", mediaUrl: "https://example.test/a.jpg" });
  const out = composePage([withPhoto, benefits(true), footer()], { primaryCtaLabel: "Book it", proofVisual: "process_flow" });
  check("a hero photograph does not suppress the page's proof beat", layoutFamilyOf(out[1]) === "showcase" || layoutFamilyOf(out[1]) === "process", layoutFamilyOf(out[1]));
}
{
  // What DOES stand proof down is the section itself already having imagery.
  const withOwnImages = sec("s2", "benefits_grid", {
    items: [{ title: "A", imageUrl: "https://x.test/a.jpg" }, { title: "B", imageUrl: "https://x.test/b.jpg" }],
  });
  const out = composePage([hero(), withOwnImages, footer()], { primaryCtaLabel: "Book it", proofVisual: "process_flow" });
  check("a section with its own photographs is not overwritten by proof", layoutFamilyOf(out[1]) !== "process" && layoutFamilyOf(out[1]) !== "showcase", layoutFamilyOf(out[1]));
}
{
  // One item is a diagram of nothing.
  const thin = sec("s2", "benefits_grid", { items: [{ title: "One thing", description: "Only one." }] });
  const out = composePage([hero(), thin, footer()], { primaryCtaLabel: "Book it", proofVisual: "process_flow" });
  check("a single item is not drawn as a process", layoutFamilyOf(out[1]) !== "process", layoutFamilyOf(out[1]));
}
{
  // An explicit register decision still wins over the proof allocation.
  const urgent = sec("s2", "benefits_grid", { variant: "flowing_checklist", items: [{ title: "A", description: "a" }, { title: "B", description: "b" }] });
  const out = composePage([hero(), urgent, footer()], { primaryCtaLabel: "Book it", proofVisual: "process_flow" });
  check("an explicit variant is not replaced by the proof beat", layoutFamilyOf(out[1]) === "centered_column", layoutFamilyOf(out[1]));
}

{
  // A ONE-FOLD PAGE HAS NO MID-PAGE BEAT. The lead-magnet fixture is a single
  // hero, so with no benefits section and no honest photography it rendered
  // with no visual anywhere on the page.
  const oneFold = sec("s1", "hero", {
    headline: "The one schedule change that ends most toddler night waking",
    ctaLabel: "Send me the guide",
    mediaType: "none",
    bullets: ["Built around wake windows", "Nothing to buy to use it", "Written by a sleep consultant"],
  });
  const out = composePage([oneFold, footer()], { primaryCtaLabel: "Send me the guide", proofVisual: "document_showcase" });
  const cfg = out[0].config as { proofShowcase?: { items: { title: string }[] } };
  check("a one-fold page carries the deliverable in its fold", (cfg.proofShowcase?.items.length ?? 0) === 3, `${cfg.proofShowcase?.items.length ?? 0} items`);
  check("the fold showcase uses the page's own bullets", cfg.proofShowcase?.items[0].title === "Built around wake windows");
  check(
    "the inline checklist is not printed beside its own showcase",
    ((out[0].config as { bullets?: string[] }).bullets ?? []).length === 0,
    `${((out[0].config as { bullets?: string[] }).bullets ?? []).length} bullets left`,
  );
}
{
  // THE HOLE THE FOLD SUBSTITUTE FELL THROUGH.
  //
  // The rule above used to ask `proofVisual === "document_showcase"`, which is a
  // question about the CATEGORY, not about the page — so it was unreachable for
  // every page whose proof mode is `process_flow`. The real lead-magnet
  // generation classified as coaching (a paediatric sleep consultant), took the
  // process_flow branch, and shipped a single hero with no visual anywhere on
  // it. The same page, one enum apart, must get the same treatment.
  const oneFold = sec("s1", "hero", {
    headline: "The one schedule change that ends most toddler night waking",
    ctaLabel: "Send me the guide",
    layout: "split",
    mediaType: "none",
    bullets: ["Built around wake windows", "Nothing to buy to use it", "Written by a sleep consultant"],
  });
  const out = composePage([oneFold, footer()], { primaryCtaLabel: "Send me the guide", proofVisual: "process_flow" });
  const cfg = out[0].config as { proofShowcase?: { items: { title: string }[] }; layout?: string };
  check(
    "a one-fold page is given its fold beat whatever the proof mode",
    (cfg.proofShowcase?.items.length ?? 0) === 3,
    `${cfg.proofShowcase?.items.length ?? 0} items`,
  );
}
{
  // A SUBSTITUTE THAT NOTHING RENDERS IS NOT A SUBSTITUTE. Only the split fold
  // draws a proof showcase — the centred fold ignores the field — so assigning
  // one without the layout would delete the bullets and show nothing in their
  // place. The lead-magnet hero happened to already be split; the rule must not
  // depend on that luck.
  const centred = sec("s1", "hero", {
    headline: "H",
    ctaLabel: "Go",
    mediaType: "none",
    bullets: ["One thing", "Two thing", "Three thing"],
  });
  const out = composePage([centred, footer()], { primaryCtaLabel: "Go", proofVisual: "process_flow" });
  const cfg = out[0].config as { proofShowcase?: { items: unknown[] }; layout?: string; bullets?: string[] };
  check("the fold beat brings a layout that renders it", cfg.layout === "split", cfg.layout ?? "centered");
  check(
    "the bullets are not cleared without something taking their place",
    !((cfg.bullets ?? []).length === 0 && !cfg.proofShowcase?.items.length),
  );
}
{
  // A planned media slot is NOT imagery: the published renderer strips a hero
  // whose mediaUrl never resolved, so a page carrying only that intent has
  // nothing to show and must still be given a beat.
  const planned = sec("s1", "hero", {
    headline: "H",
    ctaLabel: "Go",
    mediaType: "image",
    mediaPlaceholderLabel: "A photo of the work",
    bullets: ["One thing", "Two thing"],
  });
  const out = composePage([planned, footer()], { primaryCtaLabel: "Go", proofVisual: "process_flow" });
  check(
    "an unresolved media slot does not count as a visual beat",
    ((out[0].config as { proofShowcase?: { items: unknown[] } }).proofShowcase?.items.length ?? 0) === 2,
  );
}
{
  // A page that DOES have a mid-page beat must use that, not the fold.
  const out = composePage([hero(), benefits(true), footer()], { primaryCtaLabel: "Book it", proofVisual: "document_showcase" });
  check("a page with a mid-page beat does not also load the fold", (out[0].config as { proofShowcase?: unknown }).proofShowcase === undefined);
}
{
  // ...and a real photograph ANYWHERE on the page is a visual beat, so the fold
  // is left as written rather than doubling up.
  const story = sec("s2", "story", { headline: "S", body: "b", photoUrl: "https://x.test/p.jpg" });
  const out = composePage([hero(), story, footer()], { primaryCtaLabel: "Book it", proofVisual: "process_flow" });
  check("a photograph elsewhere on the page stands the fold beat down", (out[0].config as { proofShowcase?: unknown }).proofShowcase === undefined);
}
{
  // A real photograph always wins the fold.
  const withPhoto = sec("s1", "hero", { headline: "H", ctaLabel: "Go", mediaType: "image", mediaUrl: "https://example.test/a.jpg", bullets: ["One", "Two"] });
  const out = composePage([withPhoto, footer()], { primaryCtaLabel: "Go", proofVisual: "document_showcase" });
  check("a fold with a real photograph is left alone", (out[0].config as { proofShowcase?: unknown }).proofShowcase === undefined);
}

{
  // A zigzag-image decision that has no images cannot be honoured; the renderer
  // downgrades it to a bare checklist, and a composed proof beat is better.
  const wants = sec("s2", "benefits_grid", { variant: "alternating_image", items: [{ title: "A", description: "a" }, { title: "B", description: "b" }] });
  const out = composePage([hero(), wants, footer()], { primaryCtaLabel: "Book it", proofVisual: "process_flow" });
  const fam = layoutFamilyOf(out[1]);
  check("an image variant with no images yields to the proof beat", fam === "process" || fam === "showcase", fam);
}
{
  // ONE image across three rows is the same failure as none: the renderer
  // downgrades it, so the planner must not read it as "this section has
  // imagery" and stand proof down.
  const minority = sec("s2", "benefits_grid", {
    variant: "alternating_image",
    items: [{ title: "A", imageUrl: "https://x.test/a.jpg" }, { title: "B" }, { title: "C" }],
  });
  const out = composePage([hero(), minority, footer()], { primaryCtaLabel: "Book it", proofVisual: "document_showcase" });
  check("a zigzag that cannot fill half its rows yields to proof", layoutFamilyOf(out[1]) === "showcase", layoutFamilyOf(out[1]));
}
{
  // ...but one that DOES have images keeps its rows.
  const has = sec("s2", "benefits_grid", { variant: "alternating_image", items: [{ title: "A", imageUrl: "https://x.test/a.jpg" }, { title: "B", imageUrl: "https://x.test/b.jpg" }] });
  const out = composePage([hero(), has, footer()], { primaryCtaLabel: "Book it", proofVisual: "process_flow" });
  check("an image variant that has images is untouched", layoutFamilyOf(out[1]) === "alternating", layoutFamilyOf(out[1]));
}

// ── 7. Reinforcement vs accidental repetition ───────────────────────────────
console.log("\n══ reinforcement vs accidental repetition ══");
{
  // The Summit shape: the offer card restates the three deliverables above its
  // button. That is direct response, not a defect.
  const out = composePage([hero(), benefits(false), offer("Know the condition"), footer()], { primaryCtaLabel: "Book it" });
  const offerOut = out.find((s) => s.type === "offer")!.config as { bullets: string[] };
  check("the offer keeps a repeated list because it asks for the decision", offerOut.bullets.length > 0, `${offerOut.bullets.length} bullets`);
}
{
  // The same list again in a block that asks for nothing is an echo.
  const inert = sec("s7", "included", { headline: "Also included", items: [{ title: "Free 25-point roof inspection" }, { title: "Photo documentation" }, { title: "Written recommendations" }] });
  const bg = sec("s2", "benefits_grid", { items: [{ title: "Free 25-point roof inspection" }, { title: "Photo documentation" }, { title: "Written recommendations" }] });
  const out = composePage([hero(), bg, inert, footer()], { primaryCtaLabel: "Book it" });
  const inertOut = out.find((s) => s.type === "included")!.config as { items: unknown[] };
  check("an inert repeat of the same list is dropped", inertOut.items.length === 0, `${inertOut.items.length} items`);
}
{
  // A section with its own content is never touched.
  const bg = sec("s2", "benefits_grid", { items: [{ title: "One" }, { title: "Two" }] });
  const other = sec("s7", "included", { items: [{ title: "Something else entirely" }] });
  const out = composePage([hero(), bg, other, footer()], { primaryCtaLabel: "Book it" });
  check("a section with different content is untouched", ((out.find((s) => s.type === "included")!.config as { items: unknown[] }).items.length) === 1);
}

// ── 8. A malformed optional field cannot discard a valid argument ───────────
console.log("\n══ a malformed field cannot discard the argument ══");
{
  const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
  const validate = getCapability("create_funnel")!.validate!;
  const base = {
    funnel_name: "Summit Roofing", genre: "lead_gen",
    headline: "Find out what condition your roof is actually in",
    bullets: "A, B, C", cta_label: "Book it",
  };
  const argOf = (sa: Record<string, unknown>) =>
    (validate({ ...base, sales_argument: sa } as never) as { ok: boolean; args: Record<string, unknown> }).args
      .salesArgument as { beliefChain: string[]; corePromise: string; mechanism: string } | null;

  // The exact shape that discarded the whole plan: a chain as one string.
  const oneString = argOf({
    prospect: "A Houston homeowner", current_belief: "I will be upsold",
    belief_chain: "You cannot decide about a roof you have not seen",
    mechanism: "A documented 25-point inspection", core_promise: "Know the condition first",
    primary_objection: "I do not want to be sold", close_reason: "It is free",
  });
  check("a chain given as a string does not discard the plan", oneString !== null);
  check("the other nine fields survive", oneString?.mechanism === "A documented 25-point inspection", oneString?.mechanism ?? "lost");

  // Several beliefs in one string, the way a model actually writes them.
  const separated = argOf({
    prospect: "A homeowner",
    belief_chain: "First belief; second belief; third belief",
    core_promise: "Know the condition",
  });
  check("a semicolon-separated chain is split into steps", (separated?.beliefChain.length ?? 0) === 3, `${separated?.beliefChain.length ?? 0} steps`);

  const numbered = argOf({ prospect: "A homeowner", belief_chain: "1. First\n2. Second", core_promise: "X" });
  check("list markers are stripped from a numbered chain", numbered?.beliefChain[0] === "First", numbered?.beliefChain[0] ?? "");

  // A properly-formed array is unchanged.
  const array = argOf({ prospect: "A homeowner", belief_chain: ["One", "Two", "Three"], core_promise: "X" });
  check("a well-formed array still works exactly as before", (array?.beliefChain.length ?? 0) === 3);

  // A plan with nothing usable in it is still rejected.
  const empty = argOf({ prospect: "A homeowner" });
  check("a plan carrying no usable material is still rejected", empty === null);
}

// ── 9. Trust-claim integrity ────────────────────────────────────────────────
console.log("\n══ a service area is not an organisation ══");
{
  const { isUnsupportedTrustClaim, stripUnsupportedClaims } = await import("../src/lib/funnels/claim-integrity.ts");

  // THE CLAIM THAT SHIPPED. Houston was verified; local ownership never was.
  check("the badge that shipped is caught", isUnsupportedTrustClaim("Locally owned in Houston"));

  for (const claim of [
    "Family owned since day one", "Veteran owned business", "Woman owned studio",
    "Minority owned", "Independently owned", "Founder-led team",
    "Proudly family-run", "Owned and operated locally", "100% Australian owned",
    "Employee owned", "A family business",
  ]) {
    check(`caught: "${claim}"`, isUnsupportedTrustClaim(claim));
  }

  // WHERE THE PEOPLE ARE IS THE SAME INFERENCE. The badge blocked above came
  // straight back as a staffing claim on the next generation of the same
  // business, from the same single fact — that it serves Houston.
  check("the staffing badge that shipped next is caught", isUnsupportedTrustClaim("Local Houston crew"));
  // ... and then, on PRODUCTION, as a trade noun. Enumerating people nouns was
  // itself the defect: trades are productive, so the list loses to English.
  // These are recognised by agent MORPHOLOGY, which is why none of them appears
  // anywhere in the rule.
  check("the trade noun that shipped on production is caught", isUnsupportedTrustClaim("Local Houston roofers"));
  for (const claim of [
    // The named class, in every shape the model writes it.
    "Local Houston plumbers", "Local Brisbane electricians", "Local dentists",
    "Houston-based crew", "Local team", "Locally owned", "Family-owned", "Founder-led",
    // Trades never named in the rule — the point of the morphology.
    "Local glaziers", "Local locksmiths", "local conveyancers", "Local surveyors",
    "Local physiotherapists", "Local Perth landscapers", "local arborists",
    // Case, punctuation, number, and geography on either side.
    "LOCAL CREW", "local crew.", "Local Crew", "Local technician",
    "Local Houston Roofers", "Crew based locally", "Team that lives locally",
    "Roofers local to Houston", "Locally staffed", "Our local installers",
    "Local workforce", "Local experts", "Local professionals", "Local specialist",
  ]) {
    check(`caught: "${claim}"`, isUnsupportedTrustClaim(claim));
  }

  // ORDINARY COPY MUST SURVIVE. A rule that eats real content is worse than
  // the claim it removes.
  for (const fine of [
    "Free, no obligation", "Written recommendation, not a quote",
    "Serving Houston homeowners", "Locally sourced materials",
    "We own the outcome", "Family bathroom refits", "Licensed and insured",
    "No credit card required", "Evening appointments twice a week",
    // A SERVICE IS NOT A STAFFING CLAIM. These describe what the business
    // DOES, or who it sells TO; deleting them would be the rule doing the
    // damage it exists to prevent. The separator is the claim's TARGET:
    // market and service survive, people and ownership do not.
    "Local SEO experts", "Local search specialists", "Local search strategy",
    "Local delivery available", "Local delivery", "We know the local market",
    "Local market knowledge", "Local pickup in 2 hours", "Local service area",
    "Locally sourced materials", "Serving Houston homeowners",
    "Houston roofing services", "Roofing inspections in Houston",
    "Serving local homeowners", "Serving the Houston area",
    "Helping local businesses grow", "Local offers this month",
    "Houston roofing inspections", "Same-day local delivery",
    // The same words used attributively, where the head noun is the service.
    "Local expert advice", "Local professional service", "Local specialist care",
  ]) {
    check(`kept: "${fine}"`, !isUnsupportedTrustClaim(fine));
  }

  const { kept, dropped } = stripUnsupportedClaims([
    "Free, no obligation",
    "Written recommendation, not a quote",
    "Locally owned in Houston",
  ]);
  check("the unsupported claim is removed and the rest survive", kept.length === 2 && dropped.length === 1, `kept ${kept.length}, dropped ${dropped.join("|")}`);
  check("nothing is invented to replace it", !kept.some((k) => /owned/i.test(k)));
}
{
  // The validate layer must apply it, not just the helper.
  const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
  const v = getCapability("create_funnel")!.validate!({
    funnel_name: "Summit Roofing", genre: "lead_gen",
    headline: "Find out what condition your roof is actually in",
    bullets: "A, B, C", cta_label: "Book it",
    hero_trust_badges: ["Free, no obligation", "Locally owned in Houston", "Local Houston crew"],
    trust_badges: ["Family owned", "Privacy protected"],
  } as never) as { ok: boolean; args: Record<string, unknown> };
  const hero = (v.args.heroTrustBadges ?? []) as string[];
  const section = (v.args.trustBadges ?? []) as string[];
  check(
    "validate strips both the ownership and the staffing claim from hero badges",
    hero.length === 1 && hero[0] === "Free, no obligation",
    hero.join(" | "),
  );
  check("validate strips it from section badges too", section.length === 1 && section[0] === "Privacy protected", section.join(" | "));
}
{
  // A BADGE IS A COMPLETE THOUGHT, OR IT IS DROPPED.
  //
  // This check used to assert the intermediate fix: a 41-character line cut
  // back to the last whole word, giving "Written recommendation, not a sales".
  // That removed the typo and kept the real defect — a sentence that stops.
  // Northstar later shipped "Application only, we take a limited" the same way,
  // which is how an invented capacity cap reached the fold wearing a shorter
  // coat. Compression is now only ever a leading clause that stands alone.
  const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
  const v = getCapability("create_funnel")!.validate!({
    funnel_name: "Summit Roofing", genre: "lead_gen",
    headline: "Find out what condition your roof is actually in",
    bullets: "A, B, C", cta_label: "Book it",
    hero_trust_badges: ["Written recommendation, not a sales quote", "Free, no obligation"],
  } as never) as { ok: boolean; args: Record<string, unknown> };
  const badges = (v.args.heroTrustBadges ?? []) as string[];
  check("an over-long badge compresses to a complete leading clause", badges[0] === "Written recommendation", badges[0]);
  check("... and never ends on a dangling word", !/\b(a|an|the|not|and|or|of|to|for|with)$/i.test(badges[0] ?? ""), badges[0]);
  check("every badge still fits the cap", badges.every((b) => b.length <= 40), badges.join(" | "));
  check("a badge that fits is untouched", badges[1] === "Free, no obligation", badges[1]);
}

// ── 10. Purity ──────────────────────────────────────────────────────────────
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
