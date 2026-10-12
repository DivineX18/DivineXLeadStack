import "server-only";

import crypto from "node:crypto";

/**
 * Google OAuth for Growth Intelligence: ONE connection per workspace that
 * powers GA4, Search Console and Google Ads reporting.
 *
 * Modelled directly on lib/comms/meta.ts, which is the only complete OAuth
 * implementation in either repo. Same shape, same signed-state trick, same
 * single-shared-redirect-URI rule. Two deliberate differences:
 *
 *   1. The refresh token is ENCRYPTED at rest (see storeGoogleConnection in
 *      the callback). `metaConfig.pageAccessToken` is stored in the clear
 *      because that predates lib/crypto/secrets.ts; a Google refresh token is
 *      long-lived read access to a client's analytics, and firestore.rules
 *      lets ANY active member read the whole subAccounts doc client-side. So
 *      it gets the same treatment as the BYO-Stripe key and the GHL token.
 *   2. The redirect URI is an explicit env var rather than derived from
 *      NEXT_PUBLIC_APP_URL, because that is https://crm.divinex.io while the
 *      people connecting are on https://app.divinex.io. Deriving it would
 *      bounce the user across hosts mid-consent.
 */

/** Read-only reporting, plus the identity scopes needed to name the account. */
export const GOOGLE_SCOPES = {
  identity: ["openid", "email", "profile"],
  /** GA4 Data API. Read-only variant exists and is what we use. */
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  /** Search Console API. Read-only variant exists and is what we use. */
  searchConsole: "https://www.googleapis.com/auth/webmasters.readonly",
  /**
   * Google Ads API. There is NO read-only variant — `adwords` is read/write.
   * We only ever issue reporting queries; the grant itself cannot be narrowed,
   * which is a fact to state plainly in the OAuth verification justification
   * rather than paper over.
   */
  ads: "https://www.googleapis.com/auth/adwords",
} as const;

export type GoogleService = "ga4" | "searchConsole" | "ads";

/**
 * The scopes to request. Services are opt-in per connect so a workspace that
 * only wants GA4 is never asked to hand over Ads access it will not use —
 * Google's consent screen shows every scope, and asking for more than you need
 * is the fastest way to lose a client at the dialog.
 */
export function googleScopeList(services: GoogleService[]): string[] {
  const scopes: string[] = [...GOOGLE_SCOPES.identity];
  for (const s of services) scopes.push(GOOGLE_SCOPES[s]);
  return [...new Set(scopes)];
}

/** True when the deployment has Google OAuth credentials. Gate every connect on this. */
export function googleConfigured(): boolean {
  return (
    !!process.env.GOOGLE_OAUTH_CLIENT_ID &&
    !!process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    !!googleRedirectUri()
  );
}

/**
 * ONE redirect URI for the whole deployment, registered verbatim in the Google
 * Cloud console. Explicit rather than derived — see the header note. Falls back
 * to NEXT_PUBLIC_APP_URL so a local dev run works without extra setup.
 */
export function googleRedirectUri(): string | null {
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return base ? `${base}/api/google/callback` : null;
}

/**
 * THE ADS GATE. One function, deliberately — this is the single place that
 * decides whether Ads is offered, and changing how Ads access is proven is a
 * one-line change here rather than an edit across the connect route, the
 * callback and the capability derivation.
 *
 * Today it tests for a developer token, because the Ads API refuses every
 * request without one. That may stop being the right test: Google moved Ads
 * API access management into the Cloud console with Test and Explorer tiers,
 * and an approved Explorer project does not visibly issue a developer token.
 * Until that resolves, the behaviour stays as-is and fails SAFE: with no
 * token, Ads is dropped from the consent request entirely rather than asking
 * a client for write-capable access the deployment cannot use.
 *
 * Dropping Ads never blocks Analytics or Search Console — see
 * googleScopeList() and the connect route, which keep the remaining services.
 */
export function googleAdsConfigured(): boolean {
  return !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
}

// ── CSRF state ───────────────────────────────────────────────────────────────
// HMAC-signed with the existing AUTOMATIONS_TOKEN_SECRET so the callback can
// trust that `state` came from our connect route and names the right workspace.
// Identical construction to signMetaState; the `googlestate:` prefix is what
// stops a state minted for one provider being replayed at the other.

function stateSecret(): string {
  return process.env.AUTOMATIONS_TOKEN_SECRET ?? "";
}

