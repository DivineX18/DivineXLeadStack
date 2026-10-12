import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getMappingBySubAccountId } from "@/lib/workspace/workspace-mappings-service";
import { tenantSecretsConfigured } from "@/lib/crypto/secrets";
import {
  buildGoogleOAuthUrl,
  googleAdsConfigured,
  googleConfigured,
  googleRedirectUri,
  googleScopeList,
  signGoogleState,
  type GoogleService,
} from "@/lib/google/oauth";

/**
 * Start the Google connect flow for a workspace.
 *
 *   GET /api/sub-accounts/[id]/google/connect?services=ga4,searchConsole,ads
 *
 * Sub-account admin only. Mirrors the Meta connect route: every guard miss
 * redirects back to Settings with a `?google=…` status rather than throwing,
 * because this is a browser navigation, not an API call, and a raw 500 in the
 * middle of a consent flow tells the operator nothing.
 *
 * Services are opt-in. Google's consent screen lists every requested scope, so
 * asking for Ads access from a client who only wants GA4 is how you lose them
 * at the dialog.
 */

function appBase(request: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}

function parseServices(raw: string | null): GoogleService[] {
  const valid: GoogleService[] = ["ga4", "searchConsole", "ads"];
  if (!raw) return ["ga4", "searchConsole"];
  const asked = raw.split(",").map((s) => s.trim());
  const picked = valid.filter((v) => asked.includes(v));
  return picked.length ? picked : ["ga4", "searchConsole"];
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const settingsUrl = new URL(`/sa/${id}/dashboard/settings`, appBase(request));
  const stop = (status: string) => {
    settingsUrl.searchParams.set("google", status);
    return NextResponse.redirect(settingsUrl);
  };

  if (!googleConfigured()) return stop("not_configured");

  // The refresh token is stored encrypted, so without the key there is nowhere
  // safe to put it. Refuse BEFORE sending the operator through a consent flow
  // whose result we would have to throw away.
  if (!tenantSecretsConfigured()) return stop("secrets_not_configured");

  let services = parseServices(new URL(request.url).searchParams.get("services"));

  // The `adwords` scope is useless without a developer token, which is a
  // separate approval under a Google Ads manager account. Asking a client to
  // grant write-capable Ads access we cannot yet use is the worst of both
  // worlds, so drop it rather than request it.
  if (services.includes("ads") && !googleAdsConfigured()) {
    services = services.filter((s) => s !== "ads");
    if (services.length === 0) return stop("ads_not_configured");
  }

  // Metrics land in Ascend, keyed by the linked business profile. Without that
  // link there is nowhere to put what we would collect, and a connection that
  // silently discards every sync is worse than no connection.
  const mapping = await getMappingBySubAccountId(id).catch(() => null);
  if (!mapping?.primaryAscendBusinessProfileId || mapping.status === "archived") {
    return stop("no_business_profile");
  }

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  if (!snap.exists) return stop("not_found");

  const redirectUri = googleRedirectUri();
  if (!redirectUri) return stop("not_configured");

  const nonce = crypto.randomBytes(16).toString("hex");
  return NextResponse.redirect(
    buildGoogleOAuthUrl({
      redirectUri,
      state: signGoogleState(id, nonce, services),
      scopes: googleScopeList(services),
    }),
  );
}
