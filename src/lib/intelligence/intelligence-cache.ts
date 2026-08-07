import "server-only";

/**
 * Ascend OS Phase 2, Slice 9 — in-memory, per-process TTL cache for
 * Ascend Intelligence reads, deliberately independent from any CRM data
 * path. Same in-memory-per-instance tradeoff already accepted elsewhere in
 * this codebase (lib/funnels/checkout-rate-limit.ts,
 * lib/comms/web-chat/rate-limit.ts) — not a new pattern.
 *
 * Two TTL tiers: a short "fresh" window (served as status "ok"/"cached")
 * and a longer "stale-but-usable" window (served as status "stale" — still
 * shown to the user, clearly labeled, rather than blanked) after which the
 * entry is treated as a miss. This is what lets a Home card show "as of 4
 * minutes ago (stale)" instead of vanishing the moment Ascend hiccups.
 */

const FRESH_TTL_MS = 2 * 60 * 1000; // 2 minutes
const STALE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export type CacheReadResult<T> =
  | { hit: "fresh"; value: T; fetchedAt: number }
  | { hit: "stale"; value: T; fetchedAt: number }
  | { hit: "miss" };

export function readIntelligenceCache<T>(key: string): CacheReadResult<T> {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return { hit: "miss" };
  const age = Date.now() - entry.fetchedAt;
  if (age <= FRESH_TTL_MS) return { hit: "fresh", value: entry.value, fetchedAt: entry.fetchedAt };
  if (age <= STALE_TTL_MS) return { hit: "stale", value: entry.value, fetchedAt: entry.fetchedAt };
  store.delete(key);
  return { hit: "miss" };
}

export function writeIntelligenceCache<T>(key: string, value: T): void {
  store.set(key, { value, fetchedAt: Date.now() });
}

/** Test/diagnostic only — never called from application code paths. */
export function clearIntelligenceCache(): void {
  store.clear();
}

export function intelligenceCacheSize(): number {
  return store.size;
}
