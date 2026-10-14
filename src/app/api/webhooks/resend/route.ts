import { NextResponse } from "next/server";
import { verifySvixSignature } from "@/lib/comms/webhook-signature";
import {
  applyProviderEmailEvent,
  type ProviderEventKind,
} from "@/lib/server/email-events-service";

/**
 * Resend delivery events → the sent-email log.
 *
 *   POST /api/webhooks/resend
 *
 * Public route; the signature is the credential, same model as every other
 * provider callback here (QStash, Twilio, Stripe, Meta). Configure it at
 * Resend → Webhooks with the event types below and put the `whsec_…` signing
 * secret in RESEND_WEBHOOK_SECRET.
 *
 * ALWAYS 200s once the signature checks out, even when the event is for a
 * message this log has never heard of. Providers retry non-2xx, and a message
 * sent before this log existed would otherwise be retried for days.
 *
 * An unsigned or badly signed request is 401 — that one has to be rejected,
 * because open/click data is the basis of how a rep's work gets judged and
 * anyone could otherwise post fake opens.
 */

/** Resend's event names → what this log records. Anything absent is ignored
 *  rather than guessed at. `email.sent` and `email.delivered` carry no new
 *  information: the row was created at send time. */
const EVENT_KINDS: Record<string, ProviderEventKind> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

interface ResendEvent {
  type?: string;
  data?: {
    email_id?: string;
    bounce?: { message?: string; subType?: string };
    click?: { link?: string };
  };
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Not configured is not an error the provider should retry into — the
    // operator has to set the secret. 503 says "not here", not "try again".
    return NextResponse.json(
      { error: "Email event tracking is not configured on this deployment." },
      { status: 503 },
    );
  }

  // Raw bytes, before parsing: the signature covers the exact body, and
  // re-serializing parsed JSON changes it.
  const rawBody = await request.text();

  const verified = verifySvixSignature({
    rawBody,
    headers: request.headers,
    secret,
  });
  if (!verified.ok) {
    console.warn("[webhooks/resend] rejected", verified.reason);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    // Signed but unparseable. Retrying cannot fix it, so take it off the queue.
    return NextResponse.json({ ok: true, ignored: "unparseable" });
  }

  const kind = event.type ? EVENT_KINDS[event.type] : undefined;
  const messageId = event.data?.email_id;
  if (!kind || !messageId) {
    return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
  }

  const detail =
    kind === "bounced"
      ? [event.data?.bounce?.subType, event.data?.bounce?.message]
          .filter(Boolean)
          .join(": ") || null
      : null;

  const result = await applyProviderEmailEvent({ messageId, kind, detail });

  // 200 regardless. See the note above about retries.
  return NextResponse.json({ ok: true, ...result });
}
