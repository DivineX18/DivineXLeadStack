import Link from "next/link";
import { Send, Zap } from "lucide-react";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";

/**
 * Ascend OS launch pass, Task E — Launch index. Links into the two native
 * sub-sections: broadcasts and workflows — each mounts the real,
 * unmodified (or directly-reused-component) Flow surface inside Ascend
 * chrome.
 */
const SECTIONS = [
  { href: "/app/launch/broadcasts", label: "Broadcasts", description: "Bulk email campaigns — audience, status, delivery.", icon: Send },
  { href: "/app/launch/workflows", label: "Workflows", description: "Automation builder — triggers, steps, live runs.", icon: Zap },
];

export default async function AscendLaunchPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Launch" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Launch</h1>
        <p className="mt-1 text-sm text-white/50">Distribute and activate what you&apos;ve built.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
