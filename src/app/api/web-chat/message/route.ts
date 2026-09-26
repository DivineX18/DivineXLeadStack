import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getChannelConfig } from "@/lib/comms/ai/agent";
import { guardWebChatRequest } from "@/lib/comms/web-chat/guard";
import { trustedClientIp } from "@/lib/comms/web-chat/client-ip";
import { isValidSessionId } from "@/lib/comms/web-chat/session";
import { respondToWebChat } from "@/lib/comms/web-chat/respond";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Public POST endpoint the widget hits on every visitor message.
 *
 * Access control (all enforced before any model call): a signed embed token
 * minted by /config only for allow-listed origins, an Origin sanity check, and
 * persistent per-IP / per-session / daily message + token ceilings. See
 * guard.ts, embed-token.ts and usage-limits.ts. Knowing the (public)
 * sub-account id is not enough to reach the bot.
 *
 * Failures return CORS headers so the widget doesn't choke on a console
 * CORS error — the visitor sees a generic fallback instead.
 */

const MAX_MESSAGE_CHARS = 2000;

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  let body: {
    sa?: string;
    sessionId?: string;
    message?: string;
    pageUrl?: string;
    referrer?: string;
    token?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers },
    );
  }

  const subAccountId = body.sa?.trim();
  const sessionId = body.sessionId?.trim();
  const message = body.message?.trim();

  if (!subAccountId) {
    return NextResponse.json(
      { error: "Missing sa" },
      { status: 400, headers },
    );
  }
  if (!isValidSessionId(sessionId)) {
    return NextResponse.json(
      { error: "Invalid sessionId" },
      { status: 400, headers },
    );
  }
  if (!message || message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `Message must be 1-${MAX_MESSAGE_CHARS} characters` },
      { status: 400, headers },
    );
  }

  const config = await getChannelConfig(subAccountId, "web-chat");
  if (!config || !config.enabled || !config.webChat) {
    return NextResponse.json(
      { enabled: false, error: "Web Chat is not enabled for this sub-account" },
      { status: 403, headers },
    );
  }

  const blocked = await guardWebChatRequest({
    request,
    subAccountId,
    sessionId,
    token: body.token,
    config,
    headers,
  });
  if (blocked) return blocked;

  const ip = trustedClientIp(request.headers);

  // Need agencyId for tenancy stamps on the session/messages.
  const saSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!saSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404, headers },
    );
  }
  const sa = saSnap.data() as SubAccountDoc;

  try {
    const { outcome } = await respondToWebChat({
      subAccountId,
      agencyId: sa.agencyId,
      sessionId,
      incomingMessage: message,
      pageUrl: body.pageUrl?.slice(0, 500) ?? null,
      referrer: body.referrer?.slice(0, 500) ?? null,
      origin,
      visitorIp: ip,
      visitorUserAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    });

    const visibleReply =
      outcome.kind === "replied"
        ? outcome.replyText
        : outcome.kind === "escalated"
          ? outcome.fallbackReply
          : outcome.fallbackReply;
    const formFields =
      outcome.kind === "replied" ? outcome.formFields : null;

    const ctas = outcome.kind === "replied" ? outcome.ctas : [];

    return NextResponse.json(
      {
        reply: visibleReply,
        kind: outcome.kind,
        formFields,
        ctas,
      },
      { status: 200, headers },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[web-chat/message] sa=${subAccountId} failed:`, msg);
    return NextResponse.json(
      {
        reply:
          "Sorry, something went wrong on our end. The team has been notified.",
        kind: "skipped",
      },
      { status: 200, headers },
    );
  }
}
