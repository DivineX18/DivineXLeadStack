import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { resolveIntelligenceSnapshot } from "@/lib/intelligence/intelligence-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { RecommendationsListCard } from "@/components/ascend/recommendation-card";
import { GrowthScoreCard } from "@/components/ascend/growth-score-card";
import { SubAccountProvider } from "@/context/sub-account-context";
import ReportsPage from "@/app/(dashboard)/sa/[subAccountId]/reports/page";

/**
 * Ascend OS launch pass, Task F — Optimize. Composes real Ascend
 * intelligence (Growth Score + CRO recommendations, via the same
 * resolveIntelligenceSnapshot() Home/Identify already use — no duplicated
 * scoring logic) with the real, unmodified Flow Reports page (operational
 * KPIs, pipeline funnel, revenue) mounted below via the same
 * SubAccountProvider reuse pattern used throughout this pass. No invented
 * metrics, no second "health score" — every number here comes from an
 * already-authoritative source.
 */
export default async function AscendOptimizePage() {
  const shell = await resolveShellContextForPage();
  const uid = shell?.identity.session.user?.uid ?? null;
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!uid || !saId) {
    return <AscendSectionPlaceholder title="Optimize" description="No active workspace yet." links={[]} />;
  }

  const result = await resolveIntelligenceSnapshot(uid, saId);

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Optimize</h1>
        <p className="mt-1 text-sm text-white/50">What&apos;s working, what isn&apos;t, and what to improve next.</p>
      </div>

      {result.ok && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <GrowthScoreCard dashboardSummary={result.data.dashboardSummary} />
          <div className="sm:col-span-2">
            <RecommendationsListCard recommendations={result.data.recommendations} />
          </div>
        </div>
      )}

      <section className="rounded-2xl bg-white p-6 text-foreground shadow-sm">
        <SubAccountProvider subAccountId={saId} inAscendShell>
          <ReportsPage />
        </SubAccountProvider>
      </section>
    </div>
  );
}
