/**
 * QA BUG-011 — "Testimonials/Reviews management is missing; integrity check
 * leaves a build permanently stuck in needs_review with no actionable fix,
 * and the diagnostic text is garbled raw HTML."
 *
 * Two genuinely different builder surfaces carry "testimonials":
 *   1. The Funnel Builder's `testimonials` SECTION TYPE already had full
 *      add/edit/remove (ListEditor) + generic add/remove-section controls —
 *      confirmed by reading funnel-builder.tsx before touching anything.
 *      Nothing to fix there; this script doesn't re-assert pre-existing
 *      behavior that was never broken.
 *   2. The gitpage WEBSITE BUILDER (a distinct, third-party-generated
 *      product) is the one that was actually stuck: gitpage's own
 *      generate-site payload has no testimonials field at all (confirmed
 *      against the full schema in lib/gitpage/client.ts), so when its
 *      generic template invents fake quotes, content-audit.ts flags it but
 *      there was never a way to supply real ones or remove the section
 *      short of hand-editing raw HTML in gitpage's own dashboard.
 *
 * This script verifies category 2's three pieces: the garbled-excerpt fix,
 * the storage + UI for real testimonials, and the MCP-driven remediation
 * path (apply real quotes, or remove the section) that re-runs the same
 * publish-integrity check every build settles through.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-testimonials-remediation.mts
 */
import { readFileSync } from "node:fs";
import { auditGeneratedContent } from "../src/lib/website/content-audit";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── 1. The garbled-diagnostic bug is actually fixed, behaviorally ─────────
{
  // A realistic reproduction: the testimonials pattern matches INSIDE an
  // HTML tag's attribute (id="testimonials"), and the fixed 40-char lookback
  // lands mid-ATTRIBUTE of the PRECEDING tag — exactly the shape that leaked
  // "<div clas" style fragments before the fix.
  const html =
    `<html><body><div class="wrap-outer-x"><section id="testimonials"><div class="card">` +
    `<p>"Great service, highly recommend" - John D.</p></div></section></div></body></html>`;
  const flags = auditGeneratedContent(html);
  const testimonialFlag = flags.find((f) => f.category === "fabricated_testimonials");
  check("1a. the pattern still matches (sanity check on the fixture itself)", !!testimonialFlag);
  check(
    "1b. the excerpt contains no unbalanced tag delimiter (no bare < or > leaking through)",
    !!testimonialFlag && !/[<>]/.test(testimonialFlag.excerpt),
  );
  check(
    "1c. MUTATION: a version that only stripped COMPLETE tags (the old behavior) would be caught by 1b",
    (() => {
      const start = Math.max(0, html.indexOf("testimonials") - 40 - 10 /* to land mid-tag like the old code */);
      const naive = html.slice(start, html.indexOf("testimonials") + 120).replace(/<[^>]+>/g, " ");
      return /[<>]/.test(naive); // the OLD approach does leak on this fixture
    })(),
  );
}

// ── 2. Storage: a real, operator-owned testimonials field exists ─────────
{
  const types = read("src/types/website.ts");
  check("2a. WebsiteDoc carries a testimonials field", /testimonials\?:\s*WebsiteTestimonial\[\]/.test(types));
  check(
    "2b. it is NOT folded into WebsiteConfig (which the file's own header says mirrors gitpage's typeform verbatim — gitpage has no such input)",
    (() => {
      const start = types.indexOf("export interface WebsiteConfig {");
      const end = types.indexOf("\n}", start);
      return !types.slice(start, end).includes("testimonials");
    })(),
  );
}

