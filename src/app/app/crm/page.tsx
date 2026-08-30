import Link from "next/link";
import { Calendar, MessageSquare, TrendingUp, CheckSquare, Users } from "lucide-react";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { composeBusinessHealthSummary } from "@/lib/intelligence/compose-business-health";
import { MetricCard, formatCents } from "@/components/ascend/metric-card";

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
  { href: "/app/grow/contacts", label: "Contacts", description: "Search, add, and manage every contact.", icon: Users },
  { href: "/app/grow/pipeline", label: "Pipeline", description: "Drag deals across stages.", icon: TrendingUp },
  { href: "/app/grow/tasks", label: "Tasks", description: "Today, overdue, upcoming, done.", icon: CheckSquare },
  { href: "/app/grow/calendar", label: "Calendar", description: "Events and bookings.", icon: Calendar },
  { href: "/app/grow/conversations", label: "Conversations", description: "SMS, WhatsApp, and inbox threads.", icon: MessageSquare },
];

export default async function CrmPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="CRM" description="No active workspace yet." links={[]} />;
  }

  // Operational snapshot — best-effort; the section still renders its
  // navigation if health data can't be composed right now.
  const health = await composeBusinessHealthSummary(saId).catch(() => null);
  const h = health?.data ?? null;
  const meta = health?.meta;

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">CRM</h1>
        <p className="mt-1 text-sm text-white/50">
          Your customers and the work in front of you — leads, pipeline, tasks and conversations at a glance, then the tools to work them.
        </p>
      </div>

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
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-white/40">Work your growth</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <s.icon className="h-4 w-4" />
              </span>
              <span className="font-medium text-white">{s.label}</span>
              <span className="text-xs text-white/50">{s.description}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
