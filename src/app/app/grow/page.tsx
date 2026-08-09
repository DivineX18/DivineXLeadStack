import Link from "next/link";
import { Calendar, MessageSquare, TrendingUp, CheckSquare, Users } from "lucide-react";
import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";

/**
 * Ascend OS launch pass, Task C — Grow index. Links into the five native
 * (not placeholder) sub-sections: contacts, pipeline, tasks, calendar,
 * conversations — each mounts the real, unmodified Flow page component
 * inside Ascend chrome (see grow/contacts/page.tsx's doc comment for the
 * reuse pattern shared by all five).
 */
const SECTIONS = [
  { href: "/app/grow/contacts", label: "Contacts", description: "Search, add, and manage every contact.", icon: Users },
  { href: "/app/grow/pipeline", label: "Pipeline", description: "Drag deals across stages.", icon: TrendingUp },
  { href: "/app/grow/tasks", label: "Tasks", description: "Today, overdue, upcoming, done.", icon: CheckSquare },
  { href: "/app/grow/calendar", label: "Calendar", description: "Events and bookings.", icon: Calendar },
  { href: "/app/grow/conversations", label: "Conversations", description: "SMS, WhatsApp, and inbox threads.", icon: MessageSquare },
];

export default async function AscendGrowPage() {
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Grow" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Grow</h1>
        <p className="mt-1 text-sm text-white/50">Operational execution — contacts, pipeline, tasks, and conversations.</p>
      </div>

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
  );
}
