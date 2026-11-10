import "server-only";
import { isStagingDeployment } from "@/lib/env/deployment-environment";

/**
 * Outbound-messaging safety for a staging/test environment (2026-11-09
 * staging-isolation sprint).
 *
 * The instruction this exists to satisfy says "ensure staging CANNOT
 * ACCIDENTALLY email/SMS real customers" — accidentally is the operative
 * word, so an opt-in-only switch that a deployer could simply forget to set
 * is not good enough. The default behavior is therefore keyed off
 * `isStagingDeployment()` (DEPLOYMENT_ENV=staging): staging is BLOCKED by
 * default, with an explicit allowlist for approved test recipients. Every
 * other deployment — production, local dev, every existing buyer
 * deployment — has never set DEPLOYMENT_ENV and defaults to unrestricted,
 * exactly as this repo's own onboarding guide already documents (buyers
 * send real test SMS/email from local dev against real Twilio/Resend creds
 * and real numbers they own; that must keep working unchanged).
 *
 * `STAGING_BLOCK_LIVE_MESSAGING` is an explicit override in BOTH directions:
 * "true" forces the block even outside a DEPLOYMENT_ENV=staging process
 * (useful for testing this guard itself, or any other environment that
 * wants it); "false" is the deliberate, explicit escape hatch for a staging
 * run that genuinely wants unrestricted sending. Unset defers to the
 * deployment's own posture. There is no credential-based inference anywhere
 * in this file, per this sprint's own instruction not to infer safety from
 * credential names alone.
 *
 * Throws rather than silently no-opping: a silently-swallowed send would
 * look identical to a delivered one to whatever UI reports success, and
 * this sprint explicitly rules out treating mocked/blocked delivery as real
 * delivery. A thrown, typed error is visible in logs and surfaces as a
 * normal failure to the caller, the same way SmsSuppressedError /
 * EmailAllowanceExhaustedError already do in this codebase.
 */

function isBlocked(): boolean {
  const explicit = process.env.STAGING_BLOCK_LIVE_MESSAGING;
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return isStagingDeployment();
}

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
  if (!isBlocked()) return;
  const allowlist = parseAllowlist();
  if (!allowlist.has(normalize(to))) {
    throw new StagingMessagingBlockedError(to);
  }
}
