import "server-only";

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
  const h = u.hostname.toLowerCase();
  // The exact shapes that produced the outage.
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h.endsWith(".local")) return null;
  return v;
}

/** The URL to POST the SSO authorization code to. Never localhost. */
export function resolveAscendExchangeUrl(): string {
  return usable(process.env.ASCEND_SSO_EXCHANGE_URL) ?? CANONICAL;
}
