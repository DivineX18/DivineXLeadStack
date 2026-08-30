import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import type { WithMeta, DashboardSummary, IntelligenceReportSummary } from "@/types/intelligence";

/**
 * Corrected Slice 10.5: sourced from the real `dashboard-summary` bridge
 * response — there is no standalone "assessment" resource with an id/
 * status/createdAt of its own on the bridge; `assessmentId` and
 * `hasScan` are the real fields the endpoint exposes. Replaces Slice 9's
 * invented `GrowthAssessment{id,status,createdAt}` shape.
 */
export function LatestAssessmentCard({ dashboardSummary }: { dashboardSummary: WithMeta<DashboardSummary> }) {
  const data = dashboardSummary.data;
  return (
    <AscendCardShell title="Latest Assessment" action={<IntelligenceStatusBadge meta={dashboardSummary.meta} />}>
      {data?.hasScan ? (
        <>
          {data.latestGrowthScore !== null && <p className="text-sm text-[var(--dx-text-secondary)]">Score: {Math.round(data.latestGrowthScore)} / 100</p>}
          {data.scoreLabel && <p className="mt-1 text-xs text-[var(--dx-text-muted)]">{data.scoreLabel}</p>}
          {data.recommendedAction && <p className="mt-2 text-xs text-[var(--dx-text-muted)]">{data.recommendedAction}</p>}
        </>
      ) : (
        <p className="text-sm text-[var(--dx-text-muted)]">
          No assessment run yet.{" "}
          <a
            href="https://ascend.divinex.io/growth-scanner"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-white/30 underline-offset-2 hover:text-[var(--dx-text-primary)] hover:decoration-white/60"
          >
            Run a Growth Audit
          </a>
          .
        </p>
      )}
    </AscendCardShell>
  );
}

/** Identify's fuller assessment history — same data source as
 *  LatestAssessmentCard. The bridge only exposes the newest assessment
 *  (no paginated history endpoint exists), same honest limitation Slice 9
 *  already recorded. */
export function AssessmentHistoryCard({ dashboardSummary }: { dashboardSummary: WithMeta<DashboardSummary> }) {
  const data = dashboardSummary.data;
  return (
    <AscendCardShell title="Assessment History" action={<IntelligenceStatusBadge meta={dashboardSummary.meta} />}>
      {data?.hasScan ? (
        <ul className="space-y-2">
          <li className="rounded-lg border border-[var(--dx-border-subtle)] px-3 py-2.5">
            <p className="text-sm text-[var(--dx-text-secondary)]">{data.scoreLabel ?? "Scored"}</p>
            {data.latestGrowthScore !== null && <p className="mt-0.5 text-xs text-[var(--dx-text-muted)]">Score: {Math.round(data.latestGrowthScore)} / 100</p>}
          </li>
        </ul>
      ) : (
        <p className="text-sm text-[var(--dx-text-muted)]">
          No assessments recorded yet.{" "}
          <a
            href="https://ascend.divinex.io/growth-scanner"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-white/30 underline-offset-2 hover:text-[var(--dx-text-primary)] hover:decoration-white/60"
          >
            Run a Growth Scan
          </a>{" "}
          to start your history.
        </p>
      )}
      <p className="mt-3 text-[11px] text-[var(--dx-text-primary)]/30">
        Showing the latest assessment only — full paginated history is a follow-up once a dedicated bridge endpoint exists.
      </p>
    </AscendCardShell>
  );
}

export function ReportsCard({ reports }: { reports: WithMeta<IntelligenceReportSummary[]> }) {
  const items = reports.data ?? [];
  return (
    <AscendCardShell title="Recent Intelligence" action={<IntelligenceStatusBadge meta={reports.meta} />}>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.slice(0, 5).map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg border border-[var(--dx-border-subtle)] px-3 py-2 text-sm">
              <span className="text-[var(--dx-text-secondary)]">{r.title || r.reportType.replace(/_/g, " ")}</span>
              {r.score !== null && <span className="text-xs text-[var(--dx-text-muted)]">{Math.round(r.score)}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--dx-text-muted)]">No reports yet.</p>
      )}
    </AscendCardShell>
  );
}

/** Minimal, honest scope: the real full Blueprint (positioning, offer
 *  architecture, funnel strategy, etc.) is generated via a per-assessment
 *  `/blueprint` fetch this client does not call (no confirmed, tested
 *  response shape for it — not part of the bridge contract). This card
 *  shows the two blueprint-adjacent fields dashboard-summary DOES carry
 *  (`recommendedFunnel`, `latestBlueprintHeadline`) rather than inventing
 *  the rest. */
export function BlueprintSummaryCard({ dashboardSummary }: { dashboardSummary: WithMeta<DashboardSummary> }) {
  const data = dashboardSummary.data;
  return (
    <AscendCardShell title="Blueprint Summary" action={<IntelligenceStatusBadge meta={dashboardSummary.meta} />}>
      {data?.latestBlueprintHeadline || data?.recommendedFunnel ? (
        <>
          {data.latestBlueprintHeadline && <p className="text-sm text-[var(--dx-text-secondary)]">{data.latestBlueprintHeadline}</p>}
          {data.recommendedFunnel && <p className="mt-1 text-xs text-[var(--dx-text-muted)]">Recommended funnel: {data.recommendedFunnel}</p>}
        </>
      ) : (
        <p className="text-sm text-[var(--dx-text-muted)]">No blueprint recommendation yet. Full Blueprint Studio detail is a follow-up slice.</p>
      )}
    </AscendCardShell>
  );
}
