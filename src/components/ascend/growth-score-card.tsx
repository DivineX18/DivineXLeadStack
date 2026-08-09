import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import type { WithMeta, DashboardSummary } from "@/types/intelligence";

/**
 * Corrected Slice 10.5: sourced from the real `dashboard-summary` bridge
 * response (flat `latestGrowthScore`/`scoreLabel`/`primaryConstraint`),
 * not Slice 9's invented nested `GrowthScore` object. The real endpoint
 * carries no per-category score breakdown at this level — that detail
 * lives on individual CRO audit rows (`CroAudit.categoryScores`), a
 * different resource.
 */
export function GrowthScoreCard({ dashboardSummary }: { dashboardSummary: WithMeta<DashboardSummary> }) {
  const data = dashboardSummary.data;
  return (
    <AscendCardShell title="Growth Score" action={<IntelligenceStatusBadge meta={dashboardSummary.meta} />}>
      {data?.hasScan ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight" style={{ color: "hsl(var(--jade))" }}>
              {data.latestGrowthScore !== null ? Math.round(data.latestGrowthScore) : "—"}
            </span>
            <span className="text-sm text-white/40">/ 100</span>
            {data.scoreLabel && <span className="ml-1 text-xs text-white/50">{data.scoreLabel}</span>}
          </div>
          {data.primaryConstraint && <p className="mt-2 text-xs text-white/60">Primary constraint: {data.primaryConstraint}</p>}
          {data.scoreSource && (
            <p className="mt-1 text-[11px] text-white/30">
              From your latest {data.scoreSource === "website_scan" ? "Website Scan" : "Business Assessment"}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-white/40">
          {dashboardSummary.meta.reasonCode === "no_linked_business_profile" ? (
            <>
              <a
                href="https://ascend.divinex.io/dashboard"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-white/30 underline-offset-2 hover:text-white hover:decoration-white/60"
              >
                Link a business profile
              </a>{" "}
              to see your Growth Score here.
            </>
          ) : (
            "No score available yet."
          )}
        </p>
      )}
    </AscendCardShell>
  );
}
