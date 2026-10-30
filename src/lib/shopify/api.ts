import "server-only";

import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { refreshShopifyToken } from "@/lib/shopify/oauth";
import type { ShopifyConfig } from "@/types";

function toMillis(v: Timestamp | FieldValue | null): number | null {
  return v instanceof Timestamp ? v.toMillis() : null;
}

/**
 * Returns a valid access token for this workspace's Shopify connection,
 * refreshing and PERSISTING (both the new access token AND the new
 * refresh token) first if the current access token is at or near expiry.
 *
 * Unlike Google (lib/google/api.ts's accessTokenForConfig refreshes
 * unconditionally on every call, because Google's refresh token doesn't
 * change), this checks expiry first and only refreshes when needed --
 * Shopify issues a NEW refresh token on every refresh call, invalidating
 * the old one, so refreshing unconditionally on every single API call
 * would mean every concurrent call races to invalidate the others'
 * refresh token. Checking expiry first keeps refreshes rare (roughly
 * hourly) rather than per-call.
 *
 * subAccountId is required (Google's equivalent only needs the config)
 * specifically so a refresh can be persisted back to Firestore -- the OLD
 * refresh token stops working the moment this function uses it, so a
 * refreshed-but-not-persisted token would break the VERY NEXT call.
 */
export async function accessTokenForShopifyConfig(subAccountId: string, config: ShopifyConfig): Promise<string> {
  const expiresAt = toMillis(config.accessTokenExpiresAt);
  const now = Date.now();
  // 60s buffer, same margin Shopify's own documentation recommends, so a
  // token doesn't expire mid-flight during a slow request.
  if (expiresAt && expiresAt - now > 60_000) {
    return decryptSecret(config.accessTokenEncrypted);
  }

  const refreshToken = decryptSecret(config.refreshTokenEncrypted);
  const tokens = await refreshShopifyToken(config.shop, refreshToken);
  if (!tokens.refreshToken) {
    // Refreshing an expiring token should always return a new refresh
    // token per Shopify's documented behavior. Absent is a signal
    // something about the connection has changed in a way this code
    // doesn't understand -- refuse rather than store a token with no
    // further refresh path.
    throw new Error("Shopify refresh response carried no refresh token");
  }

  const updated: Partial<ShopifyConfig> = {
    accessTokenEncrypted: encryptSecret(tokens.accessToken),
    refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
    accessTokenExpiresAt: Timestamp.fromMillis(Date.now() + tokens.expiresInSec * 1000),
    refreshTokenExpiresAt: tokens.refreshTokenExpiresInSec
      ? Timestamp.fromMillis(Date.now() + tokens.refreshTokenExpiresInSec * 1000)
      : config.refreshTokenExpiresAt,
  };
  await getAdminDb().doc(`subAccounts/${subAccountId}`).set(
    { shopifyConfig: updated, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  return tokens.accessToken;
}
