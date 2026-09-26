import "server-only";

import { NextResponse } from "next/server";
import type { AiChannelConfig } from "@/types/ai";
import { hostnameFromOrigin } from "@/lib/comms/web-chat/origin";
import { verifyEmbedToken } from "@/lib/comms/web-chat/embed-token";
import { checkAndCountRequest, resolveLimits } from "@/lib/comms/web-chat/usage-limits";
import { trustedClientIp } from "@/lib/comms/web-chat/client-ip";

/**
 * Shared front door for the public web-chat POST endpoints (/message, /capture).
 * Order matters: cheapest and most decisive checks first, and every model call
 * or Firestore write happens only after all of them pass.
 *
 *   1. Signed embed token (proves the widget was loaded from an allow-listed
 *      site, see embed-token.ts).
 *   2. Origin header sanity. From the iframe it is our own app host; a request
 *      whose Origin is some other website is refused.
 *   3. Persistent per-IP / per-session / daily-message / daily-token limits.
 *
 * Returns null when the request may proceed, otherwise the response to send.
 */

function appHostnames(): string[] {
  const out = new Set<string>();
  const fromUrl = hostnameFromOrigin(process.env.NEXT_PUBLIC_APP_URL ?? null);
  if (fromUrl) out.add(fromUrl);
  for (const h of (process.env.SAFE_APP_HOSTNAMES ?? "").split(",")) {
    const t = h.trim().toLowerCase();
    if (t) out.add(t);
  }
  return [...out];
}

export function originAcceptable(
  origin: string | null,
  allowedDomains: string[],
  appHosts: string[] = appHostnames(),
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (!origin) return true; // non-browser caller; the token still applies
  const host = hostnameFromOrigin(origin);
  if (!host) return false;
  if (nodeEnv !== "production" && (host === "localhost" || host === "127.0.0.1")) return true;
  if (appHosts.length === 0) return true; // not configured: rely on the token
  if (appHosts.includes(host)) return true;
  return allowedDomains.map((d) => d.trim().toLowerCase()).includes(host);
}

export interface GuardInput {
  request: Request;
  subAccountId: string;
  sessionId: string;
  token: string | null | undefined;
  config: AiChannelConfig;
  headers: Record<string, string>;
  /** Count this request against the limits (true for /message, /capture). */
  countAgainstLimits?: boolean;
}

export async function guardWebChatRequest(input: GuardInput): Promise<NextResponse | null> {
  const { request, subAccountId, sessionId, token, config, headers } = input;

  const tokenCheck = verifyEmbedToken(token, subAccountId);
  if (!tokenCheck.ok) {
    return NextResponse.json(
      { error: "This chat session has expired. Please refresh the page.", code: `token-${tokenCheck.reason}` },
      { status: 401, headers },
    );
  }

  const allowedDomains = config.webChat?.allowedDomains ?? [];
  if (!originAcceptable(request.headers.get("origin"), allowedDomains)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers });
  }

  if (input.countAgainstLimits === false) return null;

  let decision;
  try {
    decision = await checkAndCountRequest({
      subAccountId,
      ip: trustedClientIp(request.headers),
      sessionId,
      limits: resolveLimits(config.webChat ?? {}),
    });
  } catch (err) {
    // Fail closed: if we can't prove the caller is within budget, don't spend.
    console.error(`[web-chat/guard] limit check failed sa=${subAccountId}:`, err);
    return NextResponse.json(
      { error: "Chat is temporarily unavailable. Please try again shortly." },
      { status: 503, headers },
    );
  }
  if (decision.ok) return null;

  if (decision.reason === "message-budget" || decision.reason === "token-budget") {
    return NextResponse.json(
      {
        reply:
          "Chat is unavailable right now. Please use the contact page and the team will get back to you.",
        kind: "skipped",
        ctas: [],
      },
      { status: 200, headers },
    );
  }
  return NextResponse.json(
    {
      error:
        decision.reason === "session-quota"
          ? "Session message limit reached"
          : "Too many requests. Try again in a bit",
    },
    { status: 429, headers: { ...headers, "Retry-After": String(decision.retryAfterSec) } },
  );
}
