import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Account-activation tokens — lets a brand-new self-serve signup (see
 * `handlePublicSelfServeSignupCheckoutCompleted` in
 * `lib/server/billing-service.ts`) set their own password on a Firebase
 * Auth user that was created server-side with a random, never-shared
 * password. Format mirrors the checkout-token pattern in
 * `lib/billing/token.ts` exactly, keyed by `uid` instead of `subAccountId`:
 *
 *   `${uid}.${nonce}.${HMAC-SHA256(`${uid}.${nonce}`, SECRET)}`
 *
 * Firestore only ever stores the SHA-256 hash (`accountActivations/{uid}.
 * tokenHash`) — the raw token only ever lives in the emailed link. Signed
 * with the same `AUTOMATIONS_TOKEN_SECRET` as every other token in this
 * codebase; rotating that secret invalidates outstanding activation links
 * too.
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

/** Issue a fresh activation token. Caller persists the hash to
 *  `accountActivations/{uid}.tokenHash`. */
export function issueActivationToken(uid: string): {
  token: string;
  hash: string;
} {
  if (!/^[A-Za-z0-9_-]+$/.test(uid)) {
    throw new Error("Unexpected uid format for activation token");
  }
  const nonce = randomBytes(16).toString("hex");
  const payload = `${uid}.${nonce}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  const token = `${payload}.${sig}`;
  return { token, hash: hashActivationToken(token) };
}

export function hashActivationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Verify a presented token. Returns `{uid, hash}` on a valid signature,
 * null otherwise. Caller must still confirm the hash matches the stored
 * `accountActivations/{uid}.tokenHash` and that it hasn't been consumed or
 * expired.
 */
export function verifyActivationToken(
  token: string,
): { uid: string; hash: string } | null {
  const parts = token.split(".");
  if (parts.length !== TOKEN_PARTS) return null;
  const [uid, nonce, presentedSig] = parts;
  if (!uid || !nonce || !presentedSig) return null;

  let expectedSig: string;
  try {
    expectedSig = createHmac("sha256", getSecret())
      .update(`${uid}.${nonce}`)
      .digest("hex");
  } catch {
    return null;
  }
  if (presentedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(Buffer.from(presentedSig), Buffer.from(expectedSig))) {
    return null;
  }

  return { uid, hash: hashActivationToken(token) };
}

/** Full shareable /activate URL. Empty string when NEXT_PUBLIC_APP_URL is unset. */
export function buildActivationUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/activate/${token}`;
}
