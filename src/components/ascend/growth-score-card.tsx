import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import type { WithMeta, GrowthScore } from "@/types/intelligence";

export function GrowthScoreCard({ growthScore }: { growthScore: WithMeta<GrowthScore> }) {
  const data = growthScore.data;
  return (
    <AscendCardShell title="Growth Score" action={<IntelligenceStatusBadge meta={growthScore.meta} />}>
      {data ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight" style={{ color: "hsl(var(--jade))" }}>
              {Math.round(data.overallScore)}
            </span>
            <span className="text-sm text-white/40">/ 100</span>
          </div>
          {data.primaryConstraint && <p className="mt-2 text-xs text-white/60">Primary constraint: {data.primaryConstraint}</p>}
          {data.categoryScores.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {data.categoryScores.slice(0, 5).map((c) => (
                <li key={c.category} className="flex items-center justify-between text-xs text-white/50">
                  <span>{c.category}</span>
                  <span>{Math.round(c.score)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-sm text-white/40">
          {growthScore.meta.reasonCode === "no_linked_business_profile"
            ? "Link a business profile to see your Growth Score here."
            : "No score available yet."}
        </p>
      )}
    </AscendCardShell>
  );
}
