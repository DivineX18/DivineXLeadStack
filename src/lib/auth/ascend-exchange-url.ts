import "server-only";

import { isStagingDeployment } from "@/lib/env/deployment-environment";

/**
 * A LOCALHOST EXCHANGE URL IS NEVER RIGHT IN PRODUCTION.
 *
 * Flow's SSO callback POSTs the one-time code to Ascend server-to-server.
 * That target came straight from `ASCEND_SSO_EXCHANGE_URL`, unvalidated, and
 * in production it pointed somewhere unreachable: the fetch threw and every
 * Operations click ended on `?reason=network_error`. Verified in production
 * against a deliberately invalid code, which should have produced
 * `exchange_rejected` from a reachable Ascend and produced `network_error`
 * instead.
 *
 * An env var that has silently drifted to a dev value is a known failure mode
 * on this deployment, so the value is checked rather than trusted, and a
 * refused value falls back to the canonical service URL instead of stranding
 * the customer. Setting the var correctly still works and still wins; this
 * only refuses values that cannot possibly be right.
 */

/** The canonical Ascend intelligence service. Deliberately the service URL
 *  rather than a customer domain: this is a server-to-server call. */
const CANONICAL = "https://divinex-business-intelligence.onrender.com/api/sso/operations/exchange";

/**
 * Only the intelligence service answers this endpoint, so the host is an
 * ALLOW-LIST rather than a loopback denylist.
 *
 * Refusing loopback alone was not enough. After that shipped, production
 * still returned `network_error` for a deliberately invalid code — which a
 * reachable Ascend answers with `exchange_rejected` — so the configured
 * value was a plausible-looking https URL that simply does not answer. A
 * Render dashboard value also outranks render.yaml on an existing service,
 * which is exactly how it drifted and stayed drifted.
 *
 * `divinex-business-intelligence.onrender.com` is the canonical BI service
 * and `ascend.divinex.io` is its customer-facing domain. Nothing else can be
 * correct here, so nothing else is accepted.
 */
const ALLOWED_HOSTS = new Set([
  "divinex-business-intelligence.onrender.com",
  "ascend.divinex.io",
]);

function usable(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return null;
  return v;
}

/**
 * Staging isolation (2026-11-09): CANONICAL above is the production Ascend
 * Intelligence service, and the allowlist has no staging counterpart to
 * fall back to — there is no staging Ascend BI deployment today. Without
 * this check, a DEPLOYMENT_ENV=staging Flow service would silently exchange
 * a one-time SSO code against the REAL production Ascend service over the
 * network, server-to-server, on every SSO callback it receives. That is a
 * live cross-environment call this sprint explicitly rules out ("do not
 * touch production", "ensure staging does not invoke production workflows").
 * Returning null here makes the callback route fail cleanly
 * (`not_configured`) instead of silently reaching production.
 */
export function resolveAscendExchangeUrl(): string | null {
  if (isStagingDeployment()) return null;
  return usable(process.env.ASCEND_SSO_EXCHANGE_URL) ?? CANONICAL;
}
