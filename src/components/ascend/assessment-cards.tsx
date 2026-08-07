import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import type { WithMeta, GrowthAssessment, IntelligenceReportSummary } from "@/types/intelligence";

export function LatestAssessmentCard({ assessment }: { assessment: WithMeta<GrowthAssessment> }) {
  const data = assessment.data;
  return (
    <AscendCardShell title="Latest Assessment" action={<IntelligenceStatusBadge meta={assessment.meta} />}>
      {data ? (
        <>
          <p className="text-sm text-white/80 capitalize">{data.status.replace(/_/g, " ")}</p>
          {data.growthScore && <p className="mt-1 text-xs text-white/50">Score: {Math.round(data.growthScore.overallScore)} / 100</p>}
          <p className="mt-1 text-xs text-white/40">{new Date(data.createdAt).toLocaleDateString()}</p>
        </>
      ) : (
        <p className="text-sm text-white/40">No assessment run yet.</p>
      )}
    </AscendCardShell>
  );
}

/** Identify's fuller assessment history — same data source, list form. */
export function AssessmentHistoryCard({ assessment }: { assessment: WithMeta<GrowthAssessment> }) {
  return (
    <AscendCardShell title="Assessment History" action={<IntelligenceStatusBadge meta={assessment.meta} />}>
      {assessment.data ? (
        <ul className="space-y-2">
          <li className="rounded-lg border border-white/10 px-3 py-2.5">
            <p className="text-sm text-white/80 capitalize">{assessment.data.status.replace(/_/g, " ")}</p>
            <p className="mt-0.5 text-xs text-white/40">{new Date(assessment.data.createdAt).toLocaleDateString()}</p>
          </li>
        </ul>
      ) : (
        <p className="text-sm text-white/40">No assessments recorded yet. Run a Growth Scan to start your history.</p>
      )}
      <p className="mt-3 text-[11px] text-white/30">
        Showing the latest assessment only — full paginated history is a follow-up once live Ascend connectivity is configured.
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
            <li key={r.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
              <span className="text-white/80">{r.title || r.kind.replace(/_/g, " ")}</span>
              {r.score !== null && <span className="text-xs text-white/40">{Math.round(r.score)}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-white/40">No reports yet.</p>
      )}
    </AscendCardShell>
  );
}

/** Minimal, honest scope: the real full Blueprint (positioning, offer
 *  architecture, funnel strategy, etc.) is generated via a per-assessment
 *  `/blueprint` fetch this slice's client does not call (no confirmed,
 *  tested response shape for it yet — see the client's header comment on
 *  what was and wasn't verified). This card shows the one blueprint-
 *  adjacent field the dashboard-summary response DOES carry
 *  (`recommendedFunnel`) rather than inventing the rest. */
export function BlueprintSummaryCard({ assessment }: { assessment: WithMeta<GrowthAssessment> }) {
  return (
    <AscendCardShell title="Blueprint Summary" action={<IntelligenceStatusBadge meta={assessment.meta} />}>
      {assessment.data?.recommendedFunnel ? (
        <p className="text-sm text-white/80">Recommended funnel: {assessment.data.recommendedFunnel}</p>
      ) : (
        <p className="text-sm text-white/40">No blueprint recommendation yet. Full Blueprint Studio detail is a follow-up slice.</p>
      )}
    </AscendCardShell>
  );
}
