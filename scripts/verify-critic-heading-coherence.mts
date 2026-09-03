/**
 * LANDING PAGE CRITIC — heading ↔ content coherence (adversarial).
 *
 * Reproduces the EXACT failure human acceptance found: "Everything you'll
 * learn" over an enrollment process. The Critic must detect it with the real
 * model, and the Director must apply an honest replacement heading.
 *
 * NON-VACUOUS: a coherent control page is judged too, so a Critic that
 * flagged everything would fail rather than pass.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-critic-heading-coherence.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { critiqueComposition, describeComposition } = await import("../src/lib/funnels/landing-page-critic.ts");
const { applyCriticCorrections } = await import("../src/lib/funnels/critic-correction.ts");
import type { FunnelSection } from "../src/types/funnels";

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

// The observed defect, verbatim.
const mismatch = (): FunnelSection[] => ([
  { id: "s1", type: "hero", config: { headline: "Mindful Wealth Mastery" } },
  { id: "s2", type: "benefits_grid", config: {
    headline: "Everything you'll learn",
    items: [
      { label: "Apply", body: "Short application so we understand where you are" },
      { label: "Free strategy call", body: "We review your situation, no pressure" },
      { label: "Roadmap & kickoff", body: "We map your personalised growth roadmap" },
      { label: "Build & coach", body: "Weekly 1:1 coaching, systems built with you" },
    ],
  } },
] as unknown as FunnelSection[]);

// A coherent control — the same shape, honestly labelled.
const coherent = (): FunnelSection[] => ([
  { id: "s1", type: "hero", config: { headline: "Mindful Wealth Mastery" } },
  { id: "s2", type: "benefits_grid", config: {
    headline: "How it works",
    items: [
      { label: "Apply", body: "Short application so we understand where you are" },
      { label: "Free strategy call", body: "We review your situation, no pressure" },
      { label: "Roadmap & kickoff", body: "We map your personalised growth roadmap" },
      { label: "Build & coach", body: "Weekly 1:1 coaching, systems built with you" },
    ],
  } },
] as unknown as FunnelSection[]);

// ── 0. The Critic can SEE the content it must judge ──────────────────────
console.log("0. The Critic's input carries the item labels");
const desc = describeComposition(mismatch());
check("0a. item labels reach the Critic", /Apply/.test(desc) && /Free strategy call/.test(desc), desc.split("\n")[1]?.slice(0, 110));
check("0b. the heading reaches the Critic alongside them", /Everything you'll learn/.test(desc));
// Before this change the description carried only "4 items" — the Critic was
// structurally unable to detect the mismatch, so a category alone would have
// been a decoration.
check("0c. it is not merely a count", !/4 items, 0 with images/.test(desc));

// ── 1. The real model detects the observed failure ───────────────────────
console.log("\n1. Detection (real model)");
const v = await critiqueComposition(mismatch(), 0);
const hit = v.findings.find((f) => f.category === "heading_content_mismatch");
console.log(`   findings: ${JSON.stringify(v.findings.map((f) => `${f.category}:${f.sectionType}`))}`);
check("1a. the heading/content mismatch is detected", !!hit, hit?.correction);
check("1b. it is attributed to the right section", hit?.sectionType === "benefits_grid", hit?.sectionType);
check("1c. the Critic supplies an honest replacement heading",
  !!hit?.replacementHeading && !/you'll learn/i.test(hit.replacementHeading), hit?.replacementHeading);

// ── 2. The Director applies it — real correction, not a note ─────────────
console.log("\n2. Correction");
if (hit?.replacementHeading) {
  const out = applyCriticCorrections(mismatch(), [hit]);
  const fixed = out.sections.find((s) => s.type === "benefits_grid")!.config as { headline: string };
  check("2a. the heading is actually replaced", fixed.headline === hit.replacementHeading, fixed.headline);
  check("2b. the correction is counted", out.appliedCount === 1);
  check("2c. the content beneath is untouched",
    ((out.sections.find((s) => s.type === "benefits_grid")!.config as { items: unknown[] }).items).length === 4);
  check("2d. unrelated sections are not rewritten",
    (out.sections.find((s) => s.type === "hero")!.config as { headline: string }).headline === "Mindful Wealth Mastery");
} else {
  check("2. correction executed", false, "no replacement heading was supplied");
}

// ── 3. NON-VACUOUS: a coherent page is not flagged ───────────────────────
console.log("\n3. Control — a coherent page");
const cv = await critiqueComposition(coherent(), 0);
const falsePositive = cv.findings.find((f) => f.category === "heading_content_mismatch");
check("3a. an honest heading is NOT flagged as a mismatch", !falsePositive,
  falsePositive ? `${falsePositive.sectionType}: ${falsePositive.correction}` : "");

console.log(bad ? `\n${bad} FAILED` : "\nCRITIC HEADING COHERENCE CERTIFIED");
process.exit(bad ? 1 : 0);
