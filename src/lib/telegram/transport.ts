import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * THE TELEGRAM WIRE.
 *
 * Two things matter here and nothing else does. A request arriving at the
 * webhook must be proven to come from Telegram, and the reply must be
 * rendered for a chat window without changing what is true.
 *
 * Telegram's supported mechanism is a secret token chosen when the webhook
 * is registered, returned on every delivery in the
 * X-Telegram-Bot-Api-Secret-Token header. A hard-to-guess URL is not
 * authentication: it is logged by proxies, appears in error reports, and
 * cannot be rotated without re-registering.
 */

export function telegramIsConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_WEBHOOK_SECRET;
}

/** Constant-time, so the secret cannot be recovered a character at a time. */
export function verifyTelegramSecret(header: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface TelegramInbound {
  updateId: number;
  telegramUserId: string;
  chatId: string;
  username: string | null;
  /** A typed message, when this update is one. */
  text: string | null;
  /** A pressed button, when this update is one. */
  callback: { id: string; data: string } | null;
  /** True when the sender is a bot, including ours. */
  fromBot: boolean;
}

/**
 * Read an update, or refuse it.
 *
 * Fails closed on anything unexpected: an update Zeno cannot understand is
 * ignored rather than guessed at. Messages from bots are dropped outright,
 * because a bot replying to a bot is how a loop starts.
 */
export function parseTelegramUpdate(raw: unknown): TelegramInbound | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const updateId = typeof u.update_id === "number" ? u.update_id : null;
  if (updateId === null) return null;

  const cb = u.callback_query as Record<string, unknown> | undefined;
  if (cb && typeof cb === "object") {
    const from = cb.from as Record<string, unknown> | undefined;
    const msg = cb.message as Record<string, unknown> | undefined;
    const chat = msg?.chat as Record<string, unknown> | undefined;
    if (!from?.id || !chat?.id || typeof cb.id !== "string") return null;
    return {
      updateId,
      telegramUserId: String(from.id),
      chatId: String(chat.id),
      username: typeof from.username === "string" ? from.username : null,
      text: null,
      callback: { id: cb.id, data: typeof cb.data === "string" ? cb.data : "" },
      fromBot: from.is_bot === true,
    };
  }

  const m = u.message as Record<string, unknown> | undefined;
  if (m && typeof m === "object") {
    const from = m.from as Record<string, unknown> | undefined;
    const chat = m.chat as Record<string, unknown> | undefined;
    if (!from?.id || !chat?.id) return null;
    const text = typeof m.text === "string" ? m.text : null;
    if (!text) return null; // a photo or a sticker is not a request
    return {
      updateId,
      telegramUserId: String(from.id),
      chatId: String(chat.id),
      username: typeof from.username === "string" ? from.username : null,
      text: text.slice(0, 4000),
      callback: null,
      fromBot: from.is_bot === true,
    };
  }
  return null;
}

/** Telegram's own escaping rules for the subset of HTML it renders. */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface TelegramButton {
  text: string;
  /** Opaque. Never arguments, never anything sensitive. */
  callbackData: string;
}

export interface TelegramReply {
  chatId: string;
  text: string;
  buttons?: TelegramButton[];
}

/**
 * Send a reply. Isolated here so every test below the transport can run
 * the real gateway without a network call.
 */
export async function sendTelegramMessage(reply: TelegramReply): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" };
  const body: Record<string, unknown> = {
    chat_id: reply.chatId,
    text: reply.text.slice(0, 4096),
    parse_mode: "HTML",
    ...(reply.buttons?.length
      ? {
          reply_markup: {
            inline_keyboard: [reply.buttons.map((b) => ({ text: b.text, callback_data: b.callbackData }))],
          },
        }
      : {}),
  };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `Telegram returned ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

/** Acknowledge a pressed button so the client stops showing a spinner. */
export async function answerTelegramCallback(callbackId: string, text?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackId, ...(text ? { text: text.slice(0, 200) } : {}) }),
    });
  } catch {
    // The answer is cosmetic; failing to send it must not fail the turn.
  }
}
