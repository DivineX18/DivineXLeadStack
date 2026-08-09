import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { resolveHomeDashboard } from "@/lib/intelligence/intelligence-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { BusinessHealthCard } from "@/components/ascend/business-health-card";
import { GrowthScoreCard } from "@/components/ascend/growth-score-card";
import { MetricCard, formatCents } from "@/components/ascend/metric-card";
import { RecommendedNextActionCard } from "@/components/ascend/recommendation-card";
import { GrowthTimelineCard } from "@/components/ascend/timeline-card";
import { BusinessMemoryCard } from "@/components/ascend/memory-card";
import { LatestAssessmentCard, ReportsCard } from "@/components/ascend/assessment-cards";

/**
 * Ascend OS Phase 2, Slice 9 — the real Home Dashboard. Replaces Slice 8's
 * placeholder page. Composes Flow operational data + Ascend intelligence
 * data via resolveHomeDashboard() — the one sanctioned entry point (see
 * lib/intelligence/intelligence-wrappers.ts). If no workspace is active or
 * the caller lacks workspace.read, falls back to the same placeholder
 * Slice 8 shipped, rather than crashing.
 */
export default async function AscendHomePage() {
  const shell = await resolveShellContextForPage();
  const uid = shell?.identity.session.user?.uid ?? null;
  const workspaceId = shell?.workspace?.workspaceId ?? null;

  if (!uid || !workspaceId) {
    return (
      <AscendSectionPlaceholder
        title="Home"
        description="No active workspace yet — once you're linked to one, your growth overview will appear here."
        links={[]}
      />
    );
  }

  const result = await resolveHomeDashboard(uid, workspaceId);
  if (!result.ok) {
    return (
      <AscendSectionPlaceholder
        title="Home"
        description="Couldn't load your dashboard right now."
        links={[{ label: "Open workspace dashboard", href: `/sa/${workspaceId}/dashboard` }]}
      />
    );
  }

  const { businessHealth, intelligence, recommendedNextAction } = result.data;
  const health = businessHealth.data;

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Home</h1>
        <p className="mt-1 text-sm text-white/50">Your growth overview — operational and intelligence, composed.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BusinessHealthCard businessHealth={businessHealth} />
        <GrowthScoreCard dashboardSummary={intelligence.dashboardSummary} />
        <RecommendedNextActionCard action={recommendedNextAction} meta={intelligence.recommendations.meta} />

        <MetricCard
          label="Revenue (this month)"
          value={health ? formatCents(health.revenueThisMonthCents) : "—"}
          subLabel={health ? `${health.wonDealsThisMonth} won deals` : undefined}
          meta={businessHealth.meta}
        />
        <MetricCard
          label="Pipeline"
          value={health ? formatCents(health.openPipelineValueCents) : "—"}
          subLabel={health ? `${health.openPipelineCount} open deals` : undefined}
          meta={businessHealth.meta}
        />
        <MetricCard
          label="Leads (this week)"
          value={health ? String(health.newLeadsThisWeek) : "—"}
          meta={businessHealth.meta}
        />
        <MetricCard
          label="Tasks"
          value={health ? String(health.dueTodayTaskCount) : "—"}
          subLabel={health ? `${health.overdueTaskCount} overdue` : undefined}
          meta={businessHealth.meta}
        />
        <MetricCard
          label="Upcoming Appointments"
          value={health ? String(health.upcomingAppointmentCount) : "—"}
          meta={businessHealth.meta}
        />
        <LatestAssessmentCard dashboardSummary={intelligence.dashboardSummary} />

        <GrowthTimelineCard timeline={intelligence.growthTimeline} limit={5} />
        <BusinessMemoryCard memory={intelligence.memory} />
        <ReportsCard reports={intelligence.reports} />
      </div>
    </div>
  );
}
