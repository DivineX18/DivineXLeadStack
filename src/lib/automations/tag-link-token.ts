import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Per-contact, per-tag one-click links — the `{{tagLink:slug}}` merge tag
 * (lib/automations/merge-tags.ts) resolves to one of these. Clicking it
 * applies exactly one tag to exactly one contact, which is what a workflow's
 * `contact.tag.added` trigger (lib/workflows/engine.ts) branches on.
 *
 * Token format, same self-contained shape as the unsubscribe token
 * (unsubscribe-token.ts) and the SAME secret — rotating
 * AUTOMATIONS_TOKEN_SECRET invalidates every outstanding tag-link too, by
 * design, one secret for every public link this HMACs:
 *
 *   `${contactId}.${tag}.${HMAC-SHA256(`${contactId}.${tag}`, AUTOMATIONS_TOKEN_SECRET)}`
 *
 * Both `contactId` (a Firestore auto-ID) and `tag` are validated against
 * character sets that can never contain a `.`, so splitting the token on
 * "." into exactly three parts is unambiguous.
 */

/** Same shape tags already take everywhere else (contact.tags entries, the
 *  `has_tag` filter operand): lowercase, digits, internal hyphens. */
const TAG_SHAPE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const CONTACT_ID_SHAPE = /^[A-Za-z0-9_-]+$/;

function getSecret(): string {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTOMATIONS_TOKEN_SECRET is not set (or too short). Generate one with `openssl rand -base64 32`.",
    );
  }
  return s;
}

function sign(contactId: string, tag: string): string {
  return createHmac("sha256", getSecret()).update(`${contactId}.${tag}`).digest("hex");
}

export function signTagLinkToken(contactId: string, tag: string): string {
  if (!CONTACT_ID_SHAPE.test(contactId)) {
    throw new Error("Unexpected contactId format for tag-link token");
  }
  if (!TAG_SHAPE.test(tag)) {
    throw new Error(`Unexpected tag format for tag-link token: ${tag}`);
  }
  return `${contactId}.${tag}.${sign(contactId, tag)}`;
}

export interface VerifiedTagLink {
  contactId: string;
  tag: string;
}

/**
 * Returns the {contactId, tag} the token encodes, or null if it's malformed,
 * doesn't match either shape, or the signature doesn't verify. Timing-safe
 * compare, same reasoning as verifyUnsubscribeToken.
 */
export function verifyTagLinkToken(token: string): VerifiedTagLink | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [contactId, tag, sig] = parts;
  if (!contactId || !tag || !sig) return null;
  if (!CONTACT_ID_SHAPE.test(contactId) || !TAG_SHAPE.test(tag)) return null;

  let expected: string;
  try {
    expected = sign(contactId, tag);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? { contactId, tag } : null;
}

/**
 * Build the full tag-link URL for a `{{tagLink:slug}}` occurrence. Empty
 * string when NEXT_PUBLIC_APP_URL isn't configured, or when `tag` doesn't
 * match the allowed shape — mirrors buildUnsubscribeUrl's "template still
 * renders, just with a broken link" contract: a malformed slug in a template
 * must never crash a send.
 */
export function buildTagLinkUrl(contactId: string, tag: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return "";
  try {
    return `${base}/t/${signTagLinkToken(contactId, tag)}`;
  } catch {
    return "";
  }
}
