import "server-only";

/**
 * Ascend OS Phase 2, Slice 9 — observability for Ascend Intelligence reads.
 * Same philosophy as Slices 5-7's audit modules: cheap, always-on
 * console.warn for every notable event, PLUS never logs user/business
 * content — only shape-level facts (resource name, status, duration,
 * cache state). No contact/business name/PII, no raw response body, no
 * raw error message from an upstream call (only a short reason code).
 */

export type IntelligenceAuditEvent =
  | { kind: "cache_hit"; resource: string; cacheState: "fresh" | "stale" }
  | { kind: "cache_miss"; resource: string }
  | { kind: "fetch_success"; resource: string; durationMs: number }
  | { kind: "fetch_timeout"; resource: string; durationMs: number }
  | { kind: "fetch_failure"; resource: string; reasonCode: string; durationMs: number }
  | { kind: "not_configured"; resource: string };

export function recordIntelligenceAuditEvent(event: IntelligenceAuditEvent): void {
  console.warn(`[intelligence-audit] ${event.kind} resource=${event.resource}`, event);
}
