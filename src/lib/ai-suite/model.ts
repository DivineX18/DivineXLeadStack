import "server-only";
import { stripEmDashes } from "@/lib/text/dedash";

/**
 * OpenRouter client for the AI Suite.
 *
 * The AI Suite runs a tool-enabled turn per user message: the model either
 * answers in text (knowledge mode) or requests one tool. Read-only lookup
 * tools are executed by the chat route and their results appended as `tool`
 * messages for a follow-up turn; write tools are NOT executed — the
 * confirm-before-write flow surfaces them as a proposal first. Either way a
 * non-streaming call is exactly right: we read the one message the model
 * produced and branch on whether it's text or a tool call.
 *
 * Same key (OPENROUTER_API_KEY) and OpenAI-compatible endpoint as the AI
 * Agents client. Model defaults to Opus 4.8, overridable via AI_SUITE_MODEL.
 */

// Overridable so the retry/timeout regression script can point this at a
// local fake server instead of the real OpenRouter endpoint. Read per-call
// (not a module-level const) so a script can set the env var after import.
function openRouterUrl(): string {
  return (
    process.env.AI_SUITE_MODEL_URL_OVERRIDE ||
    "https://openrouter.ai/api/v1/chat/completions"
  );
}

// OpenRouter slugs for this deployment's models are hyphenated (matching the
// AI Agents config, e.g. "anthropic/claude-haiku-4-5"). If OpenRouter serves
// Opus 4.8 under a different slug, set AI_SUITE_MODEL to it.
const DEFAULT_AI_SUITE_MODEL = "anthropic/claude-opus-4-8";

// A funnel-orchestration turn carries ~25 tool schemas + up to 12 history
// turns — noticeably heavier than a plain chat reply — so OpenRouter/Anthropic
// occasionally blip (429 rate limit, 5xx, or a stalled connection) on a turn
// that would otherwise succeed a moment later. Retry transient failures with
// backoff (same shape as lib/import/ghl/client.ts's ghlFetch) instead of
// surfacing "couldn't reach the model" to the user on the first hiccup, and
// bound the request with a timeout so a stalled connection fails fast rather
// than hanging past what the user will wait for.
const MAX_MODEL_RETRIES = 3;
// Overridable so the retry/timeout regression script can exercise the abort
// path in milliseconds instead of waiting out a real 45s hang. Read per-call
// (not a module-level const) so a script can set the env var after import.
function requestTimeoutMs(): number {
  // Raised with the output ceiling: a rich create_funnel proposal is several
  // thousand tokens and 45s was close enough to the real generation time that
  // an abort-then-retry could burn the whole budget twice over. The abort is
  // there to stop a hang, not to cut off work that is still arriving.
  return Number(process.env.AI_SUITE_MODEL_TIMEOUT_MS) || 90_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function aiSuiteIsConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

export function aiSuiteModel(): string {
  return process.env.AI_SUITE_MODEL?.trim() || DEFAULT_AI_SUITE_MODEL;
}

export interface AiSuiteToolDef {
  type: "function";
  function: Record<string, unknown>;
}

/** OpenAI/OpenRouter-shaped tool-call echo for the message history. */
export interface AiSuiteRawToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * Message shapes the AI Suite sends to the model. Superset of the plain
 * system/user/assistant turns: the chat route appends an assistant turn
 * carrying `tool_calls` plus a matching `tool` result after executing a
 * read-only lookup, so the model can finish its answer grounded in the data.
 */
export type AiSuiteLlmMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: AiSuiteRawToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** The one thing the model produced this turn: text, a tool call, or both. */
export interface AiSuiteTurnResult {
  /** Assistant text, if any. */
  text: string | null;
  /** The first tool call, if the model requested an action. */
  toolCall: { id: string; name: string; args: Record<string, unknown> } | null;
  /**
   * THE MODEL RAN OUT OF OUTPUT BUDGET MID-ANSWER.
   *
   * This has to be a first-class result rather than something inferred from a
   * JSON parse failure, because the two are indistinguishable downstream and
   * the consequences are opposite. A truncated tool call is a COMPLETE, correct
   * answer we failed to receive; treating it as malformed arguments sends the
   * caller into a repair loop asking the model to fix work it already did right,
   * and ends by telling the customer their brief was too thin. It was too RICH.
   *
   * See the ceiling note on `DEFAULT_MAX_TOKENS` — this flag is what stops the
   * next ceiling overrun from masquerading as a content problem for a third time.
   */
  truncated: boolean;
}

interface OpenRouterToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: OpenRouterToolCall[] };
    /** "stop" | "length" | "tool_calls" | ... — "length" is the budget overrun. */
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
}

/**
 * THE OUTPUT CEILING, AND WHY IT HAS NOW MOVED TWICE.
 *
 * 1024 was the original default from before create_funnel grew rich,
 * multi-paragraph fields (story_paragraphs, trust_badges, faq_items,
 * confirmation_email_body, ...). A real proposal's tool-call JSON exceeded it,
 * the response truncated mid-JSON, failed to parse, and fell back to {} —
 * surfacing as a misleading "a headline is required" ask even though the model
 * had written a full, good response that never made it back intact. Found live
 * 2026-08-02 and raised to 4096.
 *
 * IT HAPPENED AGAIN. By 2026-09-13 a normal B2B brief (a warehouse-automation
 * integrator) truncated at 4096 on three consecutive attempts, at 9254/9518/
 * 10069 characters of arguments, and the customer was told to explain their
 * offer more — having already explained it more thoroughly than the customers
 * who succeed. Raising the number a second time only buys time, which is why
 * the real correction shipped alongside it is `finish_reason` detection: a
 * budget overrun is now a NAMED failure instead of an invisible one, so the
 * third occurrence announces itself instead of being diagnosed from scratch.
 *
 * This is a ceiling, not a spend. The model uses only what its reply needs, so
 * a higher number costs nothing on short replies and stops truncating long ones.
 */
