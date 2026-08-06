import type { ShellMode, ShellModeSignals } from "@/types/ascend-shell";

/**
 * Ascend OS Phase 2, Slice 8 — the single, pure shell-mode decision
 * function. No Firestore, no `next/headers`, no `process.env` read here —
 * every input is passed in by the orchestrator (resolve-shell-context.ts),
 * so this is genuinely unit-testable (see
 * scripts/verify-shell-mode-decision.mts).
 *
 * Fail-closed contract (per this slice's explicit instruction — "unknown
 * or inconsistent state must fail to the current CRM-only experience, not
 * expose Full Ascend features"): "full_ascend" requires ALL of —
 *   1. the request is actually on the Ascend domain (hostname match), AND
 *   2. the caller's workspace entitlement tier is genuinely "full_ascend"
 *      (Slice 6's evaluateWorkspaceEntitlements — never guessed), AND
 *   3. the "unified_shell" progressive-rollout flag (Slice 2) is on for
 *      this caller/workspace.
 * Any missing/ambiguous signal — no hostname available, no known Ascend
 * hostname configured, no active workspace, flag off — falls through to
 * "crm_only". A dev/test override is honored ONLY outside production, and
 * only as an explicit escape hatch (mirrors the "explicit development/test
 * overrides" instruction) — it can never fire in production even if
 * accidentally left set, because `isProduction` is asserted first.
 */
export function decideShellMode(signals: ShellModeSignals): ShellMode {
  if (!signals.isProduction && signals.devOverride) {
    return signals.devOverride;
  }

  if (!signals.hostname || !signals.ascendHostname) {
    return "crm_only";
  }

  const onAscendDomain = signals.hostname === signals.ascendHostname;
  const entitledToFullAscend = signals.workspaceTier === "full_ascend";

  if (onAscendDomain && entitledToFullAscend && signals.unifiedShellFlagEnabled) {
    return "full_ascend";
  }

  return "crm_only";
}
