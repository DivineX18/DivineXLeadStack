import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { googleCan } from "@/lib/google/capabilities";
import { googleAdsManagerCustomerId } from "@/lib/google/oauth";
import { accessTokenForConfig } from "@/lib/google/api";
import {
  CUSTOMER_CLIENT_QUERY,
  CUSTOMER_METADATA_QUERY,
  GOOGLE_ADS_API_VERSION,
  adsSearch,
  customerIdFromResourceName,
  listAccessibleCustomers,
  type AdsCall,
} from "@/lib/google/ads";
import type { SubAccountDoc } from "@/types";

/**
 * Which Google Ads accounts this workspace's connection can report on.
 *
 *   GET /api/sub-accounts/[id]/google/ads-accounts
 *
 * The Ads analogue of the GA4 and Search Console pickers in
 * /google/properties, and read-only in the same way.
 *
 * TENANCY. The target is derived entirely server-side, from the workspace's
 * OWN stored Google connection. No customer id is accepted from the caller,
 * which is the whole safety property: an id in a request body would let one
 * workspace aim this at an account authorized to another, and ten digits
 * someone typed prove access to nothing. The only customer ids this will ever
 * touch are the ones Google itself returned for this connection's credentials.
 *
 * THIS VERSION RETURNS RESPONSES UNPARSED, deliberately. The typed reader and
 * its fixtures land in the next change, written against what Google actually
 * sent rather than against what the documentation implies it will send. The
 * failure being avoided is specific and has happened here before: a reader
 * that looked up a key which never existed, with a fixture asserting the same
 * key, so the tests confirmed the bug instead of catching it.
 */

/** A hierarchy this size is a configuration mistake, not a real agency. The cap
 *  exists so one call cannot fan out into hundreds of queries against the
 *  account's Explorer-tier quota of 2,880 operations a day. */
const MAX_ACCOUNTS_INSPECTED = 10;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const config = (snap.data() as SubAccountDoc).googleConfig ?? null;

  if (!config?.connected) {
    return NextResponse.json({ error: "Google is not connected for this workspace" }, { status: 400 });
  }
  // Google's GRANTED scope, not what we asked for. A workspace that declined
  // Ads in the dialog must not reach the Ads API on the strength of a request.
  if (!googleCan(config, "ads")) {
    return NextResponse.json(
      { error: "This workspace has not granted Google Ads access. Reconnect and approve Ads." },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    accessToken = await accessTokenForConfig(config);
  } catch (err) {
    // invalid_grant means the client revoked us or the token expired. Say which
    // rather than reporting it as an Ads failure, because the fix is a
    // reconnect and not a retry.
    return NextResponse.json(
      { error: "token_refresh_failed", detail: err instanceof Error ? err.message : "unknown" },
      { status: 502 },
    );
  }

  // Step 1: who can these credentials act on directly? Per Google's
  // listing-accounts guide this endpoint ignores login-customer-id, so none is
  // sent; attaching one would be cargo cult.
  const accessible = await listAccessibleCustomers(accessToken);

  const resourceNames = (() => {
    const b = accessible.body as { resourceNames?: unknown } | null;
    return Array.isArray(b?.resourceNames) ? (b.resourceNames as unknown[]) : [];
  })();

  // The manager id is deployment config and is used ONLY as a fallback login
  // context, never as a target. Reaching a client account through a manager
  // requires the header; an account shared directly does not.
  const managerId = googleAdsManagerCustomerId();

  const inspected: {
    resourceName: unknown;
    customerId: string | null;
    /** No login-customer-id. The first thing to try for a directly-shared account. */
    direct: AdsCall | null;
    /** Same query under the manager login context, tried only if direct failed,
     *  so the real semantics are established by observation rather than belief. */
    viaManager: AdsCall | null;
    /** Populated only for an account that reports itself a manager. */
    clients: AdsCall | null;
  }[] = [];

  for (const resourceName of resourceNames.slice(0, MAX_ACCOUNTS_INSPECTED)) {
    const customerId = customerIdFromResourceName(resourceName);
    if (!customerId) {
      inspected.push({ resourceName, customerId: null, direct: null, viaManager: null, clients: null });
      continue;
    }

    const direct = await adsSearch(accessToken, customerId, CUSTOMER_METADATA_QUERY, { pageSize: 1 });
    const viaManager =
      !direct.ok && managerId && managerId !== customerId
        ? await adsSearch(accessToken, customerId, CUSTOMER_METADATA_QUERY, {
            loginCustomerId: managerId,
            pageSize: 1,
          })
        : null;

    const winner = direct.ok ? direct : viaManager?.ok ? viaManager : null;
    const isManager = (() => {
      const rows = (winner?.body as { results?: { customer?: { manager?: unknown } }[] } | null)?.results;
      return Array.isArray(rows) && rows[0]?.customer?.manager === true;
    })();

    // A manager account holds no campaigns of its own, so enumerating its
    // children is the only way to find a real reporting target.
    const clients = isManager
      ? await adsSearch(accessToken, customerId, CUSTOMER_CLIENT_QUERY, { loginCustomerId: customerId })
      : null;

    inspected.push({ resourceName, customerId, direct, viaManager, clients });
  }

  return NextResponse.json({
    apiVersion: GOOGLE_ADS_API_VERSION,
    developerTokenSent: false,
    managerLoginCustomerIdConfigured: managerId !== null,
    accessible,
    accessibleCount: resourceNames.length,
    inspected,
  });
}
