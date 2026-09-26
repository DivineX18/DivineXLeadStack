import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, short-lived embed token for the public web-chat.
 *
 * Why it exists: the chat UI runs in an iframe on OUR origin, so the Origin
 * header on /message and /capture never names the customer's website and the
 * domain allowlist can't be checked there. The allowlist IS reliably checked on
 * /config (called from the embedding page, where browsers set Origin honestly).
 * /config therefore mints this token only for allow-listed origins, and
 * /message + /capture refuse any request without a valid one. Knowing the
 * (public) sub-account id is no longer enough to talk to the bot.
 *
 * It is not a secret between visitor and server. A scripted client can still
 * spoof Origin to obtain a token, so rate limits and hard budgets remain the
 * cost defence. What the token adds is real server-side enforcement of the
 * allowlist against ordinary browsers and casual abuse.
 *
 * Format: base64url(payload) + "." + base64url(hmac). Payload = sa|exp|host.
 * Domain-separated HMAC label so the shared secret can't be replayed against
 * other token types. Fail closed: no secret configured, no tokens minted.
 */

const LABEL = "web-chat-embed-v1";
export const EMBED_TOKEN_TTL_SECONDS = 24 * 60 * 60;

function secret(): string | null {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

function b64u(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function mac(key: string, payload: string): Buffer {
  return createHmac("sha256", key).update(`${LABEL}|${payload}`).digest();
}

export function mintEmbedToken(
  subAccountId: string,
  embeddingHost: string,
  nowMs: number = Date.now(),
): string | null {
  const key = secret();
  if (!key) return null;
  const exp = Math.floor(nowMs / 1000) + EMBED_TOKEN_TTL_SECONDS;
  const payload = `${subAccountId}|${exp}|${embeddingHost}`;
  return `${b64u(payload)}.${b64u(mac(key, payload))}`;
}

export type EmbedTokenCheck =
  | { ok: true; embeddingHost: string }
  | { ok: false; reason: "missing" | "malformed" | "bad-signature" | "expired" | "wrong-sub-account" | "no-secret" };

export function verifyEmbedToken(
  token: string | null | undefined,
  subAccountId: string,
  nowMs: number = Date.now(),
): EmbedTokenCheck {
  const key = secret();
  if (!key) return { ok: false, reason: "no-secret" };
  if (!token) return { ok: false, reason: "missing" };
  const dot = token.indexOf(".");
  if (dot < 1 || dot === token.length - 1) return { ok: false, reason: "malformed" };

  let payload: string;
  let given: Buffer;
  try {
    payload = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
    given = Buffer.from(token.slice(dot + 1), "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const expected = mac(key, payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "bad-signature" };
  }

  const [sa, expStr, ...hostParts] = payload.split("|");
  const exp = Number(expStr);
  if (!sa || !Number.isFinite(exp)) return { ok: false, reason: "malformed" };
  if (sa !== subAccountId) return { ok: false, reason: "wrong-sub-account" };
  if (Math.floor(nowMs / 1000) > exp) return { ok: false, reason: "expired" };
  return { ok: true, embeddingHost: hostParts.join("|") };
}
