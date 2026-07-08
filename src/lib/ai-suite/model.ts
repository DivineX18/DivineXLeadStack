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

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// OpenRouter slugs for this deployment's models are hyphenated (matching the
// AI Agents config, e.g. "anthropic/claude-haiku-4-5"). If OpenRouter serves
// Opus 4.8 under a different slug, set AI_SUITE_MODEL to it.
const DEFAULT_AI_SUITE_MODEL = "anthropic/claude-opus-4-8";

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

export async function runAiSuiteTurn({
  messages,
  tools,
  maxTokens = 1024,
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

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL ?? "https://leadstack.dev",
      "X-Title": "LeadStack AI Suite",
    },
    body: JSON.stringify(body),
  });

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
    } catch {
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
