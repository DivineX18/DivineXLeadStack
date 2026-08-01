import "server-only";

import Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { decryptSecret } from "@/lib/crypto/secrets";
import type { SubAccountStripeConfig } from "@/types/tenancy";

/**
 * Per-tenant Stripe client — the sub-account's OWN account, decrypted
 * fresh from `subAccounts/{id}.stripeConfig` on every call. Deliberately
 * NOT cached module-level like `lib/stripe/server.ts::getStripeServer()`
 * (the agency-wide singleton) — a per-tenant client can't safely be
 * shared the way one deployment-wide client can.
 */
export async function getStripeForTenant(subAccountId: string): Promise<{
  stripe: Stripe;
  config: SubAccountStripeConfig;
} | null> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const config = snap.data()?.stripeConfig as SubAccountStripeConfig | undefined;
  if (!config) return null;
  const secretKey = decryptSecret(config.secretKeyEncrypted);
  return { stripe: new Stripe(secretKey), config };
}

export function subAccountStripeIsConnected(
  stripeConfig: SubAccountStripeConfig | null | undefined,
): boolean {
  return !!stripeConfig && stripeConfig.status === "connected";
}
