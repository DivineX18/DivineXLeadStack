import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/**
 * Client IP for the public hosted-form endpoint (rate limiting + geolocation).
 *
 * The old code trusted the FIRST X-Forwarded-For entry, which is whatever the
 * caller chose to send, so a per-IP limit could be dodged by inventing a new
 * value on every request (and a contact's location could be forged). Sources,
 * in order of trust:
 *
 *   1. A visitor IP attested by a trusted proxy. divinex.io's server forwards
 *      contact-form submissions to Flow server-to-server, so Flow only sees the
 *      website's own address; to keep per-visitor limits working the proxy
 *      signs the visitor IP with a shared secret (FORMS_PROXY_SECRET). A valid
 *      signature is unforgeable without the secret and is only honoured for a
 *      few minutes.
 *   2. CF-Connecting-IP. Every production request arrives through Cloudflare,
 *      which overwrites this header with the real peer address.
 *   3. Development only: the first X-Forwarded-For entry.
 *
 * With no secret configured the attestation path is simply off.
 */

const LABEL = "forms-client-ip-v1";
const MAX_SKEW_SECONDS = 5 * 60;

export const ATTEST_HEADERS = {
  ip: "x-divinex-client-ip",
  ts: "x-divinex-client-ip-ts",
  sig: "x-divinex-client-ip-sig",
} as const;

export function signClientIp(secret: string, ip: string, tsSeconds: number): string {
  return createHmac("sha256", secret).update(`${LABEL}|${ip}|${tsSeconds}`).digest("base64url");
}

export function resolveFormClientIp(
  headers: Headers,
  opts: { secret?: string | null; nowMs?: number; nodeEnv?: string } = {},
): string {
  const secret = (opts.secret ?? process.env.FORMS_PROXY_SECRET ?? "").trim();
  const now = Math.floor((opts.nowMs ?? Date.now()) / 1000);

  if (secret.length >= 16) {
    const ip = headers.get(ATTEST_HEADERS.ip)?.trim() ?? "";
    const ts = Number(headers.get(ATTEST_HEADERS.ts));
    const sig = headers.get(ATTEST_HEADERS.sig)?.trim() ?? "";
    if (ip && sig && isIP(ip) && Number.isFinite(ts) && Math.abs(now - ts) <= MAX_SKEW_SECONDS) {
      const expected = Buffer.from(signClientIp(secret, ip, ts));
      const given = Buffer.from(sig);
      if (given.length === expected.length && timingSafeEqual(given, expected)) return ip;
    }
  }

  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf && isIP(cf)) return cf;

  if ((opts.nodeEnv ?? process.env.NODE_ENV) !== "production") {
    const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (first && isIP(first)) return first;
  }
  return "unknown";
}
