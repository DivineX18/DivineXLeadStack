import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import type { WithMeta, CroAuditRecommendation } from "@/types/intelligence";

/**
 * Corrected Slice 10.5: sourced from the real `croAuditEngine.ts`
 * `CroAuditRecommendation` shape — Title-cased `impact`/`difficulty`, the
 * fix text lives in `fix` (not `title`), there is no standalone `id` (a
 * recommendation is identified by its position within an audit, not a
 * row of its own), and `categoryLabel` replaces the invented `category`
 * field. Replaces Slice 9's guessed `Recommendation` shape.
 */
const IMPACT_TONE: Record<CroAuditRecommendation["impact"], string> = {
  High: "text-emerald-400",
  Medium: "text-amber-400",
  Low: "text-white/50",
};

function RecommendationRow({ rec }: { rec: CroAuditRecommendation }) {
  return (
    <li className="rounded-lg border border-white/10 px-3 py-2.5">
      <p className="text-sm text-white/85">{rec.fix}</p>
      <p className="mt-1 text-xs text-white/40">
        <span className={IMPACT_TONE[rec.impact]}>{rec.impact} impact</span> · {rec.difficulty} effort · {rec.categoryLabel}
      </p>
    </li>
  );
}

/** Home's single "highest priority" card — one recommendation, already
 *  ranked by derive-next-action.ts. */
export function RecommendedNextActionCard({
  action,
  meta,
}: {
  action: CroAuditRecommendation | null;
  meta: WithMeta<CroAuditRecommendation[]>["meta"];
}) {
  return (
    <AscendCardShell title="Recommended Next Step" action={<IntelligenceStatusBadge meta={meta} />}>
      {action ? (
        <RecommendationRow rec={action} />
      ) : (
        <p className="text-sm text-white/40">Nothing to recommend right now — run a Growth Scan or CRO Audit under Identify.</p>
      )}
    </AscendCardShell>
  );
}

/** Identify's full recommendations list — the newest CRO audit's
 *  recommendations, composed by resolve-intelligence-snapshot.ts. */
export function RecommendationsListCard({ recommendations }: { recommendations: WithMeta<CroAuditRecommendation[]> }) {
  const items = recommendations.data ?? [];
  return (
    <AscendCardShell title="Recommendations" action={<IntelligenceStatusBadge meta={recommendations.meta} />}>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((rec, i) => (
            <RecommendationRow key={`${rec.categoryKey}-${i}`} rec={rec} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-white/40">
          {recommendations.meta.status === "unavailable" ? "Unavailable right now." : "No recommendations yet — run a CRO Audit to generate some."}
        </p>
      )}
    </AscendCardShell>
  );
}
