import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { createAscendIntelligenceClient } from "@/lib/intelligence/ascend-intelligence-client";
import { accessTokenForShopifyConfig } from "@/lib/shopify/api";
import { fetchShopifyEvidence } from "@/lib/shopify/evidence-fetch";
import type { SubAccountDoc } from "@/types";

/**
 * Send this workspace's Shopify commerce evidence to Ascend.
 *
 *   POST /api/sub-accounts/[id]/shopify/sync
 *
 * The one place commerce data crosses from Flow into the intelligence
 * layer. Mirrors google/ads-sync/route.ts exactly: tenancy comes from the
 * stored connection + the workspace's business-profile mapping, NEITHER
 * from the caller, so there is no parameter that could point one
 * workspace's evidence at another's profile.
 *
 * Read-only against Shopify (only the orders query, never a mutation).
 * The only write is the observation Ascend records, plus a possible
 * token-refresh write on this workspace's own shopifyConfig if the access
 * token had expired.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  if (!snap.exists) return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  const config = (snap.data() as SubAccountDoc).shopifyConfig ?? null;

  if (!config?.connected) {
    return NextResponse.json({ error: "Shopify is not connected for this workspace" }, { status: 400 });
  }

  const mapping = await getMappingBySubAccountId(id).catch(() => null);
  const businessProfileId = mapping?.primaryAscendBusinessProfileId ?? null;
  if (!businessProfileId || mapping?.status === "archived") {
    return NextResponse.json(
      { error: "no_business_profile", detail: "This workspace is not linked to an Ascend business profile." },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    accessToken = await accessTokenForShopifyConfig(id, config);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await getAdminDb().doc(`subAccounts/${id}`).set(
      { shopifyConfig: { lastSyncError: `token_refresh_failed: ${detail}` } },
      { merge: true },
    );
    return NextResponse.json({ error: "token_refresh_failed", detail }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as { days?: unknown };
  const days = typeof body.days === "number" && body.days > 0 && body.days <= 90 ? Math.floor(body.days) : 30;

  const result = await fetchShopifyEvidence({
    shop: config.shop,
    accessToken,
    days,
    syncRunId: `${id}:${Date.now()}`,
  });

  if (!result.ok) {
    if (result.error === "no_orders_in_window") {
      // Nothing delivered. Recording zero would make "no orders this
      // window" indistinguishable from "the sync never ran" -- say what
      // happened instead, same reasoning as the Ads bridge's empty-window
      // handling.
      return NextResponse.json({ sent: false, reason: result.error, shop: result.shop, days }, { status: 200 });
    }
    await getAdminDb().doc(`subAccounts/${id}`).set(
      { shopifyConfig: { lastSyncError: result.detail } },
      { merge: true },
    );
    return NextResponse.json({ sent: false, error: result.error, detail: result.detail }, { status: 502 });
  }

  const client = createAscendIntelligenceClient();
  const outcome = await client.postShopifyEvidence(businessProfileId, result.evidence);

  if (!outcome.ok) {
    await getAdminDb().doc(`subAccounts/${id}`).set(
      { shopifyConfig: { lastSyncError: `bridge:${outcome.code}: ${outcome.message}` } },
      { merge: true },
    );
    return NextResponse.json(
      { sent: false, bridgeError: { code: outcome.code, message: outcome.message }, window: result.evidence.window },
      { status: 502 },
    );
  }

  await getAdminDb().doc(`subAccounts/${id}`).set(
    { shopifyConfig: { lastSyncedAt: FieldValue.serverTimestamp(), lastSyncError: null } },
    { merge: true },
  );

  return NextResponse.json({
    sent: true,
    businessProfileId,
    shop: result.evidence.shop,
    window: result.evidence.window,
    currencyCode: result.evidence.currencyCode,
    timeZone: result.evidence.timeZone,
    orders: result.evidence.orders.length,
    ascend: outcome.data,
  });
}
