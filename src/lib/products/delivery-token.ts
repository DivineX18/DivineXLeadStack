import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Public download tokens for digital-product deliveries. Same shape and
 * discipline as lib/quotes/token.ts — deliberately mirrored rather than
 * shared, since the two are conceptually distinct (a quote token grants
 * viewing a document; a delivery token grants downloading a paid file)
 * even though the crypto is identical.
 *
 *   `${deliveryId}.${nonce}.${HMAC-SHA256(`${deliveryId}.${nonce}`, SECRET)}`
 *
 * Only the SHA-256 hash is persisted (`productDeliveries.downloadTokenHash`)
 * — a DB dump can't be used to forge a download.
 */

const TOKEN_PARTS = 3;

function getSecret(): string {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTOMATIONS_TOKEN_SECRET is not set (or too short). Generate one with `openssl rand -base64 32`.",
    );
  }
  return s;
}

export function issueProductDeliveryToken(deliveryId: string): {
  token: string;
  hash: string;
} {
  if (!/^[A-Za-z0-9_-]+$/.test(deliveryId)) {
    throw new Error("Unexpected deliveryId format for delivery token");
  }
  const nonce = randomBytes(16).toString("hex");
  const payload = `${deliveryId}.${nonce}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  const token = `${payload}.${sig}`;
  return { token, hash: hashDeliveryToken(token) };
}

export function hashDeliveryToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyProductDeliveryToken(
  token: string,
): { deliveryId: string; hash: string } | null {
  const parts = token.split(".");
  if (parts.length !== TOKEN_PARTS) return null;
  const [deliveryId, nonce, presentedSig] = parts;
  if (!deliveryId || !nonce || !presentedSig) return null;

  let expectedSig: string;
  try {
    expectedSig = createHmac("sha256", getSecret())
      .update(`${deliveryId}.${nonce}`)
      .digest("hex");
  } catch {
    return null;
  }
  if (presentedSig.length !== expectedSig.length) return null;
  const a = Buffer.from(presentedSig);
  const b = Buffer.from(expectedSig);
  if (!timingSafeEqual(a, b)) return null;

  return { deliveryId, hash: hashDeliveryToken(token) };
}

/** Full shareable download URL for an outbound delivery email. */
export function buildDeliveryUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/api/dl/${token}`;
}
