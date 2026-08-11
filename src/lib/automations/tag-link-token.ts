import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Per-contact, per-tag "click this link to tag yourself" tokens. Powers
 * the {{tagLink:some-tag}} merge tag — the email-segmentation mechanism
 * a Workflow can react to via a `contact.tag.added` trigger or an
 * `if_else` `has_tag` branch, without the recipient filling out a form.
 *
 * Format (self-contained, no DB lookup, mirrors unsubscribe-token.ts):
 *
 *   `${contactId}.${tag}.${HMAC-SHA256(`${contactId}.${tag}`, SECRET)}`
 *
 * Restricting `tag` to a safe charset (alphanumeric/hyphen/underscore) —
 * enforced both at build time and verify time — keeps the dot-delimited
 * format unambiguous and doubles as sane tag hygiene.
 */

const SAFE_TAG_RE = /^[A-Za-z0-9_-]{1,80}$/;

function getSecret(): string {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTOMATIONS_TOKEN_SECRET is not set (or too short). Generate one with `openssl rand -base64 32`.",
    );
  }
  return s;
}

export function signTagLinkToken(contactId: string, tag: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(contactId)) {
    throw new Error("Unexpected contactId format for tag-link token");
  }
  if (!SAFE_TAG_RE.test(tag)) {
    throw new Error(
      `Tag "${tag}" isn't safe for a tag-link — use only letters, numbers, "-", "_" (max 80 chars).`,
    );
  }
  const payload = `${contactId}.${tag}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/**
 * Returns { contactId, tag } if the token is valid, or null otherwise.
 * Timing-safe compare on the signature.
 */
export function verifyTagLinkToken(
  token: string,
): { contactId: string; tag: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [contactId, tag, presentedSig] = parts;
  if (!contactId || !tag || !presentedSig) return null;

  let expected: string;
  try {
    expected = signTagLinkToken(contactId, tag);
  } catch {
    return null;
  }
  if (token.length !== expected.length) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? { contactId, tag } : null;
}

/** Full shareable tag-link URL for an outbound email. Empty string when
 *  NEXT_PUBLIC_APP_URL isn't configured. */
export function buildTagLinkUrl(contactId: string, tag: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/r/${signTagLinkToken(contactId, tag)}`;
}
