import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { composeBusinessHealthSummary } from "@/lib/intelligence/compose-business-health";
import { formatCents } from "@/components/ascend/metric-card";
import { PageHeader, Panel } from "@/components/divinex/ui";

export const dynamic = "force-dynamic";

/**
 * PERFORMANCE — P0.3. Answers "what's happening?" in BUSINESS outcomes.
 *
 * Deliberately not a GA4 rebuild: revenue, pipeline, leads and conversion,
 * not sessions and bounce rates. Reuses composeBusinessHealthSummary — the
 * same wrapper Home and Leads compose — rather than adding a second
 * analytics path that could disagree with them.
 */
export default async function PerformancePage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;
  if (!saId) {
    return <AscendSectionPlaceholder title="Performance" description="No active workspace yet." links={[]} />;
  }

  const health = await composeBusinessHealthSummary(saId).catch(() => null);
  const h = health?.data ?? null;

  const metrics = [
    { label: "Revenue this month", value: h ? formatCents(h.revenueThisMonthCents) : "—", sub: h ? `${h.wonDealsThisMonth} won` : undefined },
    { label: "Open pipeline", value: h ? formatCents(h.openPipelineValueCents) : "—", sub: h ? `${h.openPipelineCount} deals` : undefined },
    { label: "New leads this week", value: h ? String(h.newLeadsThisWeek) : "—" },
    { label: "Upcoming appointments", value: h ? String(h.upcomingAppointmentCount) : "—" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Performance"
        description="What's actually happening in the business — the outcomes, not the traffic."
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-[var(--dx-radius)] border p-4"
            style={{ backgroundColor: "var(--dx-surface-2)", borderColor: "var(--dx-border-subtle)" }}
          >
            <p className="text-[11px] leading-snug" style={{ color: "var(--dx-text-muted)" }}>{m.label}</p>
            <p className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums" style={{ color: "var(--dx-text-primary)" }}>{m.value}</p>
            {m.sub && <p className="mt-0.5 text-[11px]" style={{ color: "var(--dx-text-muted)" }}>{m.sub}</p>}
          </div>
        ))}
      </div>

      <Panel className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>
          What needs attention
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--dx-text-secondary)" }}>
          {h && h.overdueTaskCount > 0
            ? `${h.overdueTaskCount} follow-ups are overdue. Those are the fastest thing to fix today.`
            : "Nothing is overdue right now. Ask Zeno what would move the needle next."}
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <Link href="/app/leads" className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--dx-primary)" }}>
            Go to Leads <ArrowRight className="h-3 w-3" />
          </Link>
          <Link href="/app/intelligence" className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--dx-primary)" }}>
            Why is this happening? <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </Panel>
    </div>
  );
}
