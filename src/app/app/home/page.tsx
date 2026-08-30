import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { resolveHomeDashboard } from "@/lib/intelligence/intelligence-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { AscendCardShell } from "@/components/ascend/card-shell";
import { BusinessHealthCard } from "@/components/ascend/business-health-card";
import { GrowthScoreCard } from "@/components/ascend/growth-score-card";
import { formatCents } from "@/components/ascend/metric-card";
import { RecommendedNextActionCard } from "@/components/ascend/recommendation-card";
import { GrowthTimelineCard } from "@/components/ascend/timeline-card";
import { BusinessMemoryCard } from "@/components/ascend/memory-card";
import { LatestAssessmentCard, ReportsCard } from "@/components/ascend/assessment-cards";
import { PageHeader, ErrorState, SecondaryAction } from "@/components/divinex/ui";

/**
 * Home — PRODUCTION EXPERIENCE 2.0, Phase C.
 *
 * The data and its one sanctioned entry point (resolveHomeDashboard) are
 * unchanged. What changed is what the screen SAYS: it was eleven
 * identically-weighted cards in a flat grid, which forces the operator to
 * read all of it to find the one thing that matters.
 *
 * The order is now an argument:
 *   1. What should I do next        — the recommended action, given the lead.
 *   2. How is the business doing    — a compact numbers strip, scannable.
 *   3. What does DivineX know       — intelligence, present but recessive.
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
      <div className="mx-auto w-full max-w-6xl">
        <PageHeader title="Home" />
        <ErrorState
          title="We couldn't load your overview"
          body="Your data is safe — this is a problem reading it, not a problem with it. Your workspace is still fully usable."
          actions={
            <>
              <SecondaryAction href="/app/home">Try again</SecondaryAction>
              <SecondaryAction href={`/sa/${workspaceId}/dashboard`}>Open workspace dashboard</SecondaryAction>
            </>
          }
        />
      </div>
    );
  }

  const { businessHealth, intelligence, recommendedNextAction } = result.data;
  const health = businessHealth.data;

  const metrics: { label: string; value: string; sub?: string }[] = [
    {
      label: "Revenue this month",
      value: health ? formatCents(health.revenueThisMonthCents) : "—",
      sub: health ? `${health.wonDealsThisMonth} won` : undefined,
    },
    {
      label: "Open pipeline",
      value: health ? formatCents(health.openPipelineValueCents) : "—",
      sub: health ? `${health.openPipelineCount} deals` : undefined,
    },
    { label: "New leads this week", value: health ? String(health.newLeadsThisWeek) : "—" },
    {
      label: "Tasks due today",
      value: health ? String(health.dueTodayTaskCount) : "—",
      sub: health && health.overdueTaskCount > 0 ? `${health.overdueTaskCount} overdue` : undefined,
    },
    { label: "Upcoming appointments", value: health ? String(health.upcomingAppointmentCount) : "—" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Home"
        description="Where your business stands, and what to do about it."
        action={
          <Link
            href={`/sa/${workspaceId}/ai-suite`}
            className="dx-primary-action inline-flex items-center gap-2 rounded-[var(--dx-radius)] px-4 py-2.5 text-sm font-semibold"
          >
            <Sparkles className="h-4 w-4" />
            Ask Zeno
          </Link>
        }
      />

      {/* 1 — the lead. One thing to act on, given the most room. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecommendedNextActionCard action={recommendedNextAction} meta={intelligence.recommendations.meta} />
        </div>
        <GrowthScoreCard dashboardSummary={intelligence.dashboardSummary} />
      </div>

      {/* 2 — the numbers. A strip, not five equal cards competing with the lead. */}
      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>
          This week
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-[var(--dx-radius)] border p-4"
              style={{ backgroundColor: "var(--dx-surface-2)", borderColor: "var(--dx-border-subtle)" }}
            >
              <p className="text-[11px] leading-snug" style={{ color: "var(--dx-text-muted)" }}>
                {m.label}
              </p>
              <p
                className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums"
                style={{ color: "var(--dx-text-primary)" }}
              >
                {m.value}
              </p>
              {m.sub && (
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--dx-text-muted)" }}>
                  {m.sub}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 3 — what DivineX knows. Reference depth, deliberately quieter. */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>
            What we know about your business
          </h2>
          <Link
            href="/app/intelligence"
            className="inline-flex items-center gap-1 text-xs font-medium"
            style={{ color: "var(--dx-primary)" }}
          >
            All intelligence <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <BusinessHealthCard businessHealth={businessHealth} />
          <LatestAssessmentCard dashboardSummary={intelligence.dashboardSummary} />
          <GrowthTimelineCard timeline={intelligence.growthTimeline} limit={5} />
          <BusinessMemoryCard memory={intelligence.memory} />
          <ReportsCard reports={intelligence.reports} />
          <AscendCardShell title="Brand & assets" emphasis="quiet">
            <p className="text-sm" style={{ color: "var(--dx-text-secondary)" }}>
              The colours, logo and photography we use when we build anything for you.
            </p>
            <div className="mt-3">
              <Link
                href="/app/brand"
                className="inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: "var(--dx-primary)" }}
              >
                Review brand <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </AscendCardShell>
        </div>
      </section>
    </div>
  );
}
