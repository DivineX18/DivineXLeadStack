/**
 * Regression guard for the "popup CTA doesn't open / sends visitors back to
 * the top of the page" bug report (published funnels, RC1.0 Phase 1 —
 * Popup CTA Reliability + CTA Routing Audit).
 *
 * Root causes fixed:
 *  1. loadFunnelForRender() never collected the hero section's formId, so a
 *     published hero popup_form CTA had no resolvable form and fell back to
 *     a dead `href="#"` link (which visibly jumps the page to the top).
 *  2. AnimatedSection applies a non-"none" `transform` to every revealed
 *     section (even translateY(0) once visible), which per the CSS spec
 *     establishes a new containing block for `position: fixed` descendants
 *     — so the popup Modal, rendered as a normal child instead of a portal,
 *     resolved its "fixed inset-0" against that section's box instead of
 *     the viewport: cramped, off-center, not reliably scrollable.
 *  3. CtaButton's dead-link fallback used `href={href || "#"}` in two
 *     places — an anchor with an empty-fragment href visibly scrolls to
 *     the top of the document on click, which IS the reported symptom.
 *  4. VideoSection returned null with no embedUrl, so a VSL/webinar
 *     funnel's Video stage (seeded by the "vsl" genre framework right
 *     after Hero) silently vanished from the page whenever no real video
 *     URL was available — the common case, since the AI is never allowed
 *     to invent one.
 *
 * These are DOM/CSS-rendering bugs — this script verifies the fix is
 * actually present in source (so none of it can silently regress) via
 * deterministic static checks, not a browser. It cannot confirm the fix
 * LOOKS right in an actual browser (portal + containing-block + click
 * behavior) — that requires human/browser verification, consistent with
 * this project's established verification-tier discipline.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

// 1. loadFunnelForRender collects the hero section's formId
{
  const src = read("src/lib/funnels/load-funnel-for-render.ts");
  check(
    '1a. loadFunnelForRender collects formId from "hero" sections',
    /section\.type === "hero"[\s\S]{0,150}formIds\.add\(c\.formId\)/.test(src),
  );
  check(
    "1b. loadFunnelForRender still collects offer/ticket_tiers/checkout formIds (no regression)",
    src.includes('section.type === "offer"') &&
      src.includes('section.type === "ticket_tiers"') &&
      src.includes('section.type === "checkout"'),
  );
}

// 2. Modal portals to document.body, escaping any ancestor transform
{
  const src = read("src/components/funnels/sections/modal.tsx");
  check('2a. Modal imports createPortal from "react-dom"', /import\s*\{\s*createPortal\s*\}\s*from\s*"react-dom"/.test(src));
  check("2b. Modal renders via createPortal(..., document.body)", /createPortal\(/.test(src) && /document\.body\s*,?\s*\)?;?\s*$/m.test(src.trim()));
  check(
    "2c. Modal still guards SSR (no document access when document is undefined)",
    src.includes('typeof document === "undefined"'),
  );
}

// 3. CtaButton never renders a dead href="#" anchor
{
  const src = read("src/components/funnels/sections/cta-button.tsx");
  check('3a. No more href={href || "#"} dead-link fallback anywhere in CtaButton', !src.includes('href={href || "#"}'));
  // SUPERSEDED EXPECTATION, CORRECTED 2026-09-16.
  //   OLD: with no href, fall back to an inert `<button type="button">`.
  //   NEW: with no href, render NOTHING.
  // Commit d25526d removed that fallback on purpose. The inert button was a
  // full-size, accent-coloured, hover-animated control that did nothing when
  // clicked, and VA testing found live pages where every CTA was one. A
  // button a visitor cannot use is worse than no button: it spends their
  // intent and returns nothing. Asserting the old shape would demand the
  // dead-button bug back, so this now checks the real contract, a live <a>
  // when there is somewhere to go and no actionless control when there isn't.
  check(
    "3b. Primary button is a real <a> when href is truthy, and renders NOTHING when it isn't",
    /if \(href\) \{[\s\S]{0,120}<a href=\{href\}/.test(src) &&
      !/<button type="button" className=\{btnClass\} style=\{buttonStyle\}>/.test(src),
  );
  check(
    "3c. Sticky-desktop bar fallback also avoids the dead-link pattern",
    (src.match(/href \? \(/g) ?? []).length >= 1,
  );
}

// 4. VideoSection never silently disappears
{
  const src = read("src/components/funnels/sections/video-section.tsx");
  check('4a. VideoSection no longer does "if (!config.embedUrl) return null"', !src.includes("if (!config.embedUrl) return null"));
  check("4b. VideoSection renders MediaPlaceholder when embedUrl is empty", src.includes("<MediaPlaceholder"));
  const typesSrc = read("src/types/funnels.ts");
  check("4c. VideoConfig carries an optional placeholderLabel field", /interface VideoConfig[\s\S]{0,220}placeholderLabel\?:\s*string/.test(typesSrc));
}

// 5. Builder surfaces an explicit warning instead of failing silently
{
  const src = read("src/components/funnels/funnel-builder.tsx");
  const popupFormWarnings = (src.match(/This CTA is set to open a popup, but no form is selected above/g) ?? []).length;
  check("5a. Hero AND Offer editors both warn when popup_form has no form selected (2 occurrences)", popupFormWarnings === 2);
  check("5b. Hero editor now exposes a lead-capture form picker (parity with Offer)", /Lead-capture form \(optional — hero can capture directly\)/.test(src));
  const calendarWarnings = (src.match(/this CTA won&apos;t open anything for visitors until/g) ?? []).length;
  check("5c. popup_calendar without a slug warns in both Hero and Offer editors (2 occurrences)", calendarWarnings === 2);
}

// 6. Phase 3 component audit — the same "whole required framework stage
//    silently vanishes when the AI's stage_content generation misses it"
//    bug class as VideoSection, found across 6 more section components that
//    genre frameworks treat as required (agenda/process, benefits_grid,
//    problem_solution, story/host, ticket_tiers/register, callout,
//    before_after/results).
//
// SUPERSEDED EXPECTATION, CORRECTED 2026-09-16.
//   OLD: every one of these files must import MediaPlaceholder, i.e. an empty
//        required stage always shows a visible placeholder panel.
//   NEW: on the CUSTOMER-FACING page an empty stage renders NOTHING, and the
//        placeholder survives only where it is operator guidance.
// Commit 13b04ab ("Art direction: guaranteed composition + consumed plan + no
// dead zones") deliberately reversed the old rule: "sections without valid
// content render NOTHING on the customer-facing page ... the composition
// adapts to missing assets rather than being designed around them". A
// placeholder panel on a live page IS the dead zone that commit removed, so
// asserting the old rule would push shipped behavior backwards.
//
// What still matters, and is what these checks now verify, is the bug the
// original audit was actually about: a stage must never vanish while it HAS
// content. So a `return null` is only legitimate when it is guarded by an
// explicit emptiness condition on the same line. A BARE `return null;`
// standing alone is still refused, exactly as before.
{
  // Placeholders kept: the builder preview labels an empty media slot so the
  // operator knows to fill it (see verify-funnel-assets 10b).
  const withBuilderPlaceholder = [
    "src/components/funnels/sections/benefits-grid-section.tsx",
    "src/components/funnels/sections/story-section.tsx",
    "src/components/funnels/sections/ticket-tiers-section.tsx",
  ];
  // No placeholder: these render nothing at all when their content is absent.
  const rendersNothingWhenEmpty = [
    "src/components/funnels/sections/agenda-section.tsx",
    "src/components/funnels/sections/problem-solution-section.tsx",
    "src/components/funnels/sections/callout-section.tsx",
    "src/components/funnels/sections/before-after-section.tsx",
  ];

  for (const f of [...withBuilderPlaceholder, ...rendersNothingWhenEmpty]) {
    const src = read(f);
    const name = f.split("/").pop();
    // The original law, unchanged: no unconditional disappearing act.
    check(`6. ${name} never bare-returns null (a populated stage cannot vanish)`, !/^\s*return null;\s*$/m.test(src));
    // Any early return it does make must be guarded by emptiness.
    const earlyReturns = src.match(/^\s*if \(.*\) return null;\s*$/gm) ?? [];
    const allGuardedByEmptiness = earlyReturns.every((l) =>
      /length === 0|!config\.|\.length < |=== 0/.test(l),
    );
    check(`6. ${name} only returns null on an explicit emptiness guard`, allGuardedByEmptiness,
      earlyReturns.join(" | ").trim().slice(0, 90));
  }
  for (const f of withBuilderPlaceholder) {
    const name = f.split("/").pop();
    check(`6. ${name} keeps its labeled builder placeholder (operator guidance)`, read(f).includes("MediaPlaceholder"));
  }
  for (const f of rendersNothingWhenEmpty) {
    const src = read(f);
    const name = f.split("/").pop();
    check(`6. ${name} renders nothing rather than a dead-zone placeholder panel`,
      !src.includes("MediaPlaceholder") && /return null;/.test(src));
  }
}

// 7. checkout-section.tsx has its own inline CTA fallback (doesn't route
//    through the shared CtaButton), so it needed the same href="#" fix
//    applied separately.
{
  const src = read("src/components/funnels/sections/checkout-section.tsx");
  check('7. checkout-section.tsx no longer has href={config.ctaHref || "#"}', !src.includes('href={config.ctaHref || "#"}'));
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
