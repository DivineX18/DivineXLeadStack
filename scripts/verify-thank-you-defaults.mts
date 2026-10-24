/**
 * QA BUG-008 — attaching a lead magnet left the Thank-you page's
 * Headline/Message/SEO title/SEO description fields on generic grey
 * placeholder text; the operator had to write all four from scratch even
 * though the file they just named (and the funnel's own name) already say
 * what this is. No separate "structured lead magnet" title/topic/offer
 * record exists anywhere in this codebase (confirmed by grep) — the
 * filename + funnel name are the real, honest signal, so this reuses THOSE
 * rather than re-parsing the PDF's contents or inventing a new metadata
 * extraction pipeline.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-thank-you-defaults.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const builder = readFileSync(new URL("../src/components/funnels/funnel-builder.tsx", import.meta.url), "utf8");

check("1a. a filename humanizer exists", /function humanizeAssetFilename\(/.test(builder));
check("1b. it's reused rather than a second parser being added for this", (builder.match(/humanizeAssetFilename\(/g) ?? []).length >= 2);

const uploadBlock = builder.slice(
  builder.indexOf('if (json.kind === "pdf" || json.kind === "audio")'),
  builder.indexOf("} else {", builder.indexOf('if (json.kind === "pdf" || json.kind === "audio")')),
);
check("2a. headline is only filled when currently blank, never overwriting operator-typed copy", /!bridgeHeadline\.trim\(\)/.test(uploadBlock));
check("2b. message is only filled when currently blank", /!bridgeMessage\.trim\(\)/.test(uploadBlock));
check("2c. SEO title is only filled when currently blank", /!seoTitle\.trim\(\)/.test(uploadBlock));
check("2d. SEO description is only filled when currently blank", /!seoDescription\.trim\(\)/.test(uploadBlock));
check("2e. the funnel's own name is incorporated into the SEO default, not just the filename", /seoBase/.test(uploadBlock) && /name\.trim\(\)/.test(uploadBlock));
check("2f. the operator is told defaults were filled in and are editable, not silently changed underneath them", /Filled in the thank-you page copy/.test(uploadBlock));
check("2g. nothing here is auto-SAVED — it only sets local form state, Save remains the operator's own explicit act", !/fetch\(/.test(uploadBlock));

// MUTATION check: a version that filled fields unconditionally (dropping the
// blank-guard) would stomp a deliberately-blank or operator-written field.
check(
  "3a. MUTATION: removing the blank-guards would be caught — i.e. the guards gate the actual setState calls, not just sit nearby",
  /if \(!bridgeHeadline\.trim\(\)\) \{\s*setBridgeHeadline/.test(uploadBlock),
);

console.log(failures === 0 ? `\nverify-thank-you-defaults: all checks passed` : `\nverify-thank-you-defaults: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
