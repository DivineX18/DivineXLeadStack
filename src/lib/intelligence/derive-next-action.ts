import type { CroAuditRecommendation, IntelligenceSnapshot } from "@/types/intelligence";

/**
 * Ascend OS Phase 2, Slice 9 (corrected Slice 10.5 for the real
 * `CroAuditRecommendation` shape — Title-cased `impact`/`difficulty`, no
 * standalone `id`) — pure derivation of the Home Dashboard's single
 * "recommended next action" card. No fetch/Firestore import — unit
 * testable in isolation. There is no dedicated Ascend endpoint for a
 * ranked "next action" — this slice derives one client-side from the
 * newest CRO audit's `recommendations` array (the real, closest thing
 * Ascend exposes to a prioritized to-do list), ranked by impact then
 * inversely by difficulty (a high-impact, low-difficulty item wins).
 * Returns null whenever there's genuinely nothing to recommend — never
 * fabricates a placeholder recommendation.
 */
const IMPACT_WEIGHT: Record<CroAuditRecommendation["impact"], number> = { High: 3, Medium: 2, Low: 1 };
const DIFFICULTY_WEIGHT: Record<CroAuditRecommendation["difficulty"], number> = { Low: 3, Medium: 2, High: 1 };

export function deriveRecommendedNextAction(snapshot: IntelligenceSnapshot): CroAuditRecommendation | null {
  const recs = snapshot.recommendations.data;
  if (!recs || recs.length === 0) return null;

  return [...recs].sort((a, b) => {
    const scoreA = IMPACT_WEIGHT[a.impact] * 10 + DIFFICULTY_WEIGHT[a.difficulty];
    const scoreB = IMPACT_WEIGHT[b.impact] * 10 + DIFFICULTY_WEIGHT[b.difficulty];
    return scoreB - scoreA;
  })[0];
}
