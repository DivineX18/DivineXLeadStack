import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { returnOrigin } from "@/lib/google/return-host";
import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { tenantSecretsConfigured } from "@/lib/crypto/secrets";
import {
  buildShopifyOAuthUrl,
  normalizeShopDomain,
  shopifyOAuthConfigured,
  shopifyRedirectUri,
  signShopifyState,
  SHOPIFY_SCOPES,
} from "@/lib/shopify/oauth";

/**
 * Start the Shopify connect flow for a workspace.
 *
 *   GET /api/sub-accounts/[id]/shopify/connect?shop=divinex-test-store
 *
 * Sub-account admin only. Mirrors google/connect/route.ts exactly: every
 * guard miss redirects back to Settings with a `?shopify=…` status rather
 * than throwing, because this is a browser navigation into a consent flow,
 * not an API call a client can retry.
 *
 * `shop` is required here (unlike Google, which has no equivalent of "which
 * account" at the authorize step) because Shopify's authorize URL is
 * itself scoped to one shop domain: https://{shop}/admin/oauth/authorize.
 */

function appBase(request: Request): string {
  return returnOrigin(request);
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const settingsUrl = new URL(`/sa/${id}/dashboard/settings`, appBase(request));
  const stop = (status: string) => {
    settingsUrl.searchParams.set("shopify", status);
    return NextResponse.redirect(settingsUrl);
  };

  if (!shopifyOAuthConfigured()) return stop("not_configured");
  // Both tokens are stored encrypted (see ShopifyConfig's doc comment), so
  // without the key there is nowhere safe to put them -- refuse BEFORE
  // sending the operator through a consent flow whose result would have
  // to be thrown away.
  if (!tenantSecretsConfigured()) return stop("secrets_not_configured");

  // Observations land in Ascend keyed by the linked business profile,
  // exactly like the Google Ads bridge. Without that link there is
  // nowhere for a sync to put what it collects.
  const mapping = await getMappingBySubAccountId(id).catch(() => null);
  if (!mapping?.primaryAscendBusinessProfileId || mapping.status === "archived") {
    return stop("no_business_profile");
  }

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  if (!snap.exists) return stop("not_found");

  const redirectUri = shopifyRedirectUri();
  if (!redirectUri) return stop("not_configured");

  const shopParam = new URL(request.url).searchParams.get("shop");
  const shop = shopParam ? normalizeShopDomain(shopParam) : null;
  if (!shop) return stop("invalid_shop");

  const nonce = crypto.randomBytes(16).toString("hex");
  return NextResponse.redirect(
    buildShopifyOAuthUrl({
      shop,
      redirectUri,
      state: signShopifyState(id, nonce, shop),
      scopes: SHOPIFY_SCOPES,
    }),
  );
}
