import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { returnOrigin } from "@/lib/google/return-host";
import { encryptSecret, tenantSecretsConfigured } from "@/lib/crypto/secrets";
import {
  exchangeShopifyCodeForTokens,
  isValidShopDomain,
  shopifyOAuthConfigured,
  verifyShopifyCallbackHmac,
  verifyShopifyState,
  SHOPIFY_SCOPES,
  ShopifyOAuthError,
} from "@/lib/shopify/oauth";
import type { ShopifyConfig, SubAccountDoc } from "@/types";

/**
 * The single shared OAuth callback for Shopify.
 *
 *   GET /api/shopify/callback?code=…&state=…&shop=…&hmac=…&timestamp=…
 *
 * Mirrors google/callback/route.ts's security ordering exactly, PLUS one
 * check Google has no equivalent of: Shopify signs its own callback with
 * an `hmac` param, independent of our `state`. Order, and why it matters:
 *
 *   1. Our state FIRST -- without it we have no trustworthy workspace id
 *      at all, so there is nothing yet worth checking further.
 *   2. Shopify's hmac SECOND -- proves this specific callback request
 *      came from Shopify's own servers, not merely that someone knows a
 *      valid state (state alone doesn't prove the code param is genuine).
 *   3. The `shop` param must match BOTH our state's shop AND pass
 *      Shopify's own domain pattern -- an attacker controlling the
 *      network could replay a valid state against a different shop param
 *      otherwise.
 *   4. Only THEN do we require the caller be that workspace's admin.
 *      Doing it before step 1 would let an attacker's forged state choose
 *      which workspace's admin-check even runs.
 */

function appBase(request: Request): string {
  return returnOrigin(request);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const shopParam = url.searchParams.get("shop");

  if (!state) {
    return NextResponse.redirect(new URL("/agency/sub-accounts?shopify=bad_state", appBase(request)));
  }
  const verified = verifyShopifyState(state);
  if (!verified) {
    return NextResponse.redirect(new URL("/agency/sub-accounts?shopify=bad_state", appBase(request)));
  }
  const id = verified.subAccountId;

  // Shopify's own signature on this specific callback, not just our state.
  if (!verifyShopifyCallbackHmac(url.searchParams)) {
    console.error("[shopify/callback] hmac verification failed", { subAccountId: id });
    return NextResponse.redirect(new URL("/agency/sub-accounts?shopify=bad_hmac", appBase(request)));
  }

  // The shop in the callback must be the SAME shop the state was signed
  // for, and must itself look like a real myshopify.com domain.
  if (!shopParam || !isValidShopDomain(shopParam) || shopParam !== verified.shop) {
    console.error("[shopify/callback] shop mismatch", { subAccountId: id, expected: verified.shop, got: shopParam });
    return NextResponse.redirect(new URL("/agency/sub-accounts?shopify=shop_mismatch", appBase(request)));
  }
  const shop = shopParam;

  // Only now that the workspace id is HMAC-authenticated (by OUR state) do
  // we authorize the caller against it.
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const settingsUrl = new URL(`/sa/${id}/dashboard/settings`, appBase(request));
  const finish = (status: string) => {
    settingsUrl.searchParams.set("shopify", status);
    return NextResponse.redirect(settingsUrl);
  };

  if (!code) return finish("cancelled");
  if (!shopifyOAuthConfigured()) return finish("not_configured");
  if (!tenantSecretsConfigured()) return finish("secrets_not_configured");

  let tokens;
  try {
    tokens = await exchangeShopifyCodeForTokens(shop, code);
  } catch (err) {
    console.error("[shopify/callback] token exchange failed", {
      subAccountId: id,
      code: err instanceof ShopifyOAuthError ? err.code : "unknown",
    });
    return finish("exchange_failed");
  }

  // Requested expiring=1; a response with no refresh token means Shopify
  // issued the legacy permanent-token shape instead, which this codebase
  // has no refresh machinery for. Refused rather than stored half-usable.
  if (!tokens.refreshToken) {
    console.error("[shopify/callback] no refresh token returned", { subAccountId: id });
    return finish("no_refresh_token");
  }

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  if (!snap.exists) return finish("not_found");
  const existing = (snap.data() as SubAccountDoc).shopifyConfig ?? null;

  const now = Date.now();
  const config: ShopifyConfig = {
    connected: true,
    shop,
    accessTokenEncrypted: encryptSecret(tokens.accessToken),
    refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
    accessTokenExpiresAt: Timestamp.fromMillis(now + tokens.expiresInSec * 1000),
    refreshTokenExpiresAt: tokens.refreshTokenExpiresInSec
      ? Timestamp.fromMillis(now + tokens.refreshTokenExpiresInSec * 1000)
      : null,
    grantedScopes: tokens.grantedScopes,
    connectedByUid: access.uid,
    connectedAt: FieldValue.serverTimestamp(),
    // A reconnect to the SAME shop keeps the last successful sync
    // timestamp; a reconnect naming a DIFFERENT shop (the operator
    // disconnected and connected a different store) starts fresh, same
    // reasoning as GoogleConfig clearing property selections on a
    // different account.
    lastSyncedAt: existing?.shop === shop ? (existing?.lastSyncedAt ?? null) : null,
    lastSyncError: null,
  };

  await getAdminDb().doc(`subAccounts/${id}`).set(
    { shopifyConfig: config, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  const missingScopes = SHOPIFY_SCOPES.filter((s) => !tokens.grantedScopes.includes(s));
  return finish(missingScopes.length === 0 ? "connected" : `partial:${missingScopes.join("-")}`);
}
