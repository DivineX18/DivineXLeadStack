import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import type { WithMeta, BusinessMemorySummary } from "@/types/intelligence";

export function BusinessMemoryCard({ memory }: { memory: WithMeta<BusinessMemorySummary> }) {
  const data = memory.data;
  return (
    <AscendCardShell title="Business Memory" action={<IntelligenceStatusBadge meta={memory.meta} />}>
      {data && data.totalCount > 0 ? (
        <>
          <p className="text-sm text-white/60">
            <span className="font-semibold text-white/85">{data.approvedCount}</span> approved of {data.totalCount} total
          </p>
          <ul className="mt-3 space-y-2">
            {data.recentItems.slice(0, 5).map((item) => (
              <li key={item.id} className="rounded-lg border border-white/10 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-white/40">{item.memoryType.replace(/_/g, " ")}</p>
                <p className="mt-0.5 text-sm text-white/80">{item.summary}</p>
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
