import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifySvixSignature } from "@/lib/comms/webhook-signature";
import { resolveReplyAddress } from "@/lib/comms/email-threading";
import { upsertConversationForMessage } from "@/lib/server/conversations-service";

/**
 * Inbound email → the unified inbox.
 *
 *   POST /api/webhooks/email/inbound
 *
 * This is the half of email the CRM never had. Outbound worked; replies went
 * to one person's mailbox and vanished from the product, so a teammate could
 * not read the answer to their own outreach, let alone a colleague's.
 *
 * A reply arrives addressed to `reply+<token>@<EMAIL_INBOUND_DOMAIN>` (see
 * lib/comms/email-threading.ts). The token names the contact; everything else
 * — tenancy above all — is read from the token document, never from the
 * message. Treating sender headers as identity would let anyone post a message
 * into any workspace by naming it.
 *
 * Public route; the signature is the credential. Two shapes are accepted
 * because the provider market has not settled: a Svix-signed provider webhook
 * (Resend inbound), and a plain bearer-token POST from a forwarder such as a
 * Cloudflare Email Worker. Both end in the same normalized record, so swapping
 * providers does not touch anything downstream.
 *
 * ALWAYS 200s on an unroutable message. Mail to a catch-all domain includes
 * bounces, auto-replies and outright spam; a non-2xx would have the provider
 * retry junk for days.
 */

/** Trim quoted history so the inbox preview shows the actual reply, not the
 *  whole thread re-quoted beneath it. */
const QUOTE_MARKERS = [
  /^On .+ wrote:$/m,
  /^-{2,}\s*Original Message\s*-{2,}$/im,
  /^_{10,}$/m,
  /^From:\s.+$/m,
];

function stripQuotedReply(text: string): string {
  let cut = text.length;
  for (const marker of QUOTE_MARKERS) {
    const m = text.match(marker);
    if (m?.index !== undefined && m.index < cut) cut = m.index;
  }
  const trimmed = text.slice(0, cut).trim();
  // If stripping left nothing, the whole message looked like a quote — keep
  // the original rather than filing an empty reply.
  return trimmed.length > 0 ? trimmed : text.trim();
}

interface NormalizedInbound {
  /** The address the reply was sent TO — carries our routing token. */
  to: string[];
  fromEmail: string;
  subject: string;
  text: string;
  /** Provider's id for the inbound message, for dedupe. */
  providerMessageId: string | null;
}

/** Map a provider payload onto the shape this route works with. Unknown
 *  shapes return null rather than half-reading a message. */
function normalize(payload: unknown): NormalizedInbound | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  // Resend nests the mail under `data`; a bare forwarder posts it flat.
  const d = (root.data ?? root) as Record<string, unknown>;

  const asList = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    if (typeof v === "string") return [v];
    return [];
  };

  // `to` is where our token lives, but a reply can reach us via Cc or Bcc, or
  // land on the envelope recipient only — so consider all of them.
  const to = [
    ...asList(d.to),
    ...asList(d.cc),
    ...asList(d.bcc),
    ...asList((d.envelope as Record<string, unknown> | undefined)?.to),
    ...asList(d.recipient),
  ];
  if (to.length === 0) return null;

  const fromRaw = typeof d.from === "string" ? d.from : "";
  const fromObj =
    d.from && typeof d.from === "object"
      ? ((d.from as Record<string, unknown>).address as string | undefined)
      : undefined;
  const from = fromObj ?? fromRaw;

  const text =
    (typeof d.text === "string" && d.text) ||
    (typeof d.plain === "string" && d.plain) ||
    // Last resort: strip tags off the HTML part so a text-less reply is not
    // dropped. Crude on purpose — the inbox renders plain text.
    (typeof d.html === "string"
      ? d.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      : "");

  return {
    to,
    fromEmail: from,
    subject: typeof d.subject === "string" ? d.subject : "(no subject)",
    text: typeof text === "string" ? text : "",
    providerMessageId:
      (typeof d.email_id === "string" && d.email_id) ||
      (typeof d.message_id === "string" && d.message_id) ||
      (typeof root.id === "string" && root.id) ||
      null,
  };
}

