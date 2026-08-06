/**
 * Ascend OS Phase 2, Slice 6 — pure usage-limit evaluation engine. No
 * Firebase import. Builds the ENGINE only, per this slice's explicit
 * instruction — no real limit value is invented anywhere in this file.
 *
 * Real, existing usage counters this engine is designed to eventually
 * read from (confirmed by audit, not wired up this slice since no real
 * limit exists to compare against yet):
 *   - lib/ai-suite/usage.ts -- per-day {messages, actions} counters
 *   - lib/comms/usage.ts -- per-user monthly {email, sms} send counters
 * Both are tracking-only today (CLAUDE.md's own words: "No enforcement in
 * MVP"). This engine is what a future slice would wire a real plan limit
 * into, once one is defined by a product decision — not by this slice.
 */

import type { UsageLimitType, WorkspaceUsageStatus } from "@/types/workspace-entitlements";

/** limit === null means unlimited — the only state that exists in the
 *  repository today for every usage type. */
export function computeUsageStatus(type: UsageLimitType, used: number, limit: number | null): WorkspaceUsageStatus {
  if (limit === null) {
    return { type, used, limit: null, remaining: null, exhausted: false };
  }
  const remaining = Math.max(0, limit - used);
  return { type, used, limit, remaining, exhausted: used >= limit };
}

export function isUsageWithinLimit(status: WorkspaceUsageStatus): boolean {
  return !status.exhausted;
}
