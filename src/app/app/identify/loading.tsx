function SkeletonCard() {
  return (
    <div
      className="h-32 animate-pulse rounded-2xl border border-white/10"
      style={{ background: "var(--glass-1)" }}
    />
  );
}

/** Ascend OS Phase 2, Slice 9 — same rationale as /app/home/loading.tsx. */
export default function AscendIdentifyLoading() {
  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-32 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-64 animate-pulse rounded bg-white/5" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
