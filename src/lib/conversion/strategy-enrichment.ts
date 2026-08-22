import "server-only";
import type { CampaignStrategy } from "@/types/conversion";
import { runAiSuiteTurn, aiSuiteIsConfigured } from "@/lib/ai-suite/model";
import {
  buildStrategyEnrichmentPrompt,
  parseEnrichmentResponse,
  applyStrategyEnrichment,
} from "./strategy-enrichment-core";

/**
 * Campaign Strategy Enrichment — the server-only LLM wrapper (Conversion
 * Engine, M7). All the deterministic logic (prompt build, parse, apply) lives
 * in strategy-enrichment-core.ts and is tested there; this is just the thin,
 * best-effort model call that composes them.
 */

export type { StrategyEnrichment } from "./strategy-enrichment-core";
export {
  buildStrategyEnrichmentPrompt,
  parseEnrichmentResponse,
  applyStrategyEnrichment,
} from "./strategy-enrichment-core";

/**
 * Enrich a strategy via the model. Best-effort: no key, a model failure, or an
 * unparseable reply all return the input strategy unchanged. Never throws — the
 * deterministic strategy always still works.
 */
export async function enrichCampaignStrategy(strategy: CampaignStrategy): Promise<CampaignStrategy> {
  if (!aiSuiteIsConfigured()) return strategy;
  try {
    const { system, user } = buildStrategyEnrichmentPrompt(strategy);
    const result = await runAiSuiteTurn({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [],
      maxTokens: 700,
    });
    const enrichment = parseEnrichmentResponse(result.text);
    if (!enrichment) return strategy;
    return applyStrategyEnrichment(strategy, enrichment);
  } catch {
    return strategy;
  }
}
