import type { IntelligenceSnapshot, Recommendation } from "@/types/intelligence";

/**
 * Ascend OS Phase 2, Slice 9 — pure derivation of the Home Dashboard's
 * single "recommended next action" card. No fetch/Firestore import — unit
 * testable in isolation. There is no dedicated Ascend endpoint for a
 * ranked "next action" (see the Recommendations contradiction recorded in
 * src/types/intelligence.ts) — this slice derives one client-side from
 * whatever recommendations ARE available, ranked by impact then
 * inversely by difficulty (a high-impact, low-difficulty item wins).
 * Returns null whenever there's genuinely nothing to recommend — never
 * fabricates a placeholder recommendation.
 */
const IMPACT_WEIGHT: Record<Recommendation["impact"], number> = { high: 3, medium: 2, low: 1 };
const DIFFICULTY_WEIGHT: Record<Recommendation["difficulty"], number> = { low: 3, medium: 2, high: 1 };

export function deriveRecommendedNextAction(snapshot: IntelligenceSnapshot): Recommendation | null {
  const recs = snapshot.recommendations.data;
  if (!recs || recs.length === 0) return null;

  return [...recs].sort((a, b) => {
    const scoreA = IMPACT_WEIGHT[a.impact] * 10 + DIFFICULTY_WEIGHT[a.difficulty];
    const scoreB = IMPACT_WEIGHT[b.impact] * 10 + DIFFICULTY_WEIGHT[b.difficulty];
    return scoreB - scoreA;
  })[0];
}
