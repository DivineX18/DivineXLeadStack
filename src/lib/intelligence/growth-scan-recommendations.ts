import type {
  CroAuditRecommendation,
  DashboardLatestWebsiteScan,
  GrowthScanCategoryFinding,
} from "@/types/intelligence";

/**
 * GROWTH SCAN → RECOMMENDATIONS.
 *
 * A Growth Scan is the entry point into Ascend's intelligence, and it must be
 * sufficient on its own: a customer who has run one should be told what to do
 * next, not asked to run a second, specialised audit first. A CRO audit
 * REFINES these; it is not a prerequisite for them.
 *
 * Nothing here is generated. Every field is lifted from what the scan already
 * computed and stored — its per-category findings, its quick wins, its full
 * fixes, and its own ranked list of opportunities. This module only reshapes
 * that into the type the recommendation surfaces already consume.
 *
 * HONESTY GUARD: a category is emitted only when the scan actually produced
 * something to act on (quickWin, fullFix, or a finding). A category with a bad
 * score and no fix text is dropped, because "you scored poorly here" is not a
 * next action, and padding the list would make advice look deeper than the
 * evidence behind it. Same rule as section completeness: minimal is fine,
 * omitted is fine, empty-but-present is not.
 *
 * Pure — no network, no Firestore — so it stays trivially testable.
 */

/** The scan's tier IS its impact judgement: red is what's costing the most. */
const TIER_TO_IMPACT: Record<GrowthScanCategoryFinding["tier"], CroAuditRecommendation["impact"]> = {
  red: "High",
  yellow: "Medium",
  green: "Low",
};

/**
 * A quick win is by definition the cheap version of the fix, so when the scan
 * offers one, the effort is low. Falling back to the full fix means real work.
 * This is read off which field the text came from, never guessed.
 */
function difficultyFor(c: GrowthScanCategoryFinding): CroAuditRecommendation["difficulty"] {
  if (c.quickWin?.trim()) return "Low";
  if (c.fullFix?.trim()) return "Medium";
  return "High";
}

/** Loose token overlap, used only to line a ranked opportunity up with the
 *  category it describes. Deliberately conservative: a wrong match would
 *  reorder advice, so anything short or generic is ignored. */
function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4),
  );
}

/**
 * Rank the scan's categories using the scan's OWN prioritisation.
 *
 * `topOpportunities` is the scan's ranked answer to "what matters most here",
 * and discarding it in favour of "all red categories are equal" would throw
 * away the one thing that makes these next actions PRIORITISED rather than
 * merely listed. Each opportunity is matched to the category it describes;
 * matched categories keep the scan's order.
 *
 * Anything the ranking doesn't cover falls to a deterministic tail — worst
 * tier first, then lowest score — so the order is stable and explainable
 * rather than dependent on how the categories happened to be stored.
 */
function rankCategories(
  categories: GrowthScanCategoryFinding[],
  topOpportunities: string[],
): GrowthScanCategoryFinding[] {
  const rankOf = new Map<string, number>();

  topOpportunities.forEach((opportunity, i) => {
    const oppTokens = tokens(opportunity);
    let best: { key: string; score: number } | null = null;
    for (const c of categories) {
      if (rankOf.has(c.key)) continue; // one opportunity per category
      const label = c.label.toLowerCase();
      // A direct mention of the category name is the strongest signal.
      const direct = opportunity.toLowerCase().includes(label) ? 3 : 0;
      const overlap = [...tokens(`${c.label} ${c.finding}`)].filter((t) => oppTokens.has(t)).length;
      const score = direct + overlap;
      if (score > 0 && (!best || score > best.score)) best = { key: c.key, score };
    }
    if (best) rankOf.set(best.key, i);
  });

  const TIER_ORDER = { red: 0, yellow: 1, green: 2 };
  return [...categories].sort((a, b) => {
    const ra = rankOf.get(a.key);
    const rb = rankOf.get(b.key);
    // Anything the scan explicitly ranked outranks anything it didn't.
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    const tier = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    return tier !== 0 ? tier : a.score - b.score;
  });
}

/**
 * Derive prioritised, actionable recommendations from a completed Growth Scan.
 * Returns an empty array when the scan carries nothing actionable — an honest
 * empty, which the surfaces already render as "no recommendations yet".
 */
export function recommendationsFromGrowthScan(
  scan: DashboardLatestWebsiteScan | null,
): CroAuditRecommendation[] {
  if (!scan || scan.categoryScores.length === 0) return [];

  return rankCategories(scan.categoryScores, scan.topOpportunities)
    .map((c): CroAuditRecommendation | null => {
      // The most actionable thing the scan actually said, in order of how
      // directly it tells the customer what to DO.
      const fix = c.quickWin?.trim() || c.fullFix?.trim() || c.finding?.trim() || "";
      if (!fix) return null; // honesty guard — never pad the list
      return {
        source: "growth_scan",
        categoryKey: c.key,
        categoryLabel: c.label,
        impact: TIER_TO_IMPACT[c.tier],
        difficulty: difficultyFor(c),
        fix,
        // Reserved for a purpose-written Zeno handoff, which a Growth Scan
        // does not produce. Null rather than a copy of `fix`, so a consumer
        // can always tell whether one genuinely exists.
        fixWithZeno: null,
        // The evidence behind the recommendation, when it is not already the
        // recommendation itself.
        fixContext: c.finding?.trim() && c.finding.trim() !== fix ? c.finding.trim() : "",
      };
    })
    .filter((r): r is CroAuditRecommendation => r !== null);
}