export function signGoogleState(
  subAccountId: string,
  nonce: string,
  services: GoogleService[],
): string {
  const payload = `${subAccountId}.${nonce}.${services.join("-")}`;
  const sig = crypto
    .createHmac("sha256", stateSecret())
    .update(`googlestate:${payload}`)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifyGoogleState(
  state: string,
): { subAccountId: string; services: GoogleService[] } | null {
  if (!stateSecret()) return null;
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [subAccountId, nonce, servicesRaw, sig] = parts;
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(`googlestate:${subAccountId}.${nonce}.${servicesRaw}`)
    .digest("hex");
  // Constant-time, and length-checked first because timingSafeEqual throws on
  // mismatched lengths.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const services = servicesRaw
    .split("-")
    .filter((s): s is GoogleService => s === "ga4" || s === "searchConsole" || s === "ads");
  return { subAccountId, services };
}

// ── authorize ────────────────────────────────────────────────────────────────

export function buildGoogleOAuthUrl(opts: {
  redirectUri: string;
  state: string;
  scopes: string[];
  /** Pre-fills the account chooser. Never trusted for authorization. */
  loginHint?: string | null;
}): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", process.env.GOOGLE_OAUTH_CLIENT_ID ?? "");
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", opts.scopes.join(" "));
  u.searchParams.set("state", opts.state);
  // offline + consent is what guarantees a refresh token. Without BOTH, a
  // returning user who already granted these scopes gets an access token and
  // NO refresh token, and the nightly sync silently dies a day later with
  // nothing in the logs to explain it.
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  if (opts.loginHint) u.searchParams.set("login_hint", opts.loginHint);
  return u.toString();
}

// ── token exchange + refresh ────────────────────────────────────────────────

export interface GoogleTokenResponse {
  accessToken: string;
  /** Present only on the first consent for a given user+client. */
  refreshToken: string | null;
  expiresInSec: number;
  /** Space-delimited list of what Google ACTUALLY granted. */
  grantedScopes: string[];
}

async function tokenRequest(body: Record<string, string>): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Surface Google's own error code; it is the difference between "the user
    // revoked us" and "our client secret is wrong", and guessing wastes hours.
    const code = typeof json.error === "string" ? json.error : `http_${res.status}`;
    throw new GoogleOAuthError(code, String(json.error_description ?? ""));
  }
  return {
    accessToken: String(json.access_token ?? ""),
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresInSec: Number(json.expires_in ?? 0),
    grantedScopes: String(json.scope ?? "").split(" ").filter(Boolean),
  };
}

export class GoogleOAuthError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string = "",
  ) {
    super(`google oauth: ${code}${detail ? ` (${detail})` : ""}`);
  }
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  return tokenRequest({
    code,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

/**
 * Mint a short-lived access token from a stored refresh token.
 *
 * Access tokens are never persisted — they live for the duration of one sync
 * run. Persisting them would mean storing a second credential that expires in
 * an hour, for no benefit.
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
  });
}

/**
 * Revoke a refresh token at Google.
 *
 * Deleting our copy is NOT a disconnect: the grant keeps living in the
 * customer's Google account, where it shows as an app with standing access to
 * their analytics. Telling someone they have disconnected while that remains
 * true would make the privacy policy's disconnect promise false.
 *
 * Best-effort by design. An already-revoked or expired token returns 400 from
 * Google, which is the desired end state, not a failure — so the caller must
 * still clear local state whatever happens here.
 */
export async function revokeRefreshToken(refreshToken: string): Promise<{ revoked: boolean; reason: string | null }> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }).toString(),
    });
    if (res.ok) return { revoked: true, reason: null };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    // Already invalid means the grant is gone, which is what we wanted.
    if (body.error === "invalid_token") return { revoked: true, reason: "already_invalid" };
    return { revoked: false, reason: body.error ?? `http_${res.status}` };
  } catch (err) {
    return { revoked: false, reason: err instanceof Error ? err.name : "network_error" };
  }
}

/** The connected Google account's email, for display in the settings card. */
export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<{ email: string | null; sub: string | null }> {
  try {
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { email: null, sub: null };
    const j = (await res.json()) as { email?: string; sub?: string };
    return { email: j.email ?? null, sub: j.sub ?? null };
  } catch {
    // Display sugar only. A connection that works but cannot name itself is
    // still a working connection, so never fail the connect over this.
    return { email: null, sub: null };
  }
}
