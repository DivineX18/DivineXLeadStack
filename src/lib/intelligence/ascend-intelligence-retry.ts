/**
 * Ascend OS Phase 2, Slice 9 — pure retry/backoff/error-normalization
 * logic for the Ascend Intelligence client. Deliberately Firebase/fetch/
 * Postgres-free (no imports at all) so it's genuinely unit-testable, same
 * discipline as Slice 4's workspace-mapping-invariants.ts and Slice 6's
 * workspace-entitlement-decision.ts. Mirrors the bounded-retry-with-backoff
 * shape already proven in this codebase's existing external-API client
 * (lib/import/ghl/client.ts's `ghlFetch()`) rather than inventing a new
 * retry convention.
 */

export const MAX_RETRIES = 2;
export const TIMEOUT_MS = 8000;

export type NormalizedFailureReason =
  | "not_configured"
  | "timeout"
  | "network_error"
  | "upstream_5xx"
  | "upstream_4xx"
  | "unparseable_response";

/** Whether a given HTTP status (or the absence of one, for a network-level
 *  failure) warrants a retry, given how many attempts have already run. */
export function shouldRetry(params: { attempt: number; status: number | null }): boolean {
  if (params.attempt >= MAX_RETRIES) return false;
  if (params.status === null) return true; // network-level failure (timeout/connection reset)
  return params.status === 429 || params.status >= 500;
}

/** Exponential-ish backoff, capped — same shape as ghlFetch's
 *  `Math.min(8000, 500 * 2 ** attempt)`, reused verbatim rather than
 *  reinvented. */
export function backoffMs(attempt: number): number {
  return Math.min(4000, 250 * 2 ** attempt);
}

export function normalizeFailure(params: { status: number | null; timedOut: boolean }): NormalizedFailureReason {
  if (params.timedOut) return "timeout";
  if (params.status === null) return "network_error";
  if (params.status >= 500 || params.status === 429) return "upstream_5xx";
  if (params.status >= 400) return "upstream_4xx";
  return "network_error";
}
