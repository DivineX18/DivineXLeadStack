import "server-only";

import crypto from "node:crypto";

/**
 * Verify a Svix-format webhook signature — the scheme Resend uses for both
 * delivery events and inbound mail.
 *
 * Implemented here rather than pulling in the `svix` package: it is one HMAC
 * over a documented, stable string, and the dependency would exist solely for
 * that. Adding one is also a supply-chain decision for a repo buyers self-host.
 *
 * The signed payload is `{id}.{timestamp}.{raw body}`. The RAW body matters —
 * re-serializing parsed JSON changes key order and whitespace and the
 * signature stops matching, so callers must pass the exact bytes received.
 */

/** Reject anything older than this, so a captured request cannot be replayed. */
const TOLERANCE_SECONDS = 5 * 60;

export type SignatureResult =
  | { ok: true }
  | { ok: false; reason: string };

export function verifySvixSignature(input: {
  /** The exact request body as received, before any JSON parsing. */
  rawBody: string;
  headers: Headers;
  /** The `whsec_…` secret from the provider's webhook settings. */
  secret: string;
}): SignatureResult {
  const id = input.headers.get("svix-id") ?? input.headers.get("webhook-id");
  const timestamp =
    input.headers.get("svix-timestamp") ?? input.headers.get("webhook-timestamp");
  const signature =
    input.headers.get("svix-signature") ?? input.headers.get("webhook-signature");

  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: "bad_timestamp" };
  const skew = Math.abs(Date.now() / 1000 - sent);
  if (skew > TOLERANCE_SECONDS) return { ok: false, reason: "timestamp_out_of_tolerance" };

  // The secret is base64 AFTER the prefix. Signing with the prefixed string
  // produces a signature that never matches.
  const raw = input.secret.startsWith("whsec_")
    ? input.secret.slice("whsec_".length)
    : input.secret;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return { ok: false, reason: "bad_secret" };
  }
  if (key.length === 0) return { ok: false, reason: "bad_secret" };

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${input.rawBody}`)
    .digest("base64");

  // The header carries a space-separated list of `v<version>,<signature>`
  // entries — more than one during a secret rotation, so ANY match passes.
  for (const entry of signature.split(" ")) {
    const comma = entry.indexOf(",");
    if (comma < 0) continue;
    if (entry.slice(0, comma) !== "v1") continue;
    const candidate = entry.slice(comma + 1);
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    // Length check first: timingSafeEqual throws on a length mismatch, and a
    // throw here would read as a server error rather than a bad signature.
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { ok: true };
  }
  return { ok: false, reason: "no_matching_signature" };
}
