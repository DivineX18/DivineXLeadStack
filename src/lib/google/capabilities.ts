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
 * One rule, applied identically to all three services: a capability is true
 * when Google GRANTED the scope. Nothing else.
 *
 * Ads used to carry a second conjunct — `adsDeveloperTokenPresent` — because
 * the API refused every request without a developer token, which was approved
 * separately under a Google Ads manager account and had nothing to do with
 * the Cloud project. Google sunset developer tokens on 9 September 2026 and
 * moved access onto the Cloud project that owns the OAuth credentials, so
 * that conjunct now tests a credential that no longer exists. It is removed
 * rather than defaulted, because a parameter every caller passes `true` is a
 * conjunct that silently stopped meaning anything.
 *
 * This deliberately says NOTHING about whether Ads reporting will work — a
 * granted scope with no reachable Ads account produces an empty dashboard,
 * not an error. That distinction lives in googleAdsReadiness() below.
 */
export function deriveGoogleCapabilities(grantedScopes: string[]): GoogleCapabilities {
  const granted = new Set(grantedScopes);
  return {
    ga4: granted.has(SCOPE_FOR.ga4),
    searchConsole: granted.has(SCOPE_FOR.searchConsole),
    ads: granted.has(SCOPE_FOR.ads),
  };
}

/**
 * How far along the Ads chain a workspace actually is.
 *
 * Four facts have to be true before a single Ads number can be reported, and
 * they become true at different times for different reasons. Collapsing them
 * into one boolean is how you get a card that says "connected" over an empty
 * dashboard, with no way to tell whether the client declined the scope, the
 * account was never resolved, or Google refused:
 *
 *   1. The deployment can request Ads authorization — OAuth credentials, so
 *      a Cloud project carrying an Ads API access level. Tested server-side
 *      by googleConfigured() and enforced by the connect route, which is why
 *      it is not a state here: this function only ever runs against a stored
 *      connection, which could not exist without it.
 *   2. The workspace granted `adwords`. The consent screen has a checkbox per
 *      scope, so a client can hand over Analytics and decline Ads in one
 *      click.
 *   3. An Ads customer has been resolved for the workspace.
 *   4. The Ads API has actually answered. Today nothing records that, so this
 *      function cannot claim it, and `ready` means "resolved" — see below.
 *
 * `adsCustomerId` carries fact 3 ONLY because it is written exclusively from
 * a Google-verified resolution, never from operator input. That invariant is
 * the whole reason this is trustworthy: an id someone typed proves access to
 * nothing, and a pasted id belonging to another advertiser proves less than
 * nothing. scripts/verify-google-ads-activation.mts asserts no request body
 * can set it.
 */
export const GOOGLE_ADS_READINESS = [
  /** No stored Google connection for this workspace. */
  "not_connected",
  /** Connected, but `adwords` was never asked for or was declined. */
  "scope_not_granted",
  /** Scope granted; no Ads customer resolved from Google yet. */
  "customer_unresolved",
  /** Scope granted and a Google-resolved customer is bound. */
  "ready",
] as const;
export type GoogleAdsReadiness = (typeof GOOGLE_ADS_READINESS)[number];

export function googleAdsReadiness(
  config:
    | {
        connected?: boolean;
        capabilities?: GoogleCapabilities | null;
        adsCustomerId?: string | null;
      }
    | null
    | undefined,
): GoogleAdsReadiness {
  if (config?.connected !== true) return "not_connected";
  if (!googleCan(config, "ads")) return "scope_not_granted";
  // A blank string is not a customer id. Trimmed because a stray space in a
  // stored value would otherwise read as a resolved account.
  if (!config.adsCustomerId?.trim()) return "customer_unresolved";
  return "ready";
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
