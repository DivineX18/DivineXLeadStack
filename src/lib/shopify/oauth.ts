import "server-only";

import crypto from "node:crypto";

/**
 * Shopify OAuth for commerce intelligence: ONE connection per workspace,
 * read-only, feeding orders/refunds/product performance into Ascend.
 *
 * Modelled on lib/google/oauth.ts (same signed-state trick, same
 * single-shared-redirect-URI rule), with three deliberate Shopify-specific
 * differences, each verified against Shopify's own current documentation
 * (shopify.dev, 2026-10-29) rather than assumed from this codebase's other
 * integrations:
 *
 *   1. EXPIRING TOKENS ARE MANDATORY, not an option. As of April 1 2026,
 *      every new Shopify app must request expiring offline access tokens
 *      (`expiring=1` at token exchange) -- the old permanent-offline-token
 *      model the Website Factory's existing `admin_token` connection mode
 *      uses is being retired industry-wide (all apps, not just new ones,
 *      must migrate by January 1 2027). An access token now lasts 1 hour;
 *      the refresh token lasts 90 days AND ROTATES on every use (Shopify
 *      returns a NEW refresh token on each refresh, replacing the old one)
 *      -- see refreshShopifyToken() below, which persists the rotated
 *      refresh token, not just the new access token.
 *
 *   2. APP DISTRIBUTION. "Custom distribution" (the Dev Dashboard's
 *      replacement for the old in-admin custom-app flow) is explicitly
 *      scoped by Shopify to one merchant or multiple stores under the SAME
 *      Plus organization -- NOT to many independent, unrelated merchants,
 *      which is DivineX's actual shape (one agency, many separate client
 *      orgs). Shopify's own distribution-method guidance for that case is
 *      "Public" distribution, in its "unlisted" (limited-visibility)
 *      variant: never searchable in the App Store, installed only via a
 *      direct link, but still requires completing Shopify's App Store
 *      listing review. That review is a real, external, human-initiated
 *      step this code cannot perform or bypass -- see the implementation
 *      report for the current status.
 *
 *   3. SHOPIFY SIGNS ITS OWN CALLBACK, separately from our CSRF state. The
 *      authorize redirect carries our HMAC-signed `state` (proves the
 *      callback matches a connect WE initiated, for THIS workspace) exactly
 *      like Google's. But Shopify ALSO appends its own `hmac` query
 *      parameter to the callback, computed over every other param with our
 *      client secret -- proving the callback request itself genuinely came
 *      from Shopify and wasn't forged by a third party who merely knows a
 *      valid state. Google has no equivalent; verifyShopifyCallbackHmac()
 *      below is Shopify-specific and has no Google analogue to mirror.
 */

/** Least-privilege for this initial slice: orders (last 60 days -- see the
 *  implementation report on why read_all_orders is deferred) and products,
 *  for product-level performance. No customer-data scope: returning-vs-new
 *  customer segmentation is explicitly deferred (see
 *  lib/shopify/observations.ts's header) and requesting a scope this slice
 *  does not use would violate the task's own least-privilege instruction. */
export const SHOPIFY_SCOPES = ["read_orders", "read_products"] as const;

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export class ShopifyOAuthError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string = "",
  ) {
    super(`shopify oauth: ${code}${detail ? ` (${detail})` : ""}`);
  }
}

/** True when the deployment has Shopify OAuth app credentials configured.
 *  Gate every connect attempt on this, same as googleConfigured(). */
export function shopifyOAuthConfigured(): boolean {
  return !!process.env.SHOPIFY_OAUTH_CLIENT_ID && !!process.env.SHOPIFY_OAUTH_CLIENT_SECRET && !!shopifyRedirectUri();
}

/** ONE redirect URI for the whole deployment -- Shopify, like Google,
 *  requires an exact match against what's registered for the app, so a
 *  per-workspace path would mean re-registering for every client. */
export function shopifyRedirectUri(): string | null {
  const explicit = process.env.SHOPIFY_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return base ? `${base}/api/shopify/callback` : null;
}

/** Normalizes whatever an operator might type (a bare shop name, a full
 *  myshopify.com URL, or the admin.shopify.com URL Shopify's own UI shows
 *  today) into the canonical *.myshopify.com domain this code validates
 *  everywhere else. Refuses rather than guesses on anything else, per the
 *  same "guessing is worse than refusing" rule googleAdsManagerCustomerId
 *  already applies to a different kind of pasted value. */
export function normalizeShopDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (SHOP_DOMAIN_RE.test(trimmed)) return trimmed;
  // A bare handle, no dots at all -- the common case when an operator just
  // types the store name.
  if (/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) return `${trimmed}.myshopify.com`;
  return null;
}

// ── CSRF state ───────────────────────────────────────────────────────────────
// Same HMAC construction as signGoogleState/verifyGoogleState (a distinct
// prefix so a state minted for one provider can't be replayed at another),
// but with "|" instead of "." as the field separator. Google's equivalent
// state never embeds a value that can contain a literal ".", so splitting
// on it is safe there -- a Shopify shop domain ALWAYS contains at least
// two dots ("store.myshopify.com"), so a "."-delimited 4-field split would
// see 6 fields for a real shop and refuse every genuine state. "|" cannot
// appear in subAccountId (a Firestore doc id), nonce (hex), or a shop
// domain (dots, letters, digits, hyphens only), so it has no such
// collision.

