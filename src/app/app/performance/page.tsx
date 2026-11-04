import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { composeBusinessHealthSummary } from "@/lib/intelligence/compose-business-health";
import { MetricStrip, formatCents } from "@/components/ascend/metric-card";
import { AscendCardShell } from "@/components/ascend/card-shell";
import { AscendSectionPage, type AscendBand } from "@/components/ascend/section-page";
import { FunnelPerformancePanel } from "@/components/divinex/funnel-performance-panel";
import { GoogleMetricsCard } from "@/components/dashboard/google-metrics-card";
import { EmailActivitySummary } from "@/components/email/email-activity-summary";
import { SubAccountProvider } from "@/context/sub-account-context";

export const dynamic = "force-dynamic";

/**
 * PERFORMANCE — P0.3. Answers "what's happening?" in BUSINESS outcomes.
 *
 * Deliberately not a GA4 rebuild: revenue, pipeline, leads and conversion,
 * not sessions and bounce rates. Reuses composeBusinessHealthSummary — the
 * same wrapper Home and Leads compose — rather than adding a second
 * analytics path that could disagree with them.
 *
 * Composed through AscendSectionPage as of the Priority 2 pass, which fixed
 * two things an audit of the rendered page turned up. The band labels here
 * were styled <p> elements, so the densest page in the product rendered
 * exactly one heading and gave a screen reader no structure at all;
 * BandHeading emits a real <h2>. And "What needs attention" sat at the very
 * bottom, underneath three panels of tooling, which is the inversion the
 * North Star names: execution should support the experience, not become it.
 */
export default async function PerformancePage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;
  if (!saId) {
    return <AscendSectionPlaceholder title="Performance" description="No active workspace yet." links={[]} />;
  }

  const health = await composeBusinessHealthSummary(saId).catch(() => null);
  const h = health?.data ?? null;
  const meta = health?.meta;

  const bands: AscendBand[] = [];

  // 1 — CONTEXT. The headline outcome in a sentence, only when it was read.
  if (h) {
    bands.push({
      role: "context",
      content: (
        <AscendCardShell
          title={
            h.revenueThisMonthCents > 0
              ? `${formatCents(h.revenueThisMonthCents)} won this month`
              : "Nothing closed this month yet"
          }
        >
          <p className="text-sm text-[var(--dx-text-secondary)]">
            {h.revenueThisMonthCents > 0
              ? `From ${h.wonDealsThisMonth} deal${h.wonDealsThisMonth === 1 ? "" : "s"}, with ${formatCents(h.openPipelineValueCents)} still open across ${h.openPipelineCount} deal${h.openPipelineCount === 1 ? "" : "s"}.`
              : h.openPipelineCount > 0
                ? `${formatCents(h.openPipelineValueCents)} is open across ${h.openPipelineCount} deal${h.openPipelineCount === 1 ? "" : "s"}. Moving one of those to Won is what changes this number.`
                : "There are no open deals, so there is nothing in flight to close. Leads come first."}
          </p>
        </AscendCardShell>
      ),
    });
  }

  // 2 — INSIGHTS. The shared strip rather than the byte-identical copy of
  // Home's markup that used to live here, so a read failure is explained in
  // one place instead of showing four bare dashes that look like zeroes.
  bands.push({
    role: "insights",
    label: "Outcomes",
    content: (
      <MetricStrip
        meta={meta}
        metrics={[
          {
            label: "Revenue this month",
            value: h ? formatCents(h.revenueThisMonthCents) : "-",
            subLabel: h ? `${h.wonDealsThisMonth} won` : undefined,
          },
          {
            label: "Open pipeline",
            value: h ? formatCents(h.openPipelineValueCents) : "-",
            subLabel: h ? `${h.openPipelineCount} deals` : undefined,
          },
          { label: "New leads this week", value: h ? String(h.newLeadsThisWeek) : "-" },
          { label: "Upcoming appointments", value: h ? String(h.upcomingAppointmentCount) : "-" },
        ]}
      />
    ),
  });

  // 3 — RECOMMENDATIONS. Above the tooling, not under it.
  bands.push({
    role: "recommendations",
    label: "What needs attention",
    content: (
      <AscendCardShell emphasis="quiet">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dx-text-muted)]" aria-hidden="true" />
          <p className="text-sm text-[var(--dx-text-secondary)]">
            {h && h.overdueTaskCount > 0
              ? `${h.overdueTaskCount} follow-up${h.overdueTaskCount === 1 ? " is" : "s are"} overdue. Those are the fastest thing to fix today.`
              : h
                ? "Nothing is overdue right now. Ask Zeno what would move the needle next."
                : "We couldn't read your pipeline just now, so there is nothing to judge from. Your data is safe and the panels below read independently."}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <Link href="/leads" className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--dx-primary)" }}>
            Go to Leads <ArrowRight className="h-3 w-3" />
          </Link>
          <Link href="/intelligence" className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--dx-primary)" }}>
            Why is this happening? <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </AscendCardShell>
    ),
  });

  // 4 — EXECUTION. The three detail panels, unchanged.
  bands.push({
    role: "execution",
    label: "The detail behind it",
    content: (
      <div className="space-y-6">
        <FunnelPerformancePanel subAccountId={saId} />

        {/* Traffic and search performance from the workspace's connected
            Google account. Renders nothing until a connection has synced, so
            a workspace not using it sees no empty card.
            The provider is REQUIRED: the card reads the active workspace via
            useSubAccount(), which THROWS when no provider is mounted — and a
            throw in a client component takes the whole page to the error
            boundary, which is exactly what it did. Same wrapper /app/settings
            uses for the same reason. */}
        <SubAccountProvider subAccountId={saId} inAscendShell>
          <GoogleMetricsCard variant="ascend" />
        </SubAccountProvider>

        {/* Outbound email. A summary with the detail one click away, because
            "did that go out, and did they read it" is a question operators
            ask far more often than they want a full table on this page. */}
        <SubAccountProvider subAccountId={saId} inAscendShell>
          <EmailActivitySummary />
        </SubAccountProvider>
      </div>
    ),
  });

  return (
    <AscendSectionPage
      title="Performance"
      description="What's actually happening in the business: the outcomes, and the traffic behind them."
      bands={bands}
    />
  );
}
