/**
 * Ascend OS Phase 2, Slice 9 — the first `loading.tsx` anywhere in this
 * app (confirmed absent everywhere by Slice 8's own audit). Shown by
 * Next.js while resolveHomeDashboard()'s composed fetch (Flow + Ascend,
 * in parallel) is in flight — this IS the "loading" state the master
 * prompt's card-state checklist requires, implemented at the route level
 * since the whole payload is composed server-side before the page body
 * renders (no per-card independent client fetch to show a spinner for).
 */
function SkeletonCard() {
  return (
    <div
      className="h-32 animate-pulse rounded-2xl border border-white/10"
      style={{ background: "var(--glass-1)" }}
    />
  );
}

export default function AscendHomeLoading() {
  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-32 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-64 animate-pulse rounded bg-white/5" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