function stateSecret(): string {
  return process.env.AUTOMATIONS_TOKEN_SECRET ?? "";
}

export function signShopifyState(subAccountId: string, nonce: string, shop: string): string {
  const payload = `${subAccountId}|${nonce}|${shop}`;
  const sig = crypto.createHmac("sha256", stateSecret()).update(`shopifystate:${payload}`).digest("hex");
  return `${payload}|${sig}`;
}

export function verifyShopifyState(state: string): { subAccountId: string; shop: string } | null {
  if (!stateSecret()) return null;
  const parts = state.split("|");
  if (parts.length !== 4) return null;
  const [subAccountId, nonce, shop, sig] = parts;
  const expected = crypto.createHmac("sha256", stateSecret()).update(`shopifystate:${subAccountId}|${nonce}|${shop}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!SHOP_DOMAIN_RE.test(shop)) return null;
  return { subAccountId, shop };
}

/**
 * Verifies Shopify's OWN `hmac` query parameter on the OAuth callback --
 * separate from, and in addition to, our CSRF `state`. Per Shopify's
 * current documentation: remove `hmac`, sort the remaining params
 * alphabetically, URL-encode-join them, HMAC-SHA256 with the app's client
 * secret, compare timing-safe. Without this check, anyone who intercepted
 * or guessed a valid `state` could still not forge a believable callback,
 * but this check is what proves the request came from Shopify's own
 * servers in the first place, independent of state.
 */
export function verifyShopifyCallbackHmac(params: URLSearchParams): boolean {
  const secret = process.env.SHOPIFY_OAUTH_CLIENT_SECRET;
  if (!secret) return false;
  const provided = params.get("hmac");
  if (!provided) return false;
  const pairs: string[] = [];
  for (const [key, value] of params) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const message = pairs.join("&");
  const expected = crypto.createHmac("sha256", secret).update(message).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The shop domain pattern Shopify itself documents for validating the
 *  callback's `shop` param, independent of our own state's shop value --
 *  both are checked, and must agree, in the callback route. */
export function isValidShopDomain(shop: string): boolean {
  return SHOP_DOMAIN_RE.test(shop);
}

// ── authorize ────────────────────────────────────────────────────────────────

export function buildShopifyOAuthUrl(opts: { shop: string; redirectUri: string; state: string; scopes: readonly string[] }): string {
  const u = new URL(`https://${opts.shop}/admin/oauth/authorize`);
  u.searchParams.set("client_id", process.env.SHOPIFY_OAUTH_CLIENT_ID ?? "");
  u.searchParams.set("scope", opts.scopes.join(","));
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("state", opts.state);
  return u.toString();
}

// ── token exchange + refresh ─────────────────────────────────────────────────

export interface ShopifyTokenResponse {
  accessToken: string;
  /** Present on expiring-token exchanges (see the file header) -- null
   *  would mean Shopify issued the legacy permanent-token shape instead,
   *  which this code refuses rather than silently storing a token it has
   *  no refresh plan for. */
  refreshToken: string | null;
  grantedScopes: string[];
  /** Seconds from now. */
  expiresInSec: number;
  /** Seconds from now, for the refresh token itself (90 days per Shopify's
   *  current documentation). */
  refreshTokenExpiresInSec: number | null;
}

async function tokenRequest(shop: string, body: Record<string, string>): Promise<ShopifyTokenResponse> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof json.error === "string" ? json.error : `http_${res.status}`;
    throw new ShopifyOAuthError(code, String(json.error_description ?? ""));
  }
  return {
    accessToken: String(json.access_token ?? ""),
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    grantedScopes: String(json.scope ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    expiresInSec: Number(json.expires_in ?? 0),
    refreshTokenExpiresInSec: typeof json.refresh_token_expires_in === "number" ? json.refresh_token_expires_in : null,
  };
}

export async function exchangeShopifyCodeForTokens(shop: string, code: string): Promise<ShopifyTokenResponse> {
  return tokenRequest(shop, {
    client_id: process.env.SHOPIFY_OAUTH_CLIENT_ID ?? "",
    client_secret: process.env.SHOPIFY_OAUTH_CLIENT_SECRET ?? "",
    code,
    // Mandatory for every new app since 2026-04-01 -- see the file header.
    // Omitting this would silently fall back to Shopify's legacy
    // non-expiring token shape, which this codebase has no refresh
    // machinery for and does not want: a token that never expires is a
    // bigger liability if it ever leaked than one that self-limits to an
    // hour.
    expiring: "1",
  });
}

/**
 * Refreshes an expiring offline access token. Shopify returns a NEW
 * refresh token on every call, replacing the old one -- the caller MUST
 * persist both the new access token AND the new refresh token, never just
 * the access token, or the NEXT refresh will present a refresh token
 * Shopify has already invalidated.
 */
export async function refreshShopifyToken(shop: string, refreshToken: string): Promise<ShopifyTokenResponse> {
  return tokenRequest(shop, {
    client_id: process.env.SHOPIFY_OAUTH_CLIENT_ID ?? "",
    client_secret: process.env.SHOPIFY_OAUTH_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    expiring: "1",
  });
}
