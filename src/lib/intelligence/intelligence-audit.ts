import "server-only";

/**
 * Ascend OS Phase 2, Slice 9 (extended Slice 10) — observability for
 * Ascend Intelligence reads. Same philosophy as Slices 5-7's audit
 * modules: cheap, always-on console.warn for every notable event, PLUS
 * never logs user/business content — only shape-level facts (resource
 * name, status, duration, cache state, error CODE never message). No
 * contact/business name/PII, no raw response body, no raw error message
 * from an upstream call.
 *
 * Slice 10 adds the Flow-side half of the service bridge's required
 * observability (see INTELLIGENCE_SERVICE_BRIDGE_CONTRACT.md's
 * "Observability" section) — bridge_request_sent/bridge_envelope_ok/
 * bridge_envelope_error are what FLOW can observe about each bridge call;
 * the Ascend-side events (bridge_auth_success/failure, permission_denied,
 * business_missing) are specified in that document but cannot be
 * implemented here — they belong to code that doesn't exist yet.
 */

export type IntelligenceAuditEvent =
  | { kind: "cache_hit"; resource: string; cacheState: "fresh" | "stale" }
  | { kind: "cache_miss"; resource: string }
  | { kind: "fetch_success"; resource: string; durationMs: number }
  | { kind: "fetch_timeout"; resource: string; durationMs: number }
  | { kind: "fetch_failure"; resource: string; reasonCode: string; durationMs: number }
  | { kind: "not_configured"; resource: string }
  | { kind: "bridge_request_sent"; resource: string }
  | { kind: "bridge_envelope_ok"; resource: string; durationMs: number }
  | { kind: "bridge_envelope_error"; resource: string; errorCode: string; durationMs: number };

export function recordIntelligenceAuditEvent(event: IntelligenceAuditEvent): void {
  console.warn(`[intelligence-audit] ${event.kind} resource=${event.resource}`, event);
}
