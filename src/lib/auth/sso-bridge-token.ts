import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * SSO bridge tokens — the one hop between "we verified this is a real,
 * authorized Ascend user" (the callback route, Phase B/C) and "sign them
 * into Growth Operations" (the finish page, Phase E). Same construction as
 * `lib/auth/activation-token.ts` (`${bridgeId}.${nonce}.${HMAC-SHA256}`,
 * only the SHA-256 hash persisted) but deliberately keyed by its OWN secret,
 * `SSO_BRIDGE_TOKEN_SECRET` — never `AUTOMATIONS_TOKEN_SECRET`. Rotating
 * unsubscribe/quote/activation links shouldn't also rotate SSO bridge
 * security, and vice versa; a dedicated secret keeps the blast radius of
 * either rotation contained to itself.
 *
 * Keyed by a random `bridgeId` per attempt (never the uid) — see
 * `ssoBridge/{bridgeId}` in the SSO callback route — so two concurrent
 * login attempts (a second tab, a repeated click) never collide.
 */

const TOKEN_PARTS = 3;

function getSecret(): string {
  const s = process.env.SSO_BRIDGE_TOKEN_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "SSO_BRIDGE_TOKEN_SECRET is not set (or too short). Generate one with `openssl rand -base64 32`.",
    );
  }
  return s;
}

/** Issue a fresh bridge token. Caller persists the hash to
 *  `ssoBridge/{bridgeId}.tokenHash`. */
export function issueSsoBridgeToken(bridgeId: string): {
  token: string;
  hash: string;
} {
  if (!/^[A-Za-z0-9_-]+$/.test(bridgeId)) {
    throw new Error("Unexpected bridgeId format for SSO bridge token");
  }
  const nonce = randomBytes(16).toString("hex");
  const payload = `${bridgeId}.${nonce}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  const token = `${payload}.${sig}`;
  return { token, hash: hashSsoBridgeToken(token) };
}

export function hashSsoBridgeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Verify a presented token. Returns `{bridgeId, hash}` on a valid
 * signature, null otherwise. Caller must still confirm the hash matches
 * the stored `ssoBridge/{bridgeId}.tokenHash` and that it hasn't been
 * consumed or expired.
 */
export function verifySsoBridgeToken(
  token: string,
): { bridgeId: string; hash: string } | null {
  const parts = token.split(".");
  if (parts.length !== TOKEN_PARTS) return null;
  const [bridgeId, nonce, presentedSig] = parts;
  if (!bridgeId || !nonce || !presentedSig) return null;

  let expectedSig: string;
  try {
    expectedSig = createHmac("sha256", getSecret())
      .update(`${bridgeId}.${nonce}`)
      .digest("hex");
  } catch {
    return null;
  }
  if (presentedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(Buffer.from(presentedSig), Buffer.from(expectedSig))) {
    return null;
  }

  return { bridgeId, hash: hashSsoBridgeToken(token) };
}
