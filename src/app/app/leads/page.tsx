import Link from "next/link";
import { AlertTriangle, ArrowRight, Calendar, MessageSquare, TrendingUp, CheckSquare, Users } from "lucide-react";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { composeBusinessHealthSummary } from "@/lib/intelligence/compose-business-health";
import { composeRecentLeads } from "@/lib/intelligence/compose-recent-leads";
import { MetricStrip, formatCents } from "@/components/ascend/metric-card";
import { AscendCardShell } from "@/components/ascend/card-shell";
import { AscendSectionPage, type AscendBand } from "@/components/ascend/section-page";
import { sourceLabel } from "@/components/contacts/source-badge";
import { PIPELINE_STAGES } from "@/types/deals";

/**
 * LEADS — formerly the "Grow" index; /app/grow now redirects here and the
 * sub-routes below are unchanged.
 *
 * Elevated from a bare nav grid to the North Star's lifecycle-section shape,
 * and now composed through AscendSectionPage so the order is enforced rather
 * than hand-maintained. The numbers reuse composeBusinessHealthSummary (the
 * exact wrapper Home and Performance compose) and MetricCard, so the three
 * pages cannot disagree. The five sub-sections each mount the real,
 * unmodified Flow page component inside Ascend chrome (see
 * grow/contacts/page.tsx).
 *
 * The activity band is new, and it is the point of this pass: the page's own
 * description promised "who to talk to next" and then showed four counters
 * and a grid of links, so the question it named took a click to answer.
 */
const SECTIONS = [
  { href: "/leads/contacts", label: "Contacts", description: "Search, add, and manage every contact.", icon: Users },
  { href: "/leads/pipeline", label: "Pipeline", description: "Drag deals across stages.", icon: TrendingUp },
  { href: "/leads/tasks", label: "Tasks", description: "Today, overdue, upcoming, done.", icon: CheckSquare },
  { href: "/leads/calendar", label: "Calendar", description: "Events and bookings.", icon: Calendar },
  { href: "/leads/conversations", label: "Conversations", description: "SMS, WhatsApp, and inbox threads.", icon: MessageSquare },
];

const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.id, s.label]),
);

const DESCRIPTION =
  "Who to talk to next, leads, pipeline, tasks and conversations at a glance, then the tools to work them.";

