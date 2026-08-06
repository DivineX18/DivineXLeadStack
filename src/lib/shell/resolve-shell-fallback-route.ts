import type { SessionState } from "@/types/identity";

/**
 * Ascend OS Phase 2, Slice 8 — pure. Where the `/app/*` shell route group
 * sends a caller who doesn't qualify for "full_ascend" mode (feature-
 * flagged off, wrong domain, crm_only entitlement tier, inactive session,
 * etc). Never renders any Ascend UI to a non-qualifying caller — always
 * bounces into Flow's EXISTING, unmodified surfaces, so this slice cannot
 * regress any current customer's workflow.
 */
export function decideShellFallbackRoute(input: { sessionState: SessionState; workspaceId: string | null }): string {
  if (input.sessionState !== "active") return "/login";
  if (input.workspaceId) return `/sa/${input.workspaceId}/dashboard`;
  return "/agency";
}
