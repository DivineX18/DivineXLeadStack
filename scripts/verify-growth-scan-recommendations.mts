/**
 * A GROWTH SCAN IS SUFFICIENT ON ITS OWN.
 *
 * The defect this closes: Unified could render a Growth Score and name the
 * primary constraint, then tell the customer "run a CRO Audit to generate
 * some" under Recommendations. The entry point stopped one step short of the
 * question the product exists to answer.
 *
 * Pure module, so this runs with no network and no Firestore. What it
 * certifies is the two properties that make derived advice trustworthy:
 *
 *   PRIORITISED — the scan's own ranking survives, rather than every red
 *   category being treated as equivalent.
 *   HONEST — nothing is emitted that the scan did not actually say.
 */
const { recommendationsFromGrowthScan } = await import("../src/lib/intelligence/growth-scan-recommendations.ts");

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const scan = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1, createdAt: "2026-09-05T00:00:00.000Z", overallScore: 76, scoreLabel: "Growing",
  biggestBottleneck: "Buyer Experience", recommendedFunnelType: "Lead Magnet", shareToken: "t",
  categoryScores: [], topOpportunities: [], ...over,
}) as never;

const cat = (o: Record<string, unknown>) => ({ key: "k", label: "L", score: 40, finding: "", tier: "red", ...o });

// ─────────────────────────────────────────────────────── honesty guard
check("no scan yields no recommendations", recommendationsFromGrowthScan(null).length === 0);
check("a scan with no categories yields none", recommendationsFromGrowthScan(scan()).length === 0);

const noFix = recommendationsFromGrowthScan(scan({
  categoryScores: [cat({ key: "offer", label: "Offer", tier: "red", score: 20, finding: "" })],
}));
check("a bad score with nothing to act on is NOT padded into advice", noFix.length === 0,
  JSON.stringify(noFix));

const findingOnly = recommendationsFromGrowthScan(scan({
  categoryScores: [cat({ key: "offer", label: "Offer", finding: "The offer never states a price." })],
}));
check("a real finding alone is enough to advise on", findingOnly.length === 1, findingOnly[0]?.fix);
check("...and it is not duplicated into the context field", findingOnly[0]?.fixContext === "");

// ───────────────────────────────────────────────── content is lifted, not made
const rich = recommendationsFromGrowthScan(scan({
  categoryScores: [cat({
    key: "capture", label: "Lead Capture", tier: "red", score: 22,
    finding: "There is no form above the fold.",
    quickWin: "Put a two-field form in the hero.",
    fullFix: "Rebuild the hero around a single capture action.",
  })],
}));
check("the quick win is what the customer is told to do", rich[0]?.fix === "Put a two-field form in the hero.");
check("the finding becomes the supporting evidence", rich[0]?.fixContext === "There is no form above the fold.");
check("a red category reads as high impact", rich[0]?.impact === "High");
check("a quick win reads as low effort", rich[0]?.difficulty === "Low");
check("the category is carried through, not invented", rich[0]?.categoryKey === "capture" && rich[0]?.categoryLabel === "Lead Capture");
check("provenance says growth_scan", rich[0]?.source === "growth_scan");
check("no Zeno handoff is fabricated for a scan", rich[0]?.fixWithZeno === null);

const fullFixOnly = recommendationsFromGrowthScan(scan({
  categoryScores: [cat({ key: "x", label: "X", fullFix: "Rebuild the page.", finding: "f" })],
}));
check("without a quick win, the full fix is used and reads as real work",
  fullFixOnly[0]?.fix === "Rebuild the page." && fullFixOnly[0]?.difficulty === "Medium");

// ─────────────────────────────────────────────────────────── prioritisation
const ranked = recommendationsFromGrowthScan(scan({
  categoryScores: [
    cat({ key: "trust", label: "Trust", tier: "red", score: 10, quickWin: "Add testimonials." }),
    cat({ key: "capture", label: "Lead Capture", tier: "red", score: 30, quickWin: "Add a form." }),
    cat({ key: "speed", label: "Page Speed", tier: "yellow", score: 60, quickWin: "Compress images." }),
  ],
  // The scan's OWN ranking puts capture first, ahead of a worse-scoring red.
  topOpportunities: [
    "Fix Lead Capture — visitors have no way to leave their details",
    "Improve Page Speed so the page loads before they leave",
  ],
}));
check("the scan's own ranking wins over raw score order",
  ranked[0]?.categoryKey === "capture", ranked.map((r) => r.categoryKey).join(" > "));
check("a ranked yellow outranks an unranked red — the scan knows best",
  ranked[1]?.categoryKey === "speed", ranked.map((r) => r.categoryKey).join(" > "));
check("unranked categories still appear, at the end", ranked[2]?.categoryKey === "trust");
check("every ranked category is present exactly once",
  new Set(ranked.map((r) => r.categoryKey)).size === ranked.length && ranked.length === 3);

// Deterministic fallback when the scan ranked nothing.
const unranked = recommendationsFromGrowthScan(scan({
  categoryScores: [
    cat({ key: "a", label: "A", tier: "yellow", score: 55, quickWin: "a" }),
    cat({ key: "b", label: "B", tier: "red", score: 40, quickWin: "b" }),
    cat({ key: "c", label: "C", tier: "red", score: 15, quickWin: "c" }),
  ],
}));
check("with no ranking, worst tier then worst score, deterministically",
  unranked.map((r) => r.categoryKey).join("") === "cba", unranked.map((r) => r.categoryKey).join(""));
check("the same input always produces the same order",
  JSON.stringify(recommendationsFromGrowthScan(scan({
    categoryScores: [
      cat({ key: "a", label: "A", tier: "yellow", score: 55, quickWin: "a" }),
      cat({ key: "b", label: "B", tier: "red", score: 40, quickWin: "b" }),
      cat({ key: "c", label: "C", tier: "red", score: 15, quickWin: "c" }),
    ],
  }))) === JSON.stringify(unranked));

// An opportunity that matches nothing must not silently reorder anything.
const noisy = recommendationsFromGrowthScan(scan({
  categoryScores: [
    cat({ key: "a", label: "Alpha", tier: "red", score: 10, quickWin: "a" }),
    cat({ key: "b", label: "Beta", tier: "red", score: 20, quickWin: "b" }),
  ],
  topOpportunities: ["Something entirely unrelated to any category here"],
}));
check("an unmatchable opportunity does not scramble the order",
  noisy.map((r) => r.categoryKey).join("") === "ab", noisy.map((r) => r.categoryKey).join(""));

console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