export default async function LeadsPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Leads" description="No active workspace yet." links={[]} />;
  }

  // Both best-effort and independent: the section still renders its tools if
  // either read fails, and one failing never empties the other.
  const [health, leads] = await Promise.all([
    composeBusinessHealthSummary(saId).catch(() => null),
    composeRecentLeads(saId).catch(() => null),
  ]);
  const h = health?.data ?? null;
  const meta = health?.meta;
  const recent = leads?.data?.recent ?? [];

  const executionBand: AscendBand = {
    role: "execution",
    label: "Work your growth",
    content: (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex flex-col gap-2 rounded-[var(--dx-radius-lg)] border p-5 transition-colors hover:border-[var(--dx-border-active)] motion-reduce:transition-none"
            style={{ backgroundColor: "var(--dx-surface-2)", borderColor: "var(--dx-border-subtle)" }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--dx-radius-sm)]" style={{ backgroundColor: "var(--dx-primary-subtle)", color: "var(--dx-primary)" }}>
              <s.icon className="h-4 w-4" />
            </span>
            <span className="font-medium" style={{ color: "var(--dx-text-primary)" }}>{s.label}</span>
            <span className="text-xs" style={{ color: "var(--dx-text-secondary)" }}>{s.description}</span>
          </Link>
        ))}
      </div>
    ),
  };

  const bands: AscendBand[] = [];

  // 1 — CONTEXT. Stated only from numbers that actually read: a health read
  // failure drops this band rather than printing a sentence about zero, and
  // "the newest leads are below" is keyed to the activity band EXISTING, not
  // to the week's count. Those came apart in the first render test -- the
  // ordered contacts read was failing on a missing index, so the band was
  // absent while the sentence above it pointed at it.
  if (h) {
    bands.push({
      role: "context",
      content: (
        <AscendCardShell
          title={
            h.newLeadsThisWeek > 0
              ? `${h.newLeadsThisWeek} new lead${h.newLeadsThisWeek === 1 ? "" : "s"} this week`
              : "No new leads this week"
          }
        >
          <p className="text-sm text-[var(--dx-text-secondary)]">
            {h.overdueTaskCount > 0
              ? `${h.overdueTaskCount} follow-up${h.overdueTaskCount === 1 ? " is" : "s are"} overdue. Those are the fastest thing to fix today.`
              : h.dueTodayTaskCount > 0
                ? `${h.dueTodayTaskCount} follow-up${h.dueTodayTaskCount === 1 ? " is" : "s are"} due today, and nothing is overdue.`
                : recent.length > 0
                  ? "Nothing is overdue. The newest leads are below."
                  : "Nothing is overdue and nothing is due today. A live funnel or a campaign is what changes the top number."}
          </p>
        </AscendCardShell>
      ),
    });
  }

  // 2 — INSIGHTS.
  bands.push({
    role: "insights",
    label: "Where things stand",
    content: (
      <MetricStrip
        meta={meta}
        metrics={[
          { label: "New leads (this week)", value: h ? String(h.newLeadsThisWeek) : "-" },
          {
            label: "Open pipeline",
            value: h ? formatCents(h.openPipelineValueCents) : "-",
            subLabel: h ? `${h.openPipelineCount} open deals` : undefined,
          },
          {
            label: "Tasks due today",
            value: h ? String(h.dueTodayTaskCount) : "-",
            subLabel: h ? `${h.overdueTaskCount} overdue` : undefined,
          },
          { label: "Upcoming appointments", value: h ? String(h.upcomingAppointmentCount) : "-" },
        ]}
      />
    ),
  });

  // 3 — ACTIVITY. Omitted when there is none: an empty band teaches the
  // customer that the section is decorative.
  if (recent.length > 0) {
    bands.push({
      role: "activity",
      label: "Newest leads",
      href: "/leads/contacts",
      hrefLabel: "All contacts",
      content: (
        <AscendCardShell emphasis="quiet">
          <ul className="divide-y" style={{ borderColor: "var(--dx-border-subtle)" }}>
            {recent.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <Link href={l.href} className="block truncate text-sm text-[var(--dx-text-primary)]">
                    {l.name}
                  </Link>
                  {l.detail && l.detail !== l.name && (
                    <p className="truncate text-xs text-[var(--dx-text-muted)]">{l.detail}</p>
                  )}
                </div>
                {l.stage && STAGE_LABEL[l.stage] && (
                  <span className="shrink-0 text-xs" style={{ color: "var(--dx-text-muted)" }}>
                    {STAGE_LABEL[l.stage]}
                  </span>
                )}
                {l.source && (
                  <span className="hidden shrink-0 text-xs sm:inline" style={{ color: "var(--dx-text-muted)" }}>
                    {sourceLabel(l.source)}
                  </span>
                )}
                {l.at !== null && (
                  <time
                    className="shrink-0 text-xs text-[var(--dx-text-muted)]"
                    dateTime={new Date(l.at).toISOString()}
                  >
                    {new Date(l.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </time>
                )}
              </li>
            ))}
          </ul>
        </AscendCardShell>
      ),
    });
  }

  // 4 — RECOMMENDATIONS. One real condition, or the band is absent.
  if (h && h.overdueTaskCount > 0) {
    bands.push({
      role: "recommendations",
      label: "What needs attention",
      content: (
        <AscendCardShell emphasis="quiet">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dx-text-muted)]" aria-hidden="true" />
            <p className="text-sm text-[var(--dx-text-secondary)]">
              {h.overdueTaskCount} follow-up{h.overdueTaskCount === 1 ? " is" : "s are"} past due.
              <Link
                href="/leads/tasks"
                className="ml-1.5 inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: "var(--dx-primary)" }}
              >
                Open Tasks <ArrowRight className="h-3 w-3" />
              </Link>
            </p>
          </div>
        </AscendCardShell>
      ),
    });
  }

  bands.push(executionBand);

  return <AscendSectionPage title="Leads" description={DESCRIPTION} bands={bands} />;
}
