/**
 * QA BUG-001 — Home's only first-run guidance was one line of plain text
 * naming Intelligence alone, with no actual link and no mention of
 * Create/Leads/Zeno. Verifies the fix reuses the EXISTING top-level nav
 * destinations (build-shell-navigation.ts's real lifecycle sections) rather
 * than inventing new routes or a second nav/wizard.
 *
 * RETEST FAIL (Bitrupt, 2026-10-28): the first fix only rendered these
 * links in the empty-recommendation branch, so any account with an active
 * CRO Audit recommendation (nearly any account that's done anything) never
 * saw them — "no onboarding guide" persisted on retest. Re-verified here:
 * the links must render UNCONDITIONALLY, every visit, regardless of
 * whether a recommendation exists.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-home-quick-start.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const card = read("src/components/ascend/recommendation-card.tsx");
const nav = read("src/lib/shell/build-shell-navigation.ts");

check("1a. the quick-start links are real hrefs, not a prose-only hint", /href: "\/zeno"/.test(card) && /href: "\/intelligence"/.test(card) && /href: "\/create"/.test(card) && /href: "\/leads"/.test(card));
check(
  "1b. /create and /leads are the SAME real top-level sections the shell nav already defines — not invented routes",
  /create: \{/.test(nav) && /leads: \{/.test(nav),
);
check("1c. covers all four required pillars from the bug report (Zeno, business-intelligence, Create[websites/funnels/assets], CRM/contacts)", QUICK_START_COUNT(card) === 4);
check(
  "1d. renders UNCONDITIONALLY, not gated behind the empty-recommendation branch (the actual retest-FAIL cause)",
  /<div className="space-y-3">\s*\{action \? \(/.test(card) && /<QuickStartLinks \/>/.test(card) && !/\) : \(\s*<div className="space-y-3">\s*<p[\s\S]*?<QuickStartLinks/.test(card),
);
check(
  "1e. the recommendation row (when one exists) is NOT wrapped inside the old if/else that hid the links",
  /\{action \? \(\s*<RecommendationRow rec=\{action\} \/>\s*\) : \(/.test(card),
);

function QUICK_START_COUNT(src: string): number {
  const m = src.match(/QUICK_START_LINKS[\s\S]*?=\s*\[([\s\S]*?)\];/);
  if (!m) return -1;
  return (m[1].match(/href:/g) ?? []).length;
}

console.log(failures === 0 ? `\nverify-home-quick-start: all checks passed` : `\nverify-home-quick-start: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
