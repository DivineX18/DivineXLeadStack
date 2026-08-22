// Regression coverage for the Funnel Copy Quality Engine (Conversion Engine,
// P1 — Milestone 4). Pure + deterministic. Verifies the evaluator scores good
// copy high and flags generic filler, invented stats, vague CTAs, and name-
// swap-generic headlines — while NOT flagging real pricing discounts or non-
// copy fields (URLs, colors, ids).
//
// Run: npx tsx scripts/verify-conversion-copy-quality.mts

const { evaluateFunnelCopy, hasFabricationRisk } = await import("../src/lib/conversion/copy-quality");

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- 1. A genuinely specific funnel scores clean ---
{
  const good = evaluateFunnelCopy([
    {
      type: "hero",
      config: {
        headline: "Book 10 Roofing Jobs a Month Without Door-Knocking",
        subheadline: "We install your done-for-you booking system in 14 days.",
        bullets: ["No cold outreach", "First booked jobs inside a week", "Only pay for jobs that show up"],
        ctaLabel: "Get my free roofing lead audit",
        mediaUrl: "https://example.com/video.mp4",
        accentColor: "#0891b2",
        formId: "form_abc123",
      },
    },
    { type: "offer", config: { headline: "The Roofing Lead System", description: "A 14-day install of your booking funnel plus text-and-call follow-up." } },
  ]);
  check("1a. Clean, specific copy has no issues", good.issues.length === 0, JSON.stringify(good.issues));
  check("1b. Clean copy scores 100", good.score === 100, String(good.score));
  check("1c. No weak sections on clean copy", good.weakSectionTypes.length === 0);
  // 8 copy fields (6 hero: headline/subheadline/3 bullets/ctaLabel + 2 offer),
  // with mediaUrl/accentColor/formId correctly skipped.
  check("1d. Non-copy fields (url/color/id) are skipped, real copy fields checked", good.fieldsChecked === 8, `checked ${good.fieldsChecked}`);
}

// --- 2. Generic / fabricated / vague copy is caught ---
{
  const bad = evaluateFunnelCopy([
    {
      type: "hero",
      config: {
        headline: "Grow Your Business",
        subheadline: "We revolutionize your results with our cutting-edge, world-class solution.",
        bullets: ["Seamless onboarding", "Unlock your potential", "10,000+ happy customers"],
        ctaLabel: "Submit",
      },
    },
    { type: "stats", config: { headline: "Trusted by 50,000+ businesses", text: "Rated 4.9 stars. 95% of our users see results." } },
  ]);
  const kinds = new Set(bad.issues.map((i) => i.kind));
  check("2a. Generic filler flagged", kinds.has("generic_filler"));
  check("2b. Possible fabrication flagged", kinds.has("possible_fabrication"));
  check("2c. Vague CTA flagged", kinds.has("vague_cta"));
  check("2d. Name-swap-generic headline flagged", kinds.has("name_swap_generic"));
  check("2e. Invented customer count is HIGH severity", bad.issues.some((i) => i.kind === "possible_fabrication" && i.severity === "high"));
  check("2f. hasFabricationRisk true for invented counts", hasFabricationRisk(bad));
  check("2g. Bad copy scores low", bad.score < 40, String(bad.score));
  check("2h. Both sections flagged as weak", bad.weakSectionTypes.includes("hero") && bad.weakSectionTypes.includes("stats"));
}

// --- 3. Real pricing discounts are NOT mistaken for fabricated stats ---
{
  const pricing = evaluateFunnelCopy([{ type: "offer", config: { headline: "Save 50% Off Your First Month" } }]);
  check("3. '50% off' pricing is not flagged as fabrication", !pricing.issues.some((i) => i.kind === "possible_fabrication"), JSON.stringify(pricing.issues));
}

// --- 4. A section of only non-copy fields produces nothing ---
{
  const meta = evaluateFunnelCopy([{ type: "hero", config: { mediaUrl: "https://x.com/a.mp4", accentColor: "#ff0000", formId: "form_x", layout: "centered", cta: { style: "popup_form" } } }]);
  check("4. Non-copy-only section yields no issues", meta.issues.length === 0, JSON.stringify(meta.issues));
}

// --- 5. A good CTA (states the outcome) is not flagged ---
{
  const cta = evaluateFunnelCopy([{ type: "hero", config: { ctaLabel: "Get my free quote" } }]);
  check("5. Outcome-stating CTA is clean", cta.issues.length === 0);
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
