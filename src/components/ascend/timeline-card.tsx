import { AscendCardShell } from "@/components/ascend/card-shell";
import { IntelligenceStatusBadge } from "@/components/ascend/intelligence-status-badge";
import type { WithMeta, GrowthTimeline } from "@/types/intelligence";

/**
 * Corrected Slice 10.5: the real `growth-timeline` endpoint returns ONE
 * scan-to-scan comparison object (`businessEvolution` + `categoryDeltas`
 * + `recommendationProgress`), not a chronological list of generic
 * events — that's a different, unrelated concept
 * (`DashboardSummary.lastFiveTimeline`, not yet surfaced by a dedicated
 * card). Replaces Slice 9's invented `GrowthTimelineEntry[]` list shape.
 * 404s when fewer than 2 scans exist for the profile — surfaced by the
 * client as `status: "empty"`, rendered here as the same honest
 * "not enough scans yet" state.
 */
const DIRECTION_TONE: Record<"improved" | "declined" | "no_change", string> = {
  improved: "text-emerald-400",
  declined: "text-red-400",
  no_change: "text-white/50",
};

export function GrowthTimelineCard({ timeline, limit = 5 }: { timeline: WithMeta<GrowthTimeline>; limit?: number }) {
  const data = timeline.data;
  return (
    <AscendCardShell title="Growth Timeline" action={<IntelligenceStatusBadge meta={timeline.meta} />}>
      {data ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight" style={{ color: "hsl(var(--jade))" }}>
              {Math.round(data.businessEvolution.currentOverallScore)}
            </span>
            <span className={`text-xs font-medium ${DIRECTION_TONE[data.businessEvolution.direction]}`}>
              {data.businessEvolution.direction === "improved" ? "+" : data.businessEvolution.direction === "declined" ? "−" : "±"}
              {Math.abs(data.businessEvolution.difference)} vs. previous scan
            </span>
          </div>
          {data.businessEvolution.summary && <p className="mt-2 text-xs text-white/60">{data.businessEvolution.summary}</p>}
          {data.categoryDeltas.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {data.categoryDeltas.slice(0, limit).map((c) => (
                <li key={c.key} className="flex items-center justify-between text-xs text-white/50">
                  <span>{c.label}</span>
                  <span className={DIRECTION_TONE[c.direction === "improved" ? "improved" : c.direction === "declined" ? "declined" : "no_change"]}>
                    {c.difference > 0 ? "+" : ""}
                    {c.difference}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : timeline.meta.status === "empty" ? (
        <p className="text-sm text-white/40">Run a second Growth Scan to see how your score changes over time.</p>
      ) : (
        <p className="text-sm text-white/40">No timeline available yet.</p>
      )}
    </AscendCardShell>
  );
}
