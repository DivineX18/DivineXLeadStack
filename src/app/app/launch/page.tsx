import Link from "next/link";
import { Send, Zap } from "lucide-react";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { resolveIntelligenceSnapshot } from "@/lib/intelligence/intelligence-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { RecommendedNextActionCard } from "@/components/ascend/recommendation-card";

/**
 * Ascend OS — Launch index. Elevated to the lifecycle-section shape:
 * context -> what to launch next (real Ascend recommendation, same
 * resolveIntelligenceSnapshot() Home/Optimize use — no invented metric)
 * -> execution tools. The two sub-sections each mount the real Flow surface
 * (broadcasts, workflows) inside Ascend chrome.
 */
const SECTIONS = [
  { href: "/app/launch/broadcasts", label: "Broadcasts", description: "Bulk email campaigns — audience, status, delivery.", icon: Send },
  { href: "/app/launch/workflows", label: "Workflows", description: "Automation builder — triggers, steps, live runs.", icon: Zap },
];

export default async function AscendLaunchPage() {
  const shell = await resolveShellContextForPage();
  const uid = shell?.identity.session.user?.uid ?? null;
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Launch" description="No active workspace yet." links={[]} />;
  }

  // Best-effort: surface the single highest-priority recommendation as the
  // "what to launch next" cue. Never blocks the section from rendering.
  const snapshot = uid ? await resolveIntelligenceSnapshot(uid, saId).catch(() => null) : null;
  const recommendedAction =
    snapshot?.ok ? (snapshot.data.recommendations.data?.[0] ?? null) : null;

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Launch</h1>
        <p className="mt-1 text-sm text-white/50">
          Put what you&apos;ve built in front of people — campaigns and automations that go to work for you.
        </p>
      </div>

      {recommendedAction && snapshot?.ok && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RecommendedNextActionCard
            action={recommendedAction}
            meta={snapshot.data.recommendations.meta}
          />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-white/40">Distribute &amp; activate</h2>
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
    </div>
  );
}
