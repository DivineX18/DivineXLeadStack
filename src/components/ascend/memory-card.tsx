import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import type { WithMeta, MemoryActionItem } from "@/types/intelligence";

/**
 * Corrected Slice 10.5: the real `/internal/intelligence/memory` endpoint
 * returns a raw array of `zenoMemory` rows — a recommendation/status
 * action-items list (`{recommendation, status}`), not the richer governed
 * `platform_memory` aggregate Slice 9 assumed (see the correction note in
 * `types/intelligence.ts`'s header). Replaces the invented
 * `BusinessMemorySummary{totalCount,approvedCount,recentItems}` shape.
 */
const STATUS_LABEL: Record<MemoryActionItem["status"], string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  skipped: "Skipped",
};

const STATUS_TONE: Record<MemoryActionItem["status"], string> = {
  pending: "text-white/50",
  in_progress: "text-amber-400",
  completed: "text-emerald-400",
  skipped: "text-white/30",
};

export function BusinessMemoryCard({ memory }: { memory: WithMeta<MemoryActionItem[]> }) {
  const items = memory.data ?? [];
  return (
    <AscendCardShell title="Business Memory" action={<IntelligenceStatusBadge meta={memory.meta} />}>
      {items.length > 0 ? (
        <>
          <p className="text-sm text-white/60">
            <span className="font-semibold text-white/85">{items.filter((i) => i.status === "completed").length}</span> completed of {items.length} action
            items
          </p>
          <ul className="mt-3 space-y-2">
            {items.slice(0, 5).map((item) => (
              <li key={item.id} className="rounded-lg border border-white/10 px-3 py-2">
                <p className={`text-xs uppercase tracking-wide ${STATUS_TONE[item.status]}`}>{STATUS_LABEL[item.status]}</p>
                <p className="mt-0.5 text-sm text-white/80">{item.recommendation}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-white/40">
          {memory.meta.reasonCode === "no_linked_business_profile" ? "Link a business profile to build Business Memory here." : "Nothing recorded yet."}
        </p>
      )}
    </AscendCardShell>
  );
}
