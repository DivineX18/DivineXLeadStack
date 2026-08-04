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
  check(
    "3b. Primary-button fallback renders a real <a> only when href is truthy, else an inert <button>",
    /if \(href\) \{[\s\S]{0,120}<a href=\{href\}/.test(src) && /<button type="button" className=\{btnClass\} style=\{buttonStyle\}>\s*\{label\}/.test(src),
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
//    before_after/results). Each must now show a visible placeholder
//    instead of `return null`.
{
  const files = [
    "src/components/funnels/sections/agenda-section.tsx",
    "src/components/funnels/sections/benefits-grid-section.tsx",
    "src/components/funnels/sections/problem-solution-section.tsx",
    "src/components/funnels/sections/story-section.tsx",
    "src/components/funnels/sections/ticket-tiers-section.tsx",
    "src/components/funnels/sections/callout-section.tsx",
    "src/components/funnels/sections/before-after-section.tsx",
  ];
  for (const f of files) {
    const src = read(f);
    const name = f.split("/").pop();
    check(`6. ${name} imports MediaPlaceholder and never bare-returns null for an empty required stage`, src.includes("MediaPlaceholder") && !/^\s*return null;\s*$/m.test(src));
  }
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
