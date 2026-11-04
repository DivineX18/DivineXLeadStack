import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { resolveIdentifyDashboard } from "@/lib/intelligence/intelligence-wrappers";
import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { GrowthScoreCard } from "@/components/ascend/growth-score-card";
import { AssessmentHistoryCard, BlueprintSummaryCard } from "@/components/ascend/assessment-cards";
import { RecommendationsListCard } from "@/components/ascend/recommendation-card";
import { BusinessMemoryCard } from "@/components/ascend/memory-card";
import { GrowthTimelineCard } from "@/components/ascend/timeline-card";
import { RunGrowthScanCard } from "@/components/ascend/run-growth-scan-card";
import { AscendSectionPage, type AscendBand } from "@/components/ascend/section-page";

/**
 * INTELLIGENCE — the real Identify section: Growth Score, Assessment
 * History, Recommendations, Business Memory, Growth Timeline, Blueprint
 * Summary. Intelligence-only, no Flow operational data (see
 * compose-identify-dashboard.ts's header comment).
 *
 * Every card, every prop and every read is unchanged. What the Priority 2
 * pass changed is the WEIGHTING: the six cards sat in one flat grid where
 * a finding and a historical blueprint carried identical visual weight,
 * underneath a scan button that came before any statement of where the
 * customer stands. Composed through AscendSectionPage, the scan card and
 * the score lead together (Home's proven two-thirds/one-third pattern),
 * findings and history get their own labelled bands, and the reference
 * cards recede to the end.
 */
export default async function IntelligencePage() {
  const shell = await resolveShellContextForPage();
  const uid = shell?.identity.session.user?.uid ?? null;
  const workspaceId = shell?.workspace?.workspaceId ?? null;

  if (!uid || !workspaceId) {
    return <AscendSectionPlaceholder title="Intelligence" description="No active workspace yet." links={[]} />;
  }

  const result = await resolveIdentifyDashboard(uid, workspaceId);
  if (!result.ok) {
    return (
      <AscendSectionPlaceholder
        title="Intelligence"
        description="Couldn't load your intelligence data right now."
        links={[{ label: "Open reports", href: `/sa/${workspaceId}/reports` }]}
      />
    );
  }

  const { intelligence } = result.data;
  const mapping = await getMappingBySubAccountId(workspaceId);
  const isFullAscend = shell?.workspace?.entitlements?.effectiveTier === "full_ascend";

  const bands: AscendBand[] = [
    // 1 — CONTEXT. Where you stand, and the one action that changes it.
    // Deliberately one band rather than context + a separate actions band:
    // before a scan has ever run, the scan card IS the state of this
    // section, and splitting them would put a button for the only thing
    // there is to do below a timeline of nothing.
    {
      role: "context",
      content: (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RunGrowthScanCard
              saId={workspaceId}
              hasBusinessProfile={!!mapping?.primaryAscendBusinessProfileId}
              isFullAscend={isFullAscend}
            />
          </div>
          <GrowthScoreCard dashboardSummary={intelligence.dashboardSummary} />
        </div>
      ),
    },

    // 2 — ACTIVITY. What has happened to this business, in order.
    {
      role: "activity",
      label: "What's happened",
      content: <GrowthTimelineCard timeline={intelligence.growthTimeline} />,
    },

    // 3 — RECOMMENDATIONS. The findings, given their own heading instead of
    // being one card of six.
    {
      role: "recommendations",
      label: "What we'd fix first",
      content: <RecommendationsListCard recommendations={intelligence.recommendations} />,
    },

    // 4 — EXECUTION. Reference depth, deliberately last and quieter.
    {
      role: "execution",
      label: "The record",
      content: (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AssessmentHistoryCard dashboardSummary={intelligence.dashboardSummary} />
          <BusinessMemoryCard memory={intelligence.memory} />
          <BlueprintSummaryCard dashboardSummary={intelligence.dashboardSummary} />
        </div>
      ),
    },
  ];

  return (
    <AscendSectionPage
      title="Intelligence"
      description="What DivineX knows about your business, growth scans, findings, recommendations and the history behind them."
      bands={bands}
    />
  );
}
