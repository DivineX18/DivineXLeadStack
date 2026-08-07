import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import type { WithMeta, Recommendation } from "@/types/intelligence";

const IMPACT_TONE: Record<Recommendation["impact"], string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-white/50",
};

function RecommendationRow({ rec }: { rec: Recommendation }) {
  return (
    <li className="rounded-lg border border-white/10 px-3 py-2.5">
      <p className="text-sm text-white/85">{rec.title}</p>
      <p className="mt-1 text-xs text-white/40">
        <span className={IMPACT_TONE[rec.impact]}>{rec.impact} impact</span> · {rec.difficulty} effort · {rec.category}
      </p>
    </li>
  );
}

/** Home's single "highest priority" card — one recommendation, already
 *  ranked by derive-next-action.ts. */
export function RecommendedNextActionCard({ action, meta }: { action: Recommendation | null; meta: WithMeta<Recommendation[]>["meta"] }) {
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

/** Identify's full recommendations list. */
export function RecommendationsListCard({ recommendations }: { recommendations: WithMeta<Recommendation[]> }) {
  const items = recommendations.data ?? [];
  return (
    <AscendCardShell title="Recommendations" action={<IntelligenceStatusBadge meta={recommendations.meta} />}>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((rec) => (
            <RecommendationRow key={rec.id} rec={rec} />
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
