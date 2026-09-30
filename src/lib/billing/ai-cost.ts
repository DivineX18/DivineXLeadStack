import "server-only";

import { checkPlanLimit, recordPlanUsage } from "@/lib/billing/plan-limits";

/**
 * Token → USD for the AI spend ceiling.
 *
 * Mirrors the BI repo's `lib/ai/pricing.ts`. Two services, two runtimes, no
 * shared package between them, so the table is duplicated deliberately
 * rather than inventing an engine to share five numbers. If Anthropic
 * republishes, both files change.
 *
 * Rates are per MILLION tokens, USD. Model ids arrive OpenRouter-prefixed
 * ("anthropic/claude-haiku-4-5"), so lookup strips the vendor segment.
 */
const RATES: Record<string, { inPerM: number; outPerM: number }> = {
  "claude-haiku-4-5": { inPerM: 1, outPerM: 5 },
  "claude-sonnet-4-5": { inPerM: 3, outPerM: 15 },
  "claude-opus-4-5": { inPerM: 5, outPerM: 25 },
  "claude-opus-4-8": { inPerM: 5, outPerM: 25 },
  "gpt-4o-mini": { inPerM: 0.15, outPerM: 0.6 },
};

/** An unknown model bills at a Sonnet-class rate rather than zero, so a
 *  newly-added model shows up as real cost instead of silently free. */
const DEFAULT_RATE = { inPerM: 3, outPerM: 15 };

export function computeAiCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const bare = (model ?? "").split("/").pop() ?? "";
  const rate = RATES[bare] ?? DEFAULT_RATE;
  return (Math.max(0, inputTokens) * rate.inPerM + Math.max(0, outputTokens) * rate.outPerM) / 1_000_000;
}

/**
 * May this workspace start another AI call?
 *
 * Checked BEFORE the provider is called, because the cost is incurred the
 * moment the request is sent. A workspace with no plan, or a plan predating
 * the ceiling, is unlimited.
 *
 * `subAccountId` is null for calls that belong to no workspace (the agency
 * setup guide). Those are not metered: there is no customer to charge them
 * to, and they are operator actions, not product usage.
 */
export async function aiSpendAllowed(subAccountId: string | null): Promise<
  { allowed: true } | { allowed: false; message: string }
> {
  if (!subAccountId) return { allowed: true };
  // amount 0: "am I already over?", asked before a call whose cost is not
  // yet known. Spend is recorded after the fact, so the ceiling is crossed
  // by at most one call rather than being enforceable to the cent.
  const decision = await checkPlanLimit({ subAccountId, kind: "aiSpend", amount: 0 });
  if (decision.allowed) return { allowed: true };
  return {
    allowed: false,
    message:
      "You've reached this month's included intelligent-generation usage. " +
      "It resets on the 1st, and upgrading your plan raises the allowance.",
  };
}

/** Record what a completed call actually cost. Best-effort, never throws. */
export async function recordAiSpend(input: {
  subAccountId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  if (!input.subAccountId) return;
  const usd = computeAiCostUsd(input.model, input.inputTokens, input.outputTokens);
  if (usd <= 0) return;
  await recordPlanUsage(input.subAccountId, "aiSpend", usd);
}
