import "server-only";

import { Resend } from "resend";

import type { ResendConfig } from "@/types/tenancy";

let _client: Resend | null = null;

export function getResend(): Resend {
  if (!_client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error(
        "RESEND_API_KEY is not set. Add it to .env.local to enable email.",
      );
    }
    _client = new Resend(key);
  }
  return _client;
}

export function emailIsConfigured(): boolean {
  // `.trim()` so a present-but-blank env var doesn't read as configured.
  return (
    !!process.env.RESEND_API_KEY?.trim() && !!process.env.EMAIL_FROM?.trim()
  );
}

/**
 * Resolves the From address for a sub-account under the platform-managed
 * sending model. Returns the tenant's dedicated sending-domain address only
 * when BOTH the agency-controlled gate is on AND the domain is verified;
 * otherwise undefined, so `sendEmail` falls back to the shared EMAIL_FROM.
 * The double check is deliberate: if an agency flips the gate off while a
 * verified resendConfig is still on the doc, runtime sending immediately
 * reverts to shared without waiting for the cleanup write.
 *
 * Pass the result straight into `sendEmail({ ..., from })`.
 */
export function tenantFrom(
  sub?: {
    resendConfig?: ResendConfig | null;
    emailDomainEnabledByAgency?: boolean;
  } | null,
): string | undefined {
  if (sub?.emailDomainEnabledByAgency !== true) return undefined;
  const cfg = sub.resendConfig;
  return cfg && cfg.status === "verified" ? cfg.emailFrom : undefined;
}

/**
 * THE LEAD OPTED IN TO A BUSINESS, NOT TO THE PLATFORM.
 *
 * Reproduced in the launch gate: a lead who opted in to "Brightwater Gutter
 * Cleaning" received mail from `Flow <notifications@divinex.io>` with no
 * Reply-To. "Flow" is this deployment's own brand — the platform the operator
 * bought, not the business the lead has any relationship with — and a reply
 * went to a platform inbox nobody at the business reads.
 *
 * So the DISPLAY NAME comes from the workspace, and the ADDRESS stays the
 * verified platform sender. That split is deliberate: the display name is
 * free text and costs nothing, while the address is what SPF and DKIM are
 * aligned against. Putting a customer's own domain in `From` without their
 * DNS would be spoofing, and it would land the mail in spam.
 *
 * Nothing here is model-generated. The name is the workspace name an operator
 * typed; the Reply-To is the address they configured. A funnel's copy cannot
 * reach this function.
 */
function sanitizeDisplayName(raw: string | null | undefined): string | null {
  // ALLOWLIST, NOT BLACKLIST. A blacklist has to anticipate every character
  // that could break a header; an allowlist only has to name the ones a
  // business display name legitimately needs. Note "@" is NOT in the set: an
  // unquoted display name containing one can be read as an address by some
  // parsers, and no real business name needs it.
  const name = (raw ?? "")
    .replace(/[^\p{L}\p{N} &'.\-/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name.length >= 2 ? name.slice(0, 64) : null;
}

/** The bare address out of an "Name <addr>" header, or the value unchanged. */
function addressOnly(header: string): string {
  const m = header.match(/<([^>]+)>/);
  return (m ? m[1] : header).trim();
}

function isValidEmail(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);
}

export interface WorkspaceSender {
  /** Pass as `from`. */
  from: string;
  /** Pass as `replyTo`. Undefined when the workspace has no valid address —
   *  an invented Reply-To is worse than none. */
  replyTo: string | undefined;
}

export function workspaceSender(
  sub?: {
    name?: string | null;
    replyToEmail?: string | null;
    resendConfig?: ResendConfig | null;
    emailDomainEnabledByAgency?: boolean;
  } | null,
): WorkspaceSender {
  // A verified dedicated domain still wins outright: that workspace has
  // proven the domain and should send fully as itself.
  const dedicated = tenantFrom(sub);
  const platform = process.env.EMAIL_FROM ?? "";
  const base = dedicated || platform;

  const display = sanitizeDisplayName(sub?.name);
  // No trustworthy business name: keep the platform sender exactly as
  // configured rather than inventing a brand for them.
  const from = display && !dedicated ? `${display} <${addressOnly(platform)}>` : base;

  const reply = (sub?.replyToEmail ?? "").trim();
  return { from, replyTo: isValidEmail(reply) ? reply : undefined };
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  from,
}: {
  to: string;
  subject: string;
  /** Plain-text fallback. Required so clients that don't render HTML still get content. */
  text: string;
  /** Optional rich-text body. Resend uses html when present, text as fallback. */
  html?: string;
  replyTo?: string;
  /**
   * Per-sub-account sender override. When a sub-account has a verified
   * dedicated sending domain, pass its `emailFrom` here (use `tenantFrom`).
   * Omit for platform/transactional sends — falls back to the deployment-wide
   * EMAIL_FROM shared sender.
   */
  from?: string;
}): Promise<{ id: string }> {
  const resolvedFrom = from ?? process.env.EMAIL_FROM;
  if (!resolvedFrom) {
    throw new Error(
      "EMAIL_FROM is not set. It must be a sender on a Resend-verified domain.",
    );
  }
  const client = getResend();
  const result = await client.emails.send({
    from: resolvedFrom,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
    replyTo,
  });
  if (result.error) {
    throw new Error(result.error.message || "Resend send failed");
  }
  if (!result.data?.id) {
    throw new Error("Resend send failed: no message id returned");
  }
  return { id: result.data.id };
}
