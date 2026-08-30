import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import { formatCents } from "@/components/ascend/metric-card";
import type { WithMeta, BusinessHealthSummary } from "@/types/intelligence";

/**
 * A compact at-a-glance strip, distinct from the individual Revenue/
 * Pipeline/Tasks/Leads/Appointments cards (which show the same underlying
 * numbers at full detail). Deliberately does NOT invent a numeric "health
 * score" — no such derived metric exists anywhere in either system's real
 * data (Ascend's real score is the Growth Score, computed by its own
 * engine from real evidence; fabricating a second, Flow-side "score" from
 * task/pipeline counts would be exactly the kind of invented signal this
 * effort's audits have repeatedly flagged and avoided). Uses a plain,
 * honest qualitative label instead.
 */
function healthLabel(data: BusinessHealthSummary): { label: string; tone: string } {
  if (data.overdueTaskCount > 5) return { label: "Needs attention", tone: "text-amber-400" };
  if (data.overdueTaskCount > 0) return { label: "On track, some overdue", tone: "text-[var(--dx-text-secondary)]" };
  return { label: "On track", tone: "text-emerald-400" };
}

export function BusinessHealthCard({ businessHealth }: { businessHealth: WithMeta<BusinessHealthSummary> }) {
  const data = businessHealth.data;
  return (
    <AscendCardShell title="Business Health" action={<IntelligenceStatusBadge meta={businessHealth.meta} />}>
      {data ? (
        <>
          <p className={`text-sm font-medium ${healthLabel(data).tone}`}>{healthLabel(data).label}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs text-[var(--dx-text-muted)] sm:grid-cols-3">
            <div>
              <dt className="text-[var(--dx-text-muted)]">Revenue (MTD)</dt>
              <dd className="mt-0.5 text-sm text-[var(--dx-text-primary)]/85">{formatCents(data.revenueThisMonthCents)}</dd>
            </div>
            <div>
              <dt className="text-[var(--dx-text-muted)]">Open pipeline</dt>
              <dd className="mt-0.5 text-sm text-[var(--dx-text-primary)]/85">{formatCents(data.openPipelineValueCents)}</dd>
            </div>
            <div>
              <dt className="text-[var(--dx-text-muted)]">Overdue tasks</dt>
              <dd className="mt-0.5 text-sm text-[var(--dx-text-primary)]/85">{data.overdueTaskCount}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="text-sm text-[var(--dx-text-muted)]">Unavailable right now.</p>
      )}
    </AscendCardShell>
  );
}
