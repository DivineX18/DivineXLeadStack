import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Client onboarding invite tokens.
 *
 * Same shape as the quote and checkout-link tokens, deliberately:
 *
 *   `${onboardingId}.${nonce}.${HMAC-SHA256(`${onboardingId}.${nonce}`, SECRET)}`
 *
 * The token IS the credential. That is the point: a client being onboarded
 * does not have an account yet, and making them create one before they can
 * hand over their logo is how intake forms die. The 16-byte nonce means
 * re-sending the invite rotates the link and kills the old one without a
 * blacklist, and only the SHA-256 is persisted, so a database dump cannot be
 * used to open someone's onboarding.
 *
 * Signed with AUTOMATIONS_TOKEN_SECRET, like every other public token here.
 * Rotating that secret invalidates outstanding invites along with outstanding
 * quote and unsubscribe links.
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

export function hashOnboardingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issue a fresh invite token. The caller persists ONLY the hash. */
export function issueOnboardingToken(onboardingId: string): {
  token: string;
  hash: string;
} {
  if (!/^[A-Za-z0-9_-]+$/.test(onboardingId)) {
    throw new Error("Unexpected onboardingId format for an invite token");
  }
  const nonce = randomBytes(16).toString("hex");
  const payload = `${onboardingId}.${nonce}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  const token = `${payload}.${sig}`;
  return { token, hash: hashOnboardingToken(token) };
}

/**
 * Verify the signature only. A valid signature proves we minted this string;
 * it does NOT prove the token is the current one, so every caller must still
 * compare `hashOnboardingToken(token)` against the stored hash and check
 * expiry. Returning the id without that second check would let a rotated-out
 * link keep working forever.
 */
export function verifyOnboardingToken(
  token: string,
): { onboardingId: string; hash: string } | null {
  const parts = token.split(".");
  if (parts.length !== TOKEN_PARTS) return null;
  const [onboardingId, nonce, sig] = parts;
  if (!onboardingId || !nonce || !sig) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(onboardingId) || !/^[a-f0-9]{32}$/.test(nonce)) return null;

  const expected = createHmac("sha256", getSecret())
    .update(`${onboardingId}.${nonce}`)
    .digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and a forged token should not produce a 500.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { onboardingId, hash: hashOnboardingToken(token) };
}
