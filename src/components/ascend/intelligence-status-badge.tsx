import type { IntelligenceFetchMeta } from "@/types/intelligence";

/**
 * Ascend OS Phase 2, Slice 9 — shared status indicator for every
 * intelligence-derived card. Renders all 6 non-loading states the master
 * prompt requires (loading is handled at the route level via loading.tsx,
 * since this whole payload is composed server-side before the page
 * renders — there is no per-card independent fetch to show a spinner
 * for). "ok" renders nothing (the data speaks for itself); every other
 * state is always visible, never hidden, so a customer never mistakes
 * stale/unavailable data for current data.
 */
function relativeTime(fetchedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - fetchedAt) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function IntelligenceStatusBadge({ meta }: { meta: IntelligenceFetchMeta }) {
  if (meta.status === "ok") return null;

  const label: Record<Exclude<IntelligenceFetchMeta["status"], "ok">, string> = {
    cached: `Updated ${meta.fetchedAt ? relativeTime(meta.fetchedAt) : "recently"}`,
    stale: `Stale — as of ${meta.fetchedAt ? relativeTime(meta.fetchedAt) : "earlier"}`,
    unavailable: "Unavailable",
    timeout: "Timed out",
    empty: "No data yet",
  };

  const tone: Record<Exclude<IntelligenceFetchMeta["status"], "ok">, string> = {
    cached: "text-white/50",
    stale: "text-amber-400",
    unavailable: "text-white/40",
    timeout: "text-amber-400",
    empty: "text-white/40",
  };

  return (
    <span className={`text-[11px] font-medium ${tone[meta.status]}`}>
      {label[meta.status]}
    </span>
  );
}
