import { cache } from "react";
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
 *
 * Found during final QA certification (2026-10-28): this badge renders on
 * Home multiple times (one per intelligence card), each instance reading
 * Date.now() fresh in a Server Component with no client hydration step of
 * its own. React's #418 ("text didn't match") is this exact documented
 * pattern verbatim -- "Variable input such as Date.now()... which changes
 * each time it's called" -- reproduced live on crm.divinex.io's real
 * production build (never reproduced on a local dev server, where
 * server+client share one clock with near-zero drift between repeated
 * evaluations of the same request). getNow() is memoized with React's
 * cache() so every relativeTime() call within ONE request sees the exact
 * same instant, however many times -- or however late in a streamed
 * response -- this component is evaluated.
 */
const getNow = cache(() => Date.now());

function relativeTime(fetchedAt: number): string {
  const seconds = Math.max(0, Math.round((getNow() - fetchedAt) / 1000));
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
    stale: `Stale, as of ${meta.fetchedAt ? relativeTime(meta.fetchedAt) : "earlier"}`,
    unavailable: "Unavailable",
    timeout: "Timed out",
    empty: "No data yet",
  };

  const tone: Record<Exclude<IntelligenceFetchMeta["status"], "ok">, string> = {
    cached: "text-[var(--dx-text-muted)]",
    stale: "text-amber-400",
    unavailable: "text-[var(--dx-text-muted)]",
    timeout: "text-amber-400",
    empty: "text-[var(--dx-text-muted)]",
  };

  return (
    <span className={`text-[11px] font-medium ${tone[meta.status]}`}>
      {label[meta.status]}
    </span>
  );
}
