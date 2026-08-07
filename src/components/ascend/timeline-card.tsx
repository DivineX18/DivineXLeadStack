import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import type { WithMeta, GrowthTimelineEntry } from "@/types/intelligence";

export function GrowthTimelineCard({ timeline, limit = 8 }: { timeline: WithMeta<GrowthTimelineEntry[]>; limit?: number }) {
  const items = (timeline.data ?? []).slice(0, limit);
  return (
    <AscendCardShell title="Growth Timeline" action={<IntelligenceStatusBadge meta={timeline.meta} />}>
      {items.length > 0 ? (
        <ol className="space-y-3">
          {items.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "hsl(var(--cobalt))" }} />
              <div>
                <p className="text-sm text-white/80">{entry.title}</p>
                <p className="text-xs text-white/40">{entry.kind} · {new Date(entry.occurredAt).toLocaleDateString()}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-white/40">No timeline events yet.</p>
      )}
    </AscendCardShell>
  );
}
