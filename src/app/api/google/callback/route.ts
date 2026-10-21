import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { returnOrigin } from "@/lib/google/return-host";
import { encryptSecret, tenantSecretsConfigured } from "@/lib/crypto/secrets";
import { deriveGoogleCapabilities } from "@/lib/google/capabilities";
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  googleConfigured,
  googleRedirectUri,
  verifyGoogleState,
  GoogleOAuthError,
} from "@/lib/google/oauth";
import type { GoogleConfig, SubAccountDoc } from "@/types";

/**
 * The single shared OAuth callback for Google.
 *
 *   GET /api/google/callback?code=…&state=…
 *
 * ONE redirect URI is registered for the whole deployment (Google requires an
 * exact match, so a per-workspace path would mean re-registering for every
 * client). The workspace travels in the HMAC-signed `state`, and is recovered
 * and authenticated from there rather than from the URL.
 *
 * Security order matters and mirrors the Meta callback: verify `state` FIRST,
 * because until it is verified we have no trustworthy workspace id, and only
 * then require the caller be that workspace's admin. Doing it the other way
 * round would let an attacker's `state` choose which workspace to write.
 */

/** Return to the host the operator is actually on — see returnOrigin.
 *  NEXT_PUBLIC_APP_URL is crm.divinex.io while people connect from
 *  app.divinex.io, and bouncing between them looks like being logged out. */
function appBase(request: Request): string {
  return returnOrigin(request);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const declined = url.searchParams.get("error");

  // Without a valid state we cannot even tell whose settings page to return
  // to, so land somewhere safe rather than guessing.
  if (!state) {
    return NextResponse.redirect(new URL("/agency/sub-accounts?google=bad_state", appBase(request)));
  }
  const verified = verifyGoogleState(state);
  if (!verified) {
    return NextResponse.redirect(new URL("/agency/sub-accounts?google=bad_state", appBase(request)));
  }
  const id = verified.subAccountId;

  // Only now that the workspace id is HMAC-authenticated do we authorize.
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const settingsUrl = new URL(`/sa/${id}/dashboard/settings`, appBase(request));
  const finish = (status: string) => {
    settingsUrl.searchParams.set("google", status);
    return NextResponse.redirect(settingsUrl);
  };

  // The client closed the dialog or declined. Not an error worth alarming over.
  if (declined || !code) return finish("cancelled");
  if (!googleConfigured()) return finish("not_configured");
  if (!tenantSecretsConfigured()) return finish("secrets_not_configured");

  // Must be byte-identical to the redirect_uri sent at the authorize step, or
  // Google rejects the exchange.
  const redirectUri = googleRedirectUri();
  if (!redirectUri) return finish("not_configured");

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, redirectUri);
  } catch (err) {
    console.error("[google/callback] token exchange failed", {
      subAccountId: id,
      code: err instanceof GoogleOAuthError ? err.code : "unknown",
    });
    return finish("exchange_failed");
  }

  // No refresh token means no unattended sync tomorrow. This happens when a
  // returning user re-consents and Google decides nothing changed; we ask for
  // access_type=offline + prompt=consent precisely to avoid it, so if it still
  // happens we refuse rather than store a connection that dies within the hour
  // and reports no data with no explanation.
  if (!tokens.refreshToken) {
    console.error("[google/callback] no refresh token returned", { subAccountId: id });
    return finish("no_refresh_token");
  }

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  if (!snap.exists) return finish("not_found");
  const existing = (snap.data() as SubAccountDoc).googleConfig ?? null;

  const info = await fetchGoogleUserInfo(tokens.accessToken);

  // Capabilities come from what Google actually GRANTED, never from what we
  // asked for. A client can hand over GA4 and decline Ads in one dialog.
  const capabilities = deriveGoogleCapabilities(tokens.grantedScopes);

  // Reconnecting under a DIFFERENT Google account silently repoints every
  // report. Keep the selections only when it is the same account; otherwise
  // clear them so the operator must choose again against the new account,
  // rather than inheriting ids that belong to someone else's property.
  const sameAccount =
    !!existing?.accountSub && !!info.sub && existing.accountSub === info.sub;

  const config: GoogleConfig = {
    connected: true,
    refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
    accountEmail: info.email,
    accountSub: info.sub,
    grantedScopes: tokens.grantedScopes,
    capabilities,
    ga4PropertyId: sameAccount ? (existing?.ga4PropertyId ?? null) : null,
    gscSiteUrl: sameAccount ? (existing?.gscSiteUrl ?? null) : null,
    adsCustomerId: sameAccount ? (existing?.adsCustomerId ?? null) : null,
    // The whole Ads binding travels with the selection, for the same reason:
    // reconnecting under a DIFFERENT Google account must not leave a workspace
    // pointed at an Ads customer the new credentials were never authorized for.
    // Clearing it forces a fresh server-side verification against Google.
    adsLoginCustomerId: sameAccount ? (existing?.adsLoginCustomerId ?? null) : null,
    adsCustomerName: sameAccount ? (existing?.adsCustomerName ?? null) : null,
    adsCurrencyCode: sameAccount ? (existing?.adsCurrencyCode ?? null) : null,
    adsTimeZone: sameAccount ? (existing?.adsTimeZone ?? null) : null,
    adsBoundAt: sameAccount ? (existing?.adsBoundAt ?? null) : null,
    connectedByUid: access.uid,
    connectedAt: FieldValue.serverTimestamp(),
    lastSyncedAt: sameAccount ? (existing?.lastSyncedAt ?? null) : null,
    // A fresh grant invalidates whatever the previous failure was.
    lastSyncError: null,
  };

  await getAdminDb().doc(`subAccounts/${id}`).set(
    { googleConfig: config, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  // Tell the operator what they actually got. "connected" when a service they
  // asked for was declined would be a quiet lie they discover later as an
  // empty dashboard.
  const askedFor = verified.services;
  const missing = askedFor.filter((s) => !capabilities[s]);
  return finish(missing.length === 0 ? "connected" : `partial:${missing.join("-")}`);
}
