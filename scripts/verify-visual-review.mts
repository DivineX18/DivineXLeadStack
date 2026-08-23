// Regression coverage for the Visual Review parser (the "second intelligence
// layer" that sees the page). Pure + deterministic — tests parseVisualReview
// and visualReviewNeedsAttention. The screenshot + vision call are best-effort
// wrappers over this.
//
// Run: npx tsx scripts/verify-visual-review.mts

const { parseVisualReview, visualReviewNeedsAttention, VISUAL_FLAGS } =
  await import("../src/lib/design-intelligence/visual-review-core");

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- 1. Parses a well-formed vision reply ---
{
  const r = parseVisualReview('{"visualScore": 42, "verdict": "Flat and templated.", "strengths": ["Clear headline"], "issues": ["No contrast", "CTA is grey"], "flags": ["bland_generic", "weak_contrast", "cta_not_prominent"]}');
  check("1a. parses score/verdict", r?.visualScore === 42 && r?.verdict === "Flat and templated.");
  check("1b. parses strengths + issues", r?.strengths.length === 1 && r?.issues.length === 2);
  check("1c. parses known flags", !!r && r.flags.includes("bland_generic") && r.flags.includes("weak_contrast"));
}

// --- 2. Tolerant of surrounding prose, clamps, filters, dedupes ---
{
  const r = parseVisualReview('Here is my review:\n```json\n{"visualScore": 250, "verdict": "x", "flags": ["strong", "strong", "made_up_flag", "poor hierarchy"]}\n```');
  check("2a. strips prose/fences + parses", r !== null);
  check("2b. clamps score to 100", r?.visualScore === 100);
  check("2c. drops unknown flags, keeps known", !!r && !r.flags.includes("made_up_flag" as never) && r.flags.includes("poor_hierarchy"));
  check("2d. dedupes flags", !!r && r.flags.filter((f) => f === "strong").length === 1);
}

// --- 3. Garbage → null ---
{
  check("3a. non-JSON returns null", parseVisualReview("sorry, I can't see the image") === null);
  check("3b. malformed JSON returns null", parseVisualReview("{ visualScore: }") === null);
}

// --- 4. needs-attention logic ---
{
  check("4a. a bland flag needs attention", visualReviewNeedsAttention({ visualScore: 90, verdict: "", strengths: [], issues: [], flags: ["bland_generic"] }));
  check("4b. a low score needs attention even if flagged strong", visualReviewNeedsAttention({ visualScore: 55, verdict: "", strengths: [], issues: [], flags: ["strong"] }));
  check("4c. strong + high score does NOT need attention", !visualReviewNeedsAttention({ visualScore: 88, verdict: "", strengths: [], issues: [], flags: ["strong"] }));
}

// --- 5. flag set is closed + non-empty ---
{
  check("5. VISUAL_FLAGS includes the key bland/contrast/cta flags", ["bland_generic", "looks_templated", "weak_contrast", "cta_not_prominent"].every((f) => (VISUAL_FLAGS as readonly string[]).includes(f)));
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
