import Link from "next/link";
import { Calendar, MessageSquare, TrendingUp, CheckSquare, Users } from "lucide-react";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { composeBusinessHealthSummary } from "@/lib/intelligence/compose-business-health";
import { MetricCard, formatCents } from "@/components/ascend/metric-card";
import { PageHeader } from "@/components/divinex/ui";

/**
 * DivineX Production Experience 2.0 — CRM (formerly the "Grow" index;
 * /app/grow now redirects here and the sub-routes below are unchanged).
 * Elevated from a bare nav grid to the North Star's
 * lifecycle-section shape: context -> operational insight -> execution tools.
 * The operational snapshot reuses composeBusinessHealthSummary() (the exact
 * wrapper the Home dashboard composes) and MetricCard — no new backend, no
 * new component. The five sub-sections each mount the real, unmodified Flow
 * page component inside Ascend chrome (see grow/contacts/page.tsx).
 */
const SECTIONS = [
  { href: "/leads/contacts", label: "Contacts", description: "Search, add, and manage every contact.", icon: Users },
  { href: "/leads/pipeline", label: "Pipeline", description: "Drag deals across stages.", icon: TrendingUp },
  { href: "/leads/tasks", label: "Tasks", description: "Today, overdue, upcoming, done.", icon: CheckSquare },
  { href: "/leads/calendar", label: "Calendar", description: "Events and bookings.", icon: Calendar },
  { href: "/leads/conversations", label: "Conversations", description: "SMS, WhatsApp, and inbox threads.", icon: MessageSquare },
];

export default async function LeadsPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Leads" description="No active workspace yet." links={[]} />;
  }

  // Operational snapshot — best-effort; the section still renders its
  // navigation if health data can't be composed right now.
  const health = await composeBusinessHealthSummary(saId).catch(() => null);
  const h = health?.data ?? null;
  const meta = health?.meta;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        title="Leads"
        description="Who to talk to next — leads, pipeline, tasks and conversations at a glance, then the tools to work them."
      />

      {/* Operational insight — the "where do things stand" layer before the tools */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="New Leads (this week)"
          value={h ? String(h.newLeadsThisWeek) : "—"}
          meta={meta}
        />
        <MetricCard
          label="Open Pipeline"
          value={h ? formatCents(h.openPipelineValueCents) : "—"}
          subLabel={h ? `${h.openPipelineCount} open deals` : undefined}
          meta={meta}
        />
        <MetricCard
          label="Tasks Due Today"
          value={h ? String(h.dueTodayTaskCount) : "—"}
          subLabel={h ? `${h.overdueTaskCount} overdue` : undefined}
          meta={meta}
        />
        <MetricCard
          label="Upcoming Appointments"
          value={h ? String(h.upcomingAppointmentCount) : "—"}
          meta={meta}
        />
      </div>

      {/* Execution tools */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>Work your growth</h2>
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
      </div>
    </div>
  );
}