/** Signature OR bearer token, depending on which the deployment configured. */
function authorize(request: Request, rawBody: string): { ok: boolean; reason?: string } {
  const svixSecret = process.env.EMAIL_INBOUND_WEBHOOK_SECRET;
  if (svixSecret?.startsWith("whsec_")) {
    const r = verifySvixSignature({ rawBody, headers: request.headers, secret: svixSecret });
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  }
  if (svixSecret) {
    // Shared-secret bearer, for a forwarder that cannot produce a Svix
    // signature. Constant-time compared so the secret cannot be recovered a
    // byte at a time by timing the responses.
    const header = request.headers.get("authorization") ?? "";
    const presented = header.replace(/^Bearer\s+/i, "");
    const a = Buffer.from(presented);
    const b = Buffer.from(svixSecret);
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    return match ? { ok: true } : { ok: false, reason: "bad_bearer" };
  }
  return { ok: false, reason: "not_configured" };
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const auth = authorize(request, rawBody);
  if (!auth.ok) {
    if (auth.reason === "not_configured") {
      return NextResponse.json(
        { error: "Inbound email is not configured on this deployment." },
        { status: 503 },
      );
    }
    console.warn("[webhooks/email/inbound] rejected", auth.reason);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable" });
  }

  const mail = normalize(parsed);
  if (!mail) return NextResponse.json({ ok: true, ignored: "unrecognized_shape" });

  // Find the first recipient that carries one of our routing tokens.
  let routed: Awaited<ReturnType<typeof resolveReplyAddress>> = null;
  for (const candidate of mail.to) {
    routed = await resolveReplyAddress(candidate);
    if (routed) break;
  }
  if (!routed) {
    // Mail to the catch-all that was not a reply to anything we sent: a
    // bounce notice, spam, or someone guessing addresses. Accepted and
    // dropped — nothing to attach it to, and no workspace to show it in.
    return NextResponse.json({ ok: true, ignored: "unroutable" });
  }

  const body = stripQuotedReply(mail.text).slice(0, 20000);
  const db = getAdminDb();

  // Doc id is the provider's message id where there is one, so a redelivered
  // webhook updates one row instead of filing the same reply twice.
  const messageRef = mail.providerMessageId
    ? db
        .collection("contacts")
        .doc(routed.contactId)
        .collection("emailMessages")
        .doc(mail.providerMessageId)
    : db
        .collection("contacts")
        .doc(routed.contactId)
        .collection("emailMessages")
        .doc();

  try {
    await messageRef.set(
      {
        direction: "inbound",
        subject: mail.subject,
        body,
        fromEmail: mail.fromEmail,
        // Tenancy from the token document, never from the message.
        subAccountId: routed.subAccountId,
        agencyId: routed.agencyId,
        contactId: routed.contactId,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      },
      { merge: true },
    );
  } catch (err) {
    // A storage failure IS worth a retry — the reply would otherwise be lost.
    console.error("[webhooks/email/inbound] message write failed", err);
    return NextResponse.json({ error: "Storage failed" }, { status: 500 });
  }

  const contactSnap = await db.collection("contacts").doc(routed.contactId).get();
  const contact = contactSnap.data() as
    | { name?: string; email?: string; phone?: string }
    | undefined;

  await upsertConversationForMessage({
    contactId: routed.contactId,
    subAccountId: routed.subAccountId,
    agencyId: routed.agencyId,
    contactName: contact?.name || contact?.email || mail.fromEmail,
    contactPhone: contact?.phone || null,
    channel: "email",
    direction: "inbound",
    body: body || mail.subject,
  });

  try {
    await db
      .collection("contacts")
      .doc(routed.contactId)
      .collection("activities")
      .add({
        type: "email_received",
        content: `Email reply: ${mail.subject}`,
        createdBy: "system:inbound-email",
        meta: { subject: mail.subject, fromEmail: mail.fromEmail },
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[webhooks/email/inbound] activity write failed", err);
  }

  return NextResponse.json({ ok: true, contactId: routed.contactId });
}
