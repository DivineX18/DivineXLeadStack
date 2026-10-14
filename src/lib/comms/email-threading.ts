import "server-only";

import crypto from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Reply addressing — how a prospect's reply finds its way back into the CRM.
 *
 * THE PROBLEM. Outbound email set Reply-To to whoever clicked Send, so the
 * reply landed in that person's personal mailbox and the CRM never saw it.
 * Nobody else on the team could read the conversation, and when a rep left,
 * the thread left with them. Pointing Reply-To at one shared workspace inbox
 * (the other thing this codebase tried) moves the problem rather than solving
 * it: now the rep cannot see replies to their own outreach.
 *
 * THE FIX. Send with a Reply-To we own and can route:
 *
 *   reply+<token>@<EMAIL_INBOUND_DOMAIN>
 *
 * A reply to that address arrives at our inbound webhook, which looks the
 * token up, finds the contact, and files the message on that contact's thread
 * in the unified inbox. Everyone with workspace access sees it, the rep
 * answers from the CRM, and nothing depends on one person's mailbox.
 *
 * WHY A STORED TOKEN rather than a signed, self-describing address. The first
 * attempt encoded the contact id in the address and HMAC-signed it, needing no
 * lookup. Two hard constraints killed it. (1) Mail systems treat local parts
 * as case-insensitive and routinely deliver them down-cased, but Firestore ids
 * are case-SENSITIVE — so a mixed-case id does not survive the round trip, and
 * neither does a signature computed over it. (2) RFC 5321 caps the local part
 * at 64 octets; hex-encoding a 20-character id to dodge the case problem
 * produced an 80-character local part. A random lowercase token sidesteps both,
 * costs one indexed read on a low-volume path, and is revocable, which a
 * signed address is not.
 *
 * WHY IT IS SAFE. The token is 128 bits of randomness and carries no
 * structure, so an unknown token is simply rejected — there is nothing to
 * forge. That matters because the address is public the moment the first email
 * goes out and anyone can send mail to it; without the lookup gate,
 * `reply+<any contact id>@…` would let a stranger inject a fake "reply" onto
 * any contact in any workspace. Tenancy is then re-read from the token
 * document, never from anything the address or the message body claims.
 *
 * ONE STABLE ADDRESS PER CONTACT, not per send: a human replying to last
 * week's message, or a mail client collapsing a thread, both still route. A
 * per-send address would strand older messages.
 */

/** Subdomain that receives replies, e.g. `inbound.divinex.io`. Needs MX
 *  records pointed at the inbound provider. Unset = inbound is off. */
function inboundDomain(): string | null {
  const raw = (process.env.EMAIL_INBOUND_DOMAIN ?? "").trim().toLowerCase();
  if (!raw) return null;
  // A bare hostname only. A value with a scheme or an @ is a
  // misconfiguration that would otherwise put an unroutable Reply-To on live
  // mail, which fails silently and loses real replies.
  if (/[^a-z0-9.-]/.test(raw) || !raw.includes(".")) return null;
  return raw;
}

/** True when a reply can actually be routed back into the CRM. */
export function inboundEmailConfigured(): boolean {
  return inboundDomain() !== null;
}

/** The mailbox local part before the `+`. The inbound domain's catch-all. */
const LOCAL_PREFIX = "reply";

/** Token docs live here; doc id IS the token. */
const COLLECTION = "emailReplyTokens";

export interface EmailReplyToken {
  token: string;
  contactId: string;
  subAccountId: string;
  agencyId: string;
}

/**
 * The Reply-To address for mail to this contact. Returns null when inbound is
 * not configured, so callers fall back to a real human mailbox rather than
 * minting an address no server is listening on.
 *
 * Creates the token on first use and reuses it forever after. Best-effort: a
 * Firestore failure here returns null and the send proceeds with the fallback
 * reply address, because losing a send is worse than losing threading.
 */
export async function buildReplyAddress(input: {
  contactId: string;
  subAccountId: string;
  agencyId: string;
}): Promise<string | null> {
  const domain = inboundDomain();
  if (!domain) return null;

  try {
    const db = getAdminDb();
    // One token per contact. Looking it up by contactId keeps the address
    // stable across every send, which is what makes replies to old mail work.
    const existing = await db
      .collection(COLLECTION)
      .where("contactId", "==", input.contactId)
      .limit(1)
      .get();
    const found = existing.docs[0]?.id;
    if (found) return `${LOCAL_PREFIX}+${found}@${domain}`;

    // Lowercase hex, because the address is delivered down-cased and the
    // token has to survive that unchanged.
    const token = crypto.randomBytes(16).toString("hex");
    await db.collection(COLLECTION).doc(token).set({
      token,
      contactId: input.contactId,
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
      createdAt: new Date(),
    });
    return `${LOCAL_PREFIX}+${token}@${domain}`;
  } catch (err) {
    console.warn("[email-threading] could not mint reply address", err);
    return null;
  }
}

/**
 * Resolve an address a reply was sent to back to its contact. Returns null for
 * any address we did not mint, which the webhook treats as unroutable rather
 * than guessing at a contact.
 */
export async function resolveReplyAddress(
  address: string,
): Promise<EmailReplyToken | null> {
  const domain = inboundDomain();
  if (!domain) return null;

  // Accept a bare address or a display form like `Name <reply+…@domain>`,
  // which is how most providers report the recipient.
  const angle = address.match(/<([^>]+)>\s*$/);
  const bare = (angle ? angle[1] : address).trim().toLowerCase();

  const at = bare.lastIndexOf("@");
  if (at < 0) return null;
  const local = bare.slice(0, at);
  if (bare.slice(at + 1) !== domain) return null;

  const plus = local.indexOf("+");
  if (plus < 0 || local.slice(0, plus) !== LOCAL_PREFIX) return null;

  const token = local.slice(plus + 1);
  // Shape-check before the read so a junk address costs no Firestore call.
  if (!/^[0-9a-f]{32}$/.test(token)) return null;

  try {
    const snap = await getAdminDb().collection(COLLECTION).doc(token).get();
    if (!snap.exists) return null;
    const data = snap.data() as EmailReplyToken;
    if (!data?.contactId || !data?.subAccountId) return null;
    return {
      token,
      contactId: data.contactId,
      subAccountId: data.subAccountId,
      agencyId: data.agencyId,
    };
  } catch (err) {
    console.warn("[email-threading] token lookup failed", err);
    return null;
  }
}

/** Exported so the verification script can exercise parsing without Firestore. */
export const __testing = { inboundDomain, LOCAL_PREFIX };
