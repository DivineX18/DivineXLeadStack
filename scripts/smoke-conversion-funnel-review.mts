// M6b smoke test — proves the just-built-funnel → copy-review path works on
// the real FunnelSection shape ({ id, type, config }). Exercises the exact
// mapping reviewFunnelCopy() uses (funnel.sections → evaluateFunnelCopy),
// deterministically, without Firestore. Confirms a funnel with fabricated /
// generic copy is flagged (and would carry the ⚠️ into create_funnel's reply),
// while a clean funnel passes.
//
// Run: npx tsx scripts/smoke-conversion-funnel-review.mts

const { evaluateFunnelCopy, hasFabricationRisk } = await import("../src/lib/conversion/copy-quality");

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// A just-generated funnel's sections, exactly as they sit on the FunnelDoc.
const flaggedFunnelSections = [
  { id: "s1", type: "hero", config: { headline: "Grow Your Business", subheadline: "We revolutionize your results with our world-class, cutting-edge solution.", bullets: ["10,000+ happy customers", "Seamless setup"], ctaLabel: "Submit", accentColor: "#7c3aed", formId: "form_x" } },
  { id: "s2", type: "offer", config: { headline: "The Roofing Lead System", description: "A 14-day install of your booking funnel and follow-up." } },
];
const cleanFunnelSections = [
  { id: "s1", type: "hero", config: { headline: "Book 10 Roofing Jobs a Month Without Door-Knocking", subheadline: "We install your booking system in 14 days.", bullets: ["No cold outreach", "Only pay for jobs that show up"], ctaLabel: "Get my free roofing lead audit", mediaUrl: "https://x.com/v.mp4" } },
];

const mapSections = (secs: typeof flaggedFunnelSections) =>
  secs.map((s) => ({ type: s.type, config: s.config as unknown as Record<string, unknown> }));

// --- flagged funnel ---
{
  const report = evaluateFunnelCopy(mapSections(flaggedFunnelSections));
  check("1a. Flagged funnel scores below 100", report.score < 100, String(report.score));
  check("1b. Fabrication risk raised (would trigger the ⚠️ in create_funnel's reply)", hasFabricationRisk(report));
  check("1c. The hero (bad copy) is a weak section", report.weakSectionTypes.includes("hero"));
  check("1d. The clean offer section is NOT weak", !report.weakSectionTypes.includes("offer"));
  const kinds = new Set(report.issues.map((i) => i.kind));
  check("1e. Flags generic filler + fabrication + vague CTA + name-swap headline", kinds.has("generic_filler") && kinds.has("possible_fabrication") && kinds.has("vague_cta") && kinds.has("name_swap_generic"));
}

// --- clean funnel stays quiet ---
{
  const report = evaluateFunnelCopy(mapSections(cleanFunnelSections));
  check("2a. Clean funnel scores 100", report.score === 100, String(report.score));
  check("2b. No fabrication risk", !hasFabricationRisk(report));
  check("2c. No issues → no COPY REVIEW block shown to the operator", report.issues.length === 0);
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
