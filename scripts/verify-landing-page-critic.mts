/**
 * LANDING PAGE CRITIC — P0.5.
 *
 * TWO certifications, because they prove different things:
 *
 *  A. ORCHESTRATION (deterministic). A negative verdict actually affects
 *     readiness; corrections route back through the composition authority;
 *     the corrected artifact is re-evaluated; the loop is bounded; a page
 *     that still fails is NOT marked ready.
 *
 *  B. REAL JUDGMENT (a live model call). The actual Critic can recognise a
 *     deliberately poor composition. A mocked verdict can certify wiring but
 *     says nothing about whether the Critic works.
 *
 * Subjective judgment is deliberately NOT made deterministic. B asserts that
 * the Critic reacts differently to a bad page than a sound one — not that it
 * returns one exact string.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-landing-page-critic.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { computeReadiness, critiqueComposition, describeComposition, MAX_CORRECTION_ROUNDS } =
  await import("../src/lib/funnels/landing-page-critic.ts");
import type { FunnelSection } from "../src/types/funnels.ts";

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const sec = (type: string, config: Record<string, unknown> = {}): FunnelSection =>
  ({ id: `s_${type}`, type, config } as unknown as FunnelSection);

// ══ A. ORCHESTRATION — deterministic ═════════════════════════════════════
const noReq = { visualRequirements: [] };

check("A1. Unreviewed page is NOT ready (absent verdict != passing)",
  !computeReadiness({ funnel: noReq, verdict: null }).ready);

const blocking = { verdict: "needs_correction" as const, round: 0, evaluatedAt: "", model: "m",
  findings: [{ severity: "blocking" as const, sectionType: "hero", category: "visual_hierarchy" as const, correction: "The hero has no focal point." }] };
const r1 = computeReadiness({ funnel: noReq, verdict: blocking });
check("A2. A blocking verdict prevents Ready for review", !r1.ready, r1.reasons.join(" | ").slice(0, 60));
check("A3. The blocking reason is surfaced, not swallowed", r1.reasons.some((x) => x.includes("focal point")));

const ready = { verdict: "ready" as const, round: 1, evaluatedAt: "", model: "m", findings: [] };
check("A4. A clean verdict yields Ready for review", computeReadiness({ funnel: noReq, verdict: ready }).ready);

// A `required` requirement blocks; a `recommended` one never does.
const required = { visualRequirements: [{ id: "gallery:gallery", role: "gallery", sectionType: "photo_gallery", brief: "Photos of completed work", necessity: "required" as const }] };
check("A5. An unresolved REQUIRED requirement blocks readiness",
  !computeReadiness({ funnel: required, verdict: ready }).ready);
const recommended = { visualRequirements: [{ id: "hero:hero", role: "hero", sectionType: "hero", brief: "A wide photo of the team at work", necessity: "recommended" as const }] };
const rec = computeReadiness({ funnel: recommended, verdict: ready });
check("A6. A RECOMMENDED opportunity coexists with Ready for review", rec.ready, rec.reasons.join(" | "));

// Deterministic guards feed the same readiness decision.
check("A7. Deterministic guard failures block readiness",
  !computeReadiness({ funnel: noReq, verdict: ready, deterministicFailures: ["Duplicate image placed twice"] }).ready);

// Bounded loop: after the allowed rounds a non-blocking finding is preserved
// but does not falsely hold the page, and never silently becomes "ready".
const exhausted = { verdict: "needs_correction" as const, round: MAX_CORRECTION_ROUNDS, evaluatedAt: "", model: "m",
  findings: [{ severity: "minor" as const, sectionType: "faq", category: "density" as const, correction: "Tighten spacing." }] };
const ex = computeReadiness({ funnel: noReq, verdict: exhausted });
check("A8. Correction loop is bounded", MAX_CORRECTION_ROUNDS >= 1 && MAX_CORRECTION_ROUNDS <= 2, `max=${MAX_CORRECTION_ROUNDS}`);
check("A9. After the bounded rounds a minor finding does not falsely block", ex.ready);
const stillBlocking = { ...blocking, round: MAX_CORRECTION_ROUNDS };
check("A10. A page still failing after correction is NOT marked ready",
  !computeReadiness({ funnel: noReq, verdict: stillBlocking }).ready);

// The composition description is what the Critic judges — it must describe
// the COMPOSED page, not the generation inputs.
const desc = describeComposition([
  sec("hero", { headline: "A Clear Offer", mediaUrl: "x" }),
  sec("photo_gallery", { images: [{ url: "a" }, { url: "b" }] }),
]);
check("A11. Critic input describes the composed artifact", desc.includes("hero") && desc.includes("2 gallery images"), desc.replace(/\n/g, " | "));

// ══ B. REAL JUDGMENT — a live model call ═════════════════════════════════
// Deliberately poor: every image clustered into one gallery, nothing
// elsewhere, no hero focus. This is the Apostille shape.
const badPage: FunnelSection[] = [
  sec("hero", { headline: "Welcome" }),
  sec("photo_gallery", { images: [{ url: "1" }, { url: "2" }, { url: "3" }, { url: "4" }, { url: "5" }, { url: "6" }] }),
  sec("problem_solution", {}), sec("benefits_grid", { items: [{}, {}, {}] }),
  sec("offer", {}), sec("faq", {}), sec("cta_banner", {}),
];
const soundPage: FunnelSection[] = [
  sec("hero", { headline: "Bring Reading With A Rapper To Your Campus", mediaUrl: "hero.jpg" }),
  sec("proof_strip", { logos: [{ url: "a" }, { url: "b" }] }),
  sec("problem_solution", {
    problemHeadline: "Assemblies feel like a lecture", problemText: "Kids tune out the moment it feels like school.",
    solutionHeadline: "A show that actually lands", solutionText: "A rapper performs original songs built around the reading curriculum.",
  }),
  sec("benefits_grid", { items: [{ title: "Live performance", imageUrl: "b1" }, { title: "Curriculum tie-in", imageUrl: "b2" }, { title: "Free study guide" }] }),
  sec("story", { photoUrl: "founder.jpg", paragraphs: ["I started this after watching a gym full of kids go silent for a story, not a lecture."] }),
  sec("offer", { headline: "Book the assembly", bullets: ["45-minute live show", "Free study guide", "Fits any gym or auditorium"], ctaLabel: "Check dates" }),
  sec("faq", { items: [{ question: "How long is the show?", answer: "About 45 minutes, built for a full assembly period." }] }),
  sec("cta_banner", { headline: "Ready to book?", ctaLabel: "Check dates" }),
];

let badVerdict = null, soundVerdict = null;
try {
  badVerdict = await critiqueComposition(badPage);
  soundVerdict = await critiqueComposition(soundPage);
} catch (err) {
  console.log(`\nCRITIC UNAVAILABLE: ${err instanceof Error ? err.message : err}`);
  console.log("Cannot certify real judgment without a live model. Reporting as FAILURE rather than assuming.");
  bad++;
}

if (badVerdict && soundVerdict) {
  console.log(`\n  (bad page verdict: ${badVerdict.verdict}, ${badVerdict.findings.length} findings via ${badVerdict.model})`);
  console.log(`  (sound page verdict: ${soundVerdict.verdict}, ${soundVerdict.findings.length} findings)`);
  check("B1. REAL CRITIC: a deliberately poor composition is criticised",
    badVerdict.findings.length > 0 || badVerdict.verdict === "needs_correction",
    badVerdict.findings.map((f) => `${f.sectionType}/${f.category}`).join(", "));
  check("B2. REAL CRITIC: it discriminates — the bad page draws more criticism than the sound one",
    badVerdict.findings.length > soundVerdict.findings.length ||
      (badVerdict.verdict === "needs_correction" && soundVerdict.verdict === "ready"),
    `bad=${badVerdict.findings.length}/${badVerdict.verdict} sound=${soundVerdict.findings.length}/${soundVerdict.verdict}`);
  check("B3. Findings are structured and actionable, not prose",
    badVerdict.findings.every((f) => f.sectionType && f.category && f.correction.length > 5));
  check("B4. No internal reasoning is persisted",
    !JSON.stringify(badVerdict).toLowerCase().includes("thinking") &&
      Object.keys(badVerdict).every((k) => ["verdict", "findings", "evaluatedAt", "model", "round"].includes(k)),
    Object.keys(badVerdict).join(","));
}

console.log(`\n${bad === 0 ? "LANDING PAGE CRITIC CERTIFIED (orchestration + real judgment)" : `${bad} CHECK(S) FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
