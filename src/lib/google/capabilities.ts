/**
 * What a stored Google connection can ACTUALLY do.
 *
 * Client-safe by design: no "server-only" guard and no secret access, so the
 * settings card and dashboard components can import it. This mirrors
 * lib/comms/meta-capabilities.ts, which was split out of the server-only
 * meta.ts for exactly this reason.
 *
 * The rule these encode: a capability is true only when Google GRANTED the
 * scope. A consent screen lists every scope with its own checkbox, so a client
 * can hand over GA4 and decline Ads in the same click. Trusting what we
 * REQUESTED would leave an Ads card looking connected while every sync 403s.
 */

import type { GoogleService, GoogleCapabilitiesShape } from "@/types/tenancy";

/** Re-exported from the type layer so callers have one name for one shape. */
export type GoogleCapabilities = GoogleCapabilitiesShape;

const SCOPE_FOR: Record<GoogleService, string> = {
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  searchConsole: "https://www.googleapis.com/auth/webmasters.readonly",
  ads: "https://www.googleapis.com/auth/adwords",
};

/**
 * Derive capabilities from the granted scope list.
 *
 * `adsDeveloperTokenPresent` is a second, independent gate: the `adwords`
 * scope is necessary but NOT sufficient, because the Ads API refuses every
 * request without a developer token, which is approved separately under a
 * Google Ads manager account and has nothing to do with the Cloud project. A
 * client can grant Ads access on a deployment that cannot yet use it, and the
 * card must say so rather than fail at sync time.
 */
export function deriveGoogleCapabilities(
  grantedScopes: string[],
  opts: { adsDeveloperTokenPresent: boolean },
): GoogleCapabilities {
  const granted = new Set(grantedScopes);
  return {
    ga4: granted.has(SCOPE_FOR.ga4),
    searchConsole: granted.has(SCOPE_FOR.searchConsole),
    ads: granted.has(SCOPE_FOR.ads) && opts.adsDeveloperTokenPresent,
  };
}

/** Narrow reads so a missing/legacy capabilities block is treated as off. */
export function googleCan(
  config: { capabilities?: GoogleCapabilities | null } | null | undefined,
  service: GoogleService,
): boolean {
  return config?.capabilities?.[service] === true;
}

/** True when the connection is usable for at least one service. */
export function googleHasAnyCapability(
  config: { capabilities?: GoogleCapabilities | null } | null | undefined,
): boolean {
  const c = config?.capabilities;
  return !!c && (c.ga4 || c.searchConsole || c.ads);
}
