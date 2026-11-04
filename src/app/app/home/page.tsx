import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { resolveHomeDashboard } from "@/lib/intelligence/intelligence-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { AscendCardShell } from "@/components/ascend/card-shell";
import { BusinessHealthCard } from "@/components/ascend/business-health-card";
import { GrowthScoreCard } from "@/components/ascend/growth-score-card";
import { MetricStrip, formatCents, type StripMetric } from "@/components/ascend/metric-card";
import { RecommendedNextActionCard } from "@/components/ascend/recommendation-card";
import { GrowthTimelineCard } from "@/components/ascend/timeline-card";
import { GrowthPlanCard } from "@/components/ascend/growth-plan-card";
import { resolveGrowthPlanExecution } from "@/lib/intelligence/growth-plan-execution";
import { BusinessMemoryCard } from "@/components/ascend/memory-card";
import { LatestAssessmentCard, ReportsCard } from "@/components/ascend/assessment-cards";
import { AscendSectionPage, type AscendBand } from "@/components/ascend/section-page";
import { PageHeader, ErrorState, SecondaryAction } from "@/components/divinex/ui";

/**
 * Home.
 *
 * The data and its one sanctioned entry point (resolveHomeDashboard) are
 * unchanged. What changed, in two passes:
 *
 * First, the order became an argument rather than eleven
 * identically-weighted cards in a flat grid:
 *   1. What should I do next        — the recommended action, given the lead.
 *   2. How is the business doing    — a compact numbers strip, scannable.
 *   3. What does DivineX know       — intelligence, present but recessive.
 *
 * Then this page stopped being the only one composed that way. Home's
 * container, header, eyebrow headings, band rhythm and numbers strip were
 * hand-written here, so the other six lifecycle sections either re-derived
 * them or improvised; they are now AscendSectionPage and MetricStrip, and
 * Home composes through the same primitive it donated.
 *
 * The growth plan stays where it was, between the lead and the numbers, and
 * the band it declares says why: it holds items blocked on the customer, so
 * it answers "what should I do next" rather than reporting progress.
 */
export default async function AscendHomePage() {
  const shell = await resolveShellContextForPage();
  const uid = shell?.identity.session.user?.uid ?? null;
  const workspaceId = shell?.workspace?.workspaceId ?? null;

  if (!uid || !workspaceId) {
    return (
      <AscendSectionPlaceholder
        title="Home"
        description="No active workspace yet, once you're linked to one, your growth overview will appear here."
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
          body="Your data is safe. This is a problem reading it, not a problem with it. Your workspace is still fully usable."
          // NON-ENUMERATION / NO TENANT-SPECIFIC LINKS. This error state is
          // reachable on a path where the requested workspace may not be one
          // the caller can access, so it must not construct a
          // workspace-specific URL: doing so echoes a tenant identifier into
          // a denied response and hands an unauthorized caller a live link.
          // "Try again" and the workspace picker are both tenant-neutral.
          actions={
            <>
              <SecondaryAction href="/">Try again</SecondaryAction>
              <SecondaryAction href="/agency">Choose a workspace</SecondaryAction>
            </>
          }
        />
      </div>
    );
  }

  const { businessHealth, intelligence, recommendedNextAction } = result.data;
  // Execution half of the plan. Best-effort: a read failure must not take
  // down Home, which is the customer's primary orientation surface.
  const growthPlanItems = await resolveGrowthPlanExecution(workspaceId).catch(() => []);
  const health = businessHealth.data;

  const metrics: StripMetric[] = [
    {
      label: "Revenue this month",
      value: health ? formatCents(health.revenueThisMonthCents) : "-",
      subLabel: health ? `${health.wonDealsThisMonth} won` : undefined,
    },
    {
      label: "Open pipeline",
      value: health ? formatCents(health.openPipelineValueCents) : "-",
      subLabel: health ? `${health.openPipelineCount} deals` : undefined,
    },
    { label: "New leads this week", value: health ? String(health.newLeadsThisWeek) : "-" },
    {
      label: "Tasks due today",
      value: health ? String(health.dueTodayTaskCount) : "-",
      subLabel: health && health.overdueTaskCount > 0 ? `${health.overdueTaskCount} overdue` : undefined,
    },
    { label: "Upcoming appointments", value: health ? String(health.upcomingAppointmentCount) : "-" },
  ];

  const bands: AscendBand[] = [
    // 1 — CONTEXT. One thing to act on, given the most room.
    {
      role: "context",
      content: (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecommendedNextActionCard action={recommendedNextAction} meta={intelligence.recommendations.meta} />
          </div>
          <GrowthScoreCard dashboardSummary={intelligence.dashboardSummary} />
        </div>
      ),
    },

    // 1b — STILL CONTEXT, deliberately, and this is the one judgement call
    // in Home's composition. What has been built, what needs review, and
    // what happens next for work underway, so the customer never
    // reconstructs that from chat history or the Create library. A
    // read-time projection over the artifact's own state, so it cannot
    // drift out of agreement with it.
    //
    // It reads as a "progress" band by name, and declaring it one is what
    // the canonical order would want. But growth-plan-execution gives an
    // item the stage `needs_you` ("Built, ready for your review"), which is
    // not a progress report: it is work sitting blocked on the customer.
    // Home's own argument is "what should I do next / how is the business
    // doing / what do we know", and a needs-review item belongs to the
    // first of those, not the second. Five metrics above it would mean
    // skimming numbers before learning that something is waiting on you.
    {
      role: "context",
      label: "Work underway",
      content: <GrowthPlanCard items={growthPlanItems} />,
    },

    // 2 — INSIGHTS. A strip, not five equal cards competing with the lead.
    {
      role: "insights",
      label: "This week",
      content: <MetricStrip metrics={metrics} meta={businessHealth.meta} />,
    },

    // 4 — EXECUTION. What DivineX knows: reference depth, deliberately
    // quieter and last.
    {
      role: "execution",
      label: "What we know about your business",
      href: "/intelligence",
      hrefLabel: "All intelligence",
      content: (
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
                href="/brand"
                className="inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: "var(--dx-primary)" }}
              >
                Review brand <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </AscendCardShell>
        </div>
      ),
    },
  ];

  return (
    <AscendSectionPage
      title="Home"
      description="Where your business stands, and what to do about it."
      bands={bands}
    />
  );
}