// ── 3. The fix route exists and is properly gated / scoped ────────────────
{
  const service = read("src/lib/server/websites-service.ts");
  const fixRoute = read("src/app/api/sub-accounts/[id]/website/[siteId]/fix-content/route.ts");
  const testimonialsRoute = read("src/app/api/sub-accounts/[id]/website/[siteId]/testimonials/route.ts");

  check("3a. saveWebsiteTestimonials validates before writing (bounded length, required quote+name)", /testimonials\.length > 10/.test(service) && /!quote \|\| !name/.test(service));
  check("3b. applyTestimonialsFixForSubAccount enforces the agency website gate", /applyTestimonialsFixForSubAccount[\s\S]{0,200}requireWebsiteEnabledSub/.test(service));
  check(
    "3c. the fix is refused unless the site is ACTUALLY flagged for fabricated_testimonials (can't be used to silently edit an unrelated site)",
    /doc\.status !== "needs_review" \|\| !flagged \|\| !doc\.gitpageJobId/.test(service),
  );
  check(
    "3d. 'apply' with zero saved testimonials is refused rather than publishing an empty section",
    /action === "apply" && testimonials\.length === 0/.test(service),
  );
  check(
    "3e. after the MCP edit, the SAME publish-integrity function every build uses re-certifies the result (no second, drifted 'is this clean' check)",
    /assessPublishedSite\(fixed\.liveUrl/.test(service),
  );
  check("3f. the fix-content route requires admin", /requireSubAccountAdmin/.test(fixRoute));
  check("3g. the testimonials PATCH route requires admin", /requireSubAccountAdmin/.test(testimonialsRoute));
}

// ── 4. The MCP client follows the documented tool sequence ────────────────
{
  const mcp = read("src/lib/gitpage/mcp-client.ts");
  const fix = read("src/lib/website/content-fix.ts");
  check("4a. implements every documented tool", ["list_sites", "read_site_file", "edit_site_file", "validate_draft", "publish_draft"].every((t) => mcp.includes(`"${t}"`)));
  check(
    "4b. the orchestration calls them in the documented order: read -> edit -> validate -> publish",
    (() => {
      const order = ["readSiteFile(", "editSiteFile(", "validateDraft(", "publishDraft("];
      let last = -1;
      for (const call of order) {
        const idx = fix.indexOf(call);
        if (idx === -1 || idx < last) return false;
        last = idx;
      }
      return true;
    })(),
  );
  check(
    "4c. a validation failure blocks publish (never publishes an invalid draft)",
    /if \(!validation\.valid\)[\s\S]{0,100}throw/.test(fix),
  );
  check(
    "4d. user-supplied testimonial text is HTML-escaped before being spliced into live markup (XSS safety on a real publish path)",
    /escapeHtml/.test(fix) && /&amp;/.test(fix) && /&lt;/.test(fix),
  );
  check(
    "4e. MUTATION: removing escapeHtml from the render call would be caught — i.e. it's actually applied to quote/name/detail, not just defined",
    /escapeHtml\(t\.quote/.test(fix) && /escapeHtml\(t\.name/.test(fix),
  );
  check(
    "4f. a low-confidence section locate refuses rather than guessing on a live published page",
    /locateTestimonialsSection\(html\)[\s\S]{0,60}if \(!bounds\)/.test(fix) || /if \(!bounds\)/.test(fix),
  );
}

// ── 5. The UI actually offers add/edit/remove + the two remediation actions ─
{
  const builder = read("src/components/website/website-builder.tsx");
  check("5a. a persistent testimonials editor exists, independent of any flag", /Testimonials \(optional\)/.test(builder));
  check("5b. add/update/remove handlers exist", /function addTestimonial\(/.test(builder) && /function updateTestimonial\(/.test(builder) && /function removeTestimonial\(/.test(builder));
  check("5c. both remediation actions are wired to real buttons", /applyTestimonialsFix\("apply"\)/.test(builder) && /applyTestimonialsFix\("remove"\)/.test(builder));
  check(
    "5d. applying persists the current testimonials first (can't apply a stale/empty saved list)",
    /action === "apply" && !\(await putTestimonials\(\)\)/.test(builder),
  );
  check("5e. the remediation block only renders when this specific category is flagged", /contentFlags\?\.some\(\(f\) => f\.category === "fabricated_testimonials"\)/.test(builder));
}

console.log(
  failures === 0
    ? `\nverify-testimonials-remediation: all checks passed`
    : `\nverify-testimonials-remediation: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
