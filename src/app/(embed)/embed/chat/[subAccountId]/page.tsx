import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { checkOriginAllowed } from "@/lib/comms/web-chat/origin";
import { mintEmbedToken, verifyEmbedToken } from "@/lib/comms/web-chat/embed-token";
import { getChannelConfig } from "@/lib/comms/ai/agent";
import { ChatWindow } from "@/components/web-chat/chat-window";
import { DEFAULT_WEB_CHAT_CONFIG } from "@/types/ai";

export const dynamic = "force-dynamic";

/**
 * /embed/chat/[subAccountId] — the iframe target loaded by the widget
 * snippet. Renders the chat UI for that sub-account using its saved
 * theme (accent color + welcome message). No auth.
 *
 * Two failure modes both render 404:
 *   - The sub-account exists but web-chat is disabled
 *   - The web-chat channel doc doesn't exist (never configured)
 *
 * Origin allowlist enforcement: /api/web-chat/config only mints the signed
 * token for allow-listed embedding origins, and /message + /capture refuse
 * requests without it. This page is harmless when iframed from an off-list
 * domain because it never receives a token, so it can't send messages.
 */
export default async function EmbedChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ subAccountId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { subAccountId } = await params;
  const sp = await searchParams;
  const config = await getChannelConfig(subAccountId, "web-chat");
  if (!config || !config.enabled || !config.webChat) {
    notFound();
  }

  // Token for /message + /capture. Prefer the one the (current) widget passes
  // from /config. Otherwise derive it here from the browser's Referer, which for
  // an iframe navigation names the embedding page: cached older widget.js
  // builds keep working, and a site that isn't on the allowlist gets no token.
  const passed = typeof sp.t === "string" ? sp.t : null;
  let embedToken: string | null =
    passed && verifyEmbedToken(passed, subAccountId).ok ? passed : null;
  if (!embedToken) {
    const referer = (await headers()).get("referer");
    try {
      const refOrigin = referer ? new URL(referer).origin : null;
      const check = checkOriginAllowed(refOrigin, config.webChat.allowedDomains);
      if (check.allowed) embedToken = mintEmbedToken(subAccountId, check.hostname ?? "unknown");
    } catch {
      embedToken = null;
    }
  }

  const welcomeMessage =
    config.webChat.welcomeMessage || DEFAULT_WEB_CHAT_CONFIG.welcomeMessage;
  const accentColor =
    config.webChat.accentColor || DEFAULT_WEB_CHAT_CONFIG.accentColor;

  return (
    <ChatWindow
      subAccountId={subAccountId}
      welcomeMessage={welcomeMessage}
      accentColor={accentColor}
      title={config.webChat.title || "Chat with us"}
      subtitle={config.webChat.subtitle ?? "We typically reply instantly"}
      embedToken={embedToken}
      embedded
    />
  );
}
