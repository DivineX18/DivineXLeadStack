import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { resolveIdentifyDashboard } from "@/lib/intelligence/intelligence-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { GrowthScoreCard } from "@/components/ascend/growth-score-card";
import { AssessmentHistoryCard, BlueprintSummaryCard } from "@/components/ascend/assessment-cards";
import { RecommendationsListCard } from "@/components/ascend/recommendation-card";
import { BusinessMemoryCard } from "@/components/ascend/memory-card";
import { GrowthTimelineCard } from "@/components/ascend/timeline-card";

/**
 * Ascend OS Phase 2, Slice 9 — the real Identify section: Overview
 * (Growth Score), Assessment History, Recommendations, Business Memory,
 * Growth Timeline, Blueprint Summary. Intelligence-only (no Flow
 * operational data — see compose-identify-dashboard.ts's header comment).
 */
export default async function AscendIdentifyPage() {
  const shell = await resolveShellContextForLayout();
  const uid = shell?.identity.session.user?.uid ?? null;
  const workspaceId = shell?.workspace?.workspaceId ?? null;

  if (!uid || !workspaceId) {
    return <AscendSectionPlaceholder title="Identify" description="No active workspace yet." links={[]} />;
  }

  const result = await resolveIdentifyDashboard(uid, workspaceId);
  if (!result.ok) {
    return (
      <AscendSectionPlaceholder
        title="Identify"
        description="Couldn't load your intelligence data right now."
        links={[{ label: "Open reports", href: `/sa/${workspaceId}/reports` }]}
      />
    );
  }

  const { intelligence } = result.data;

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Identify</h1>
        <p className="mt-1 text-sm text-white/50">Understand the business — growth scans, audits, and everything Ascend knows.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <GrowthScoreCard dashboardSummary={intelligence.dashboardSummary} />
        <AssessmentHistoryCard dashboardSummary={intelligence.dashboardSummary} />
        <RecommendationsListCard recommendations={intelligence.recommendations} />
        <BusinessMemoryCard memory={intelligence.memory} />
        <GrowthTimelineCard timeline={intelligence.growthTimeline} />
        <BlueprintSummaryCard dashboardSummary={intelligence.dashboardSummary} />
      </div>
    </div>
  );
}
