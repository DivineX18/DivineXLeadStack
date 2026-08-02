import "server-only";

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
  return Number(process.env.AI_SUITE_MODEL_TIMEOUT_MS) || 45_000;
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
}

interface OpenRouterToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: OpenRouterToolCall[] };
  }>;
  error?: { message?: string };
}

// 1024 was the original default from before create_funnel grew rich,
// multi-paragraph fields (story_paragraphs, trust_badges, faq_items,
// confirmation_email_body, ...) — a real proposal's tool-call JSON now
// regularly exceeds that, so the response silently truncates mid-JSON,
// fails to parse, and falls back to {} (found live 2026-08-02: every
// create_funnel call in a 4-vertical test failed this way, surfacing as a
// misleading "a headline is required" ask even though the model had
// written a full, good response that never made it back intact). 4096
// is a ceiling, not a spend — the model only uses what the actual reply
// needs, so this costs nothing on short replies and just stops truncating
// long ones.
export async function runAiSuiteTurn({
  messages,
  tools,
  maxTokens = 4096,
}: {
  messages: AiSuiteLlmMessage[];
  tools: AiSuiteToolDef[];
  maxTokens?: number;
}): Promise<AiSuiteTurnResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set — the AI Suite requires it. Get a key at openrouter.ai.",
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
    throw new Error(
      `OpenRouter ${res.status}: ${text.slice(0, 300) || res.statusText}`,
    );
  }

  const data = (await res.json()) as OpenRouterChatResponse;
  if (data.error?.message) {
    throw new Error(`OpenRouter: ${data.error.message}`);
  }

  const message = data.choices?.[0]?.message;
  const text = message?.content?.trim() || null;

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
        "[ai-suite/model] tool-call arguments failed to parse, falling back to {}:",
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

  return { text, toolCall };
}
