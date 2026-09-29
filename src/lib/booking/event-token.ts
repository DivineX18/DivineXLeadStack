import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Public-share tokens for calendar events. Format:
 *
 *   `${eventId}.${nonce}.${HMAC-SHA256(`${eventId}.${nonce}`, SECRET)}`
 *
 * Mirrors the quotes/token.ts contract — same secret, same shape, same
 * SHA-256 storage discipline. Issued at booking time + rotated on every
 * reschedule so old links in attendee inboxes invalidate cleanly.
 *
 * Storage: only the SHA-256 hash of the active token is persisted to
 * `event.publicTokenHash`. The raw token is exposed exactly once — in
 * the confirmation email URL — and never round-trips through Firestore.
 *
 * Secret rotation: same env var as unsubscribe + quote links
 * (`AUTOMATIONS_TOKEN_SECRET`) — rotating invalidates every outstanding
 * event link plus every unsubscribe + quote link.
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

/** Issue a fresh public token for an event. Caller persists `hash`. */
export function issueEventToken(eventId: string): {
  token: string;
  hash: string;
} {
  if (!/^[A-Za-z0-9_-]+$/.test(eventId)) {
    throw new Error("Unexpected eventId format for event token");
  }
  const nonce = randomBytes(16).toString("hex");
  const payload = `${eventId}.${nonce}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  const token = `${payload}.${sig}`;
  return { token, hash: hashEventToken(token) };
}

/** SHA-256 hex of the token — persisted to `event.publicTokenHash`. */
export function hashEventToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Verify a presented token. Returns `{ eventId, hash }` on success or
 * `null` on any failure (bad format, bad signature). Caller must then
 * load the event by id and confirm `event.publicTokenHash === hash` to
 * guard against leaked old tokens after a reschedule.
 */
export function verifyEventToken(
  token: string,
): { eventId: string; hash: string } | null {
  const parts = token.split(".");
  if (parts.length !== TOKEN_PARTS) return null;
  const [eventId, nonce, presentedSig] = parts;
  if (!eventId || !nonce || !presentedSig) return null;

  let expectedSig: string;
  try {
    expectedSig = createHmac("sha256", getSecret())
      .update(`${eventId}.${nonce}`)
      .digest("hex");
  } catch {
    return null;
  }
  if (presentedSig.length !== expectedSig.length) return null;
  if (
    !timingSafeEqual(Buffer.from(presentedSig), Buffer.from(expectedSig))
  ) {
    return null;
  }
  return { eventId, hash: hashEventToken(token) };
}

/** Build the public /e/[token] URL. Empty when NEXT_PUBLIC_APP_URL absent. */
/**
 * The /e/[token] link the attendee uses to reschedule or cancel.
 *
 * `base` should be the origin the booking was actually made on, because this
 * deployment answers on more than one host and the attendee should stay on
 * the brand they booked with. Callers that run inside a request pass
 * `siteOrigin()`; the QStash reminder callback has no request, so it falls
 * back to the configured URL.
 *
 * Returning "" used to be silent, and the confirmation email simply rendered
 * no "manage your booking" link at all. The attendee then had no way to
 * reschedule or cancel and no way to know why, which is exactly how this was
 * reported. It is still non-fatal, because a booking that exists is better
 * than a booking that failed, but it is no longer quiet.
 */
export function buildEventPublicUrl(token: string, base?: string | null): string {
  const origin = (base ?? process.env.NEXT_PUBLIC_APP_URL)?.replace(/\/$/, "");
  if (!origin) {
    console.error(
      "[booking] no origin for the manage-booking link: pass a base or set NEXT_PUBLIC_APP_URL. " +
        "The attendee will receive a confirmation with no reschedule or cancel link.",
    );
    return "";
  }
  return `${origin}/e/${token}`;
}