const DEFAULT_MAX_TOKENS = 16_000;

export async function runAiSuiteTurn({
  messages,
  tools,
  maxTokens = DEFAULT_MAX_TOKENS,
}: {
  messages: AiSuiteLlmMessage[];
  tools: AiSuiteToolDef[];
  maxTokens?: number;
}): Promise<AiSuiteTurnResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set, the AI Suite requires it. Get a key at openrouter.ai.",
    );
  }

  const body: Record<string, unknown> = {
    model: aiSuiteModel(),
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
  };
  // Only send the tools field when there are tools — an empty array upsets
  // some providers, and knowledge-only levels wouldn't have any.
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  let res: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_MODEL_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs());
    try {
      res = await fetch(openRouterUrl(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_APP_URL ?? "https://leadstack.dev",
          "X-Title": "LeadStack AI Suite",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      lastErr = null;
    } catch (err) {
      // Network error, DNS failure, or our own timeout abort — all
      // transient from the caller's perspective, so retry the same way a
      // 429/5xx does below.
      lastErr = err;
      res = null;
    } finally {
      clearTimeout(timer);
    }

    if (res?.ok) break;

    const status = res?.status;
    const retryable = res === null || status === 429 || (status !== undefined && status >= 500);
    if (retryable && attempt < MAX_MODEL_RETRIES) {
      const retryAfter = Number(res?.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : Math.min(8000, 500 * 2 ** attempt);
      console.warn(
        `[ai-suite/model] OpenRouter call failed (attempt ${attempt + 1}/${MAX_MODEL_RETRIES + 1}), retrying in ${waitMs}ms:`,
        res === null ? (lastErr instanceof Error ? lastErr.message : lastErr) : `${status} ${res.statusText}`,
      );
      await sleep(waitMs);
      continue;
    }
    break;
  }

  if (res === null) {
    const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(`OpenRouter request failed after retries: ${detail}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    /**
     * OUT OF CREDIT IS NOT AN OUTAGE, AND IT IS NOT RETRYABLE.
     *
     * A 402 is the deployment's OpenRouter balance running out. It is not in
     * the retry list above (correctly: retrying cannot buy credit), so it
     * throws, and the route reports "couldn't reach the model" — which sends
     * whoever investigates looking for a provider incident when the fix is a
     * top-up. It is called by its name here so the server log says what to do.
     */
    if (res.status === 402) {
      console.error(
        "[ai-suite/model] OPENROUTER CREDIT EXHAUSTED — the assistant is down for every workspace until this deployment's OpenRouter balance is topped up. openrouter.ai → Credits.",
      );
      throw new Error(`OpenRouter credit exhausted: ${text.slice(0, 200)}`);
    }
    throw new Error(
      `OpenRouter ${res.status}: ${text.slice(0, 300) || res.statusText}`,
    );
  }

  const data = (await res.json()) as OpenRouterChatResponse;
  if (data.error?.message) {
    throw new Error(`OpenRouter: ${data.error.message}`);
  }

  const choice = data.choices?.[0];
  const message = choice?.message;
  const text = message?.content?.trim() || null;
  // THE BUDGET RAN OUT. Read before anything is parsed, because it explains a
  // parse failure that would otherwise be blamed on the model's content.
  const truncated = choice?.finish_reason === "length";

  const rawCall = message?.tool_calls?.[0];
  let toolCall: AiSuiteTurnResult["toolCall"] = null;
  if (rawCall?.function?.name) {
    let args: Record<string, unknown> = {};
    try {
      args = rawCall.function.arguments
        ? (JSON.parse(rawCall.function.arguments) as Record<string, unknown>)
        : {};
    } catch (err) {
      // A truncated or malformed tool-call response falls back to empty
      // args rather than throwing — downstream `validate()` catches missing
      // required fields with a clear message, so this stays non-fatal. But
      // silently swallowing the parse error made a real failure invisible
      // (same failure mode found and fixed in the Ascend BI blueprint
      // pipeline tonight) — log it so a truncation-driven pattern shows up.
      console.warn(
        truncated
          ? `[ai-suite/model] tool-call arguments TRUNCATED at the ${maxTokens}-token ceiling (${rawCall.function.arguments?.length ?? 0} chars received), the model's answer was cut off, not wrong:`
          : "[ai-suite/model] tool-call arguments failed to parse, falling back to {}:",
        err,
        rawCall.function.arguments?.slice(0, 200),
      );
      args = {};
    }
    toolCall = {
      id: rawCall.id || `call_${rawCall.function.name}`,
      name: rawCall.function.name,
      args,
    };
  }

  // Zeno's prose leaves through here. Tool-call arguments are deliberately
  // NOT touched: they carry ids, urls and enum values, not copy, and the
  // capability that receives them validates them. See lib/text/dedash.ts.
  return { text: text === null ? text : stripEmDashes(text), toolCall, truncated };
}
