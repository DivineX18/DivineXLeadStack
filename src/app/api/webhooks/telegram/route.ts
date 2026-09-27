import { NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/telegram/handle-update";
import {
  answerTelegramCallback,
  parseTelegramUpdate,
  sendTelegramMessage,
  telegramIsConfigured,
  verifyTelegramSecret,
} from "@/lib/telegram/transport";

/**
 * POST /api/webhooks/telegram
 *
 * Public path: the credential is Telegram's own secret token header, set
 * when the webhook is registered and checked on every delivery. The URL
 * itself authenticates nothing, which is why the header is required before
 * the body is even read.
 *
 * Always answers 200 once the secret checks out. Telegram retries anything
 * else, and a retry of a message that already produced a turn is a second
 * turn. The update claim in the gateway guards that too; this is the other
 * half of not inviting it.
 */
export async function POST(request: Request) {
  if (!telegramIsConfigured()) {
    // Nothing to verify against, so nothing is trusted.
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (!verifyTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    // Deliberately terse: an unauthenticated caller learns nothing.
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const update = parseTelegramUpdate(raw);
  // An update this code does not understand is ignored, not guessed at.
  if (!update) return NextResponse.json({ ok: true });

  try {
    const { reply } = await handleTelegramUpdate(update);
    if (update.callback) await answerTelegramCallback(update.callback.id);
    if (reply) await sendTelegramMessage(reply);
  } catch (err) {
    // A failure here must not make Telegram retry into a second turn.
    console.error("[telegram] update failed:", err instanceof Error ? err.stack ?? err.message : err);
  }
  return NextResponse.json({ ok: true });
}
