import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { accessTokenForConfig, listGa4Properties, listSearchConsoleSites } from "@/lib/google/api";
import type { SubAccountDoc } from "@/types";

/**
 * The property/site picker behind the settings card.
 *
 *   GET   — what this Google account can read, so the admin chooses by name
 *   PATCH — which property/site this workspace reports on
 *
 * Admin only. GET is a live call to Google rather than a cached list: the set
 * changes outside this app, and offering a stale property that no longer
 * exists produces a sync that fails daily for a reason nobody can see.
 */

async function loadConfig(subAccountId: string) {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  return snap.exists ? ((snap.data() as SubAccountDoc).googleConfig ?? null) : null;
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const config = await loadConfig(id);
  if (!config?.connected) {
    return NextResponse.json({ error: "Google isn't connected." }, { status: 409 });
  }

  let token: string;
  try {
    token = await accessTokenForConfig(config);
  } catch {
    // Deliberately vague to the client, specific in the log: a token error
    // here means the grant is gone, and the remedy is reconnecting.
    return NextResponse.json(
      { error: "Google access has expired. Reconnect to continue.", reconnect: true },
      { status: 409 },
    );
  }

  // One service failing must not blank the other's picker.
  const [ga4, sites] = await Promise.all([
    listGa4Properties(token).catch(() => []),
    listSearchConsoleSites(token).catch(() => []),
  ]);
  return NextResponse.json({ ga4, sites });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  let body: { ga4PropertyId?: unknown; gscSiteUrl?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const config = await loadConfig(id);
  if (!config?.connected) {
    return NextResponse.json({ error: "Google isn't connected." }, { status: 409 });
  }

  // Only the two selections are patchable. Tokens, scopes and capabilities are
  // written by the OAuth callback from what Google actually returned, and must
  // never be settable by a client request.
  const patch: Record<string, unknown> = {};
  if ("ga4PropertyId" in body) {
    const v = body.ga4PropertyId;
    patch["googleConfig.ga4PropertyId"] =
      typeof v === "string" && /^\d{1,20}$/.test(v) ? v : null;
  }
  if ("gscSiteUrl" in body) {
    const v = body.gscSiteUrl;
    patch["googleConfig.gscSiteUrl"] = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  patch.updatedAt = FieldValue.serverTimestamp();

  await getAdminDb().doc(`subAccounts/${id}`).update(patch);
  return NextResponse.json({ ok: true });
}
