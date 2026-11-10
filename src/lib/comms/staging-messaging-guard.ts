import "server-only";

/**
 * Outbound-messaging safety for a staging/test environment (2026-11-09
 * staging-isolation sprint).
 *
 * Deliberately NOT keyed off `isStagingDeployment()` — unlike the Firebase
 * and SSO guards, a blanket "non-production blocks all sends" rule would
 * break an already-documented, legitimate workflow: this repo's own
 * onboarding guide has buyers send real test SMS/email from local dev
 * against real Twilio/Resend creds and real numbers they own. Local dev is
 * "not production" by every signal this codebase has, and must keep working
 * exactly as documented.
 *
 * So this is a SEPARATE, narrower, fully opt-in switch. Both env vars
 * default unset, which is a true no-op — zero behavior change for
 * production, local dev, and every existing buyer deployment. Only a
 * deployment that explicitly sets `STAGING_BLOCK_LIVE_MESSAGING=true` (the
 * Render staging service, for the Growth System E2E run) gets the
 * allowlist enforced, and the allowlist itself is also explicit
 * (`STAGING_MESSAGING_ALLOWLIST`) — there is no credential-based inference
 * here, per this sprint's own instruction not to infer safety from
 * credential names alone.
 *
 * Throws rather than silently no-opping: a silently-swallowed send would
 * look identical to a delivered one to whatever UI reports success, and
 * this sprint explicitly rules out treating mocked/blocked delivery as real
 * delivery. A thrown, typed error is visible in logs and surfaces as a
 * normal failure to the caller, the same way SmsSuppressedError /
 * EmailAllowanceExhaustedError already do in this codebase.
 */

export class StagingMessagingBlockedError extends Error {
  constructor(public readonly to: string) {
    super(
      `Outbound send to "${to}" refused: STAGING_BLOCK_LIVE_MESSAGING=true and this ` +
        "recipient is not on STAGING_MESSAGING_ALLOWLIST. Add the exact test " +
        "recipient (email or E.164 phone) to that env var to allow it.",
    );
    this.name = "StagingMessagingBlockedError";
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function parseAllowlist(): Set<string> {
  const raw = process.env.STAGING_MESSAGING_ALLOWLIST ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => normalize(entry))
      .filter((entry) => entry.length > 0),
  );
}

/**
 * Call this immediately before any real outbound send (Twilio SMS/WhatsApp,
 * Resend email) — the transport, not the caller, so a new send path can't
 * forget it. `to` is whatever recipient string that transport is about to
 * dial/address (E.164 phone or email address).
 */
export function assertOutboundMessagingAllowed(to: string): void {
  if (process.env.STAGING_BLOCK_LIVE_MESSAGING !== "true") return;
  const allowlist = parseAllowlist();
  if (!allowlist.has(normalize(to))) {
    throw new StagingMessagingBlockedError(to);
  }
}
